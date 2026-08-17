-- =============================================================================
-- Phase 7a — the nightly ingest: the spine
-- =============================================================================
-- Three sources (a mailbox, a calendar, Granola) become two kinds of record.
-- Things that already happened are `activities`, which already exist. Things
-- that have not happened yet are `next_steps`, which is new.
--
-- They are separate tables on purpose. Every index on activities is
-- (something, occurred_at desc), so a future-dated row would sit at the top of
-- every timeline until the day it happens; and fetchMyFocus computes "days
-- quiet" as now - max(occurred_at), so one meeting booked for Friday would make
-- an account read as touched today and drop off the follow-up list. A status
-- column on activities would also be meaningless on all 667 existing rows and
-- would have to be filtered by every query already written.
--
-- Nothing here writes to the CRM by itself except where a match is a fact — an
-- email address equal to exactly one contact's. Everything else is a row in
-- ingest_suggestions waiting for a person, and accepting one goes through
-- apply_gap_fill() so a whole night is one Undo button.


-- -----------------------------------------------------------------------------
-- 1. A machine account is a profile, not a service role key
-- -----------------------------------------------------------------------------
-- The nightly job signs in as a real Supabase user. That keeps the invariant
-- .env.local.example actually protects — the deployed app can never do more
-- than a signed-in member can do — and it means every row the job writes
-- carries a changed_by in audit_log, on a table whose whole purpose is "five
-- people editing shared records; track who changed what".
--
-- The profile must be is_active: is_member() requires it and RLS refuses every
-- write without it, so "hide it by deactivating" is not available the way it is
-- for Brendan and the two QA logins. This column is what hides it instead.
--
-- A column rather than a user_role value because `alter type ... add value`
-- cannot be used in the transaction that adds it, is_admin() branches on role,
-- and role means permission level while this means "is a person". They are
-- orthogonal — a service account could plausibly need admin one day.

alter table profiles add column is_service boolean not null default false;

comment on column profiles.is_service is
  'A machine account, not a person. Active, because RLS requires it — but never '
  'offered as an owner, since "who owns this account" must answer with somebody '
  'you can ring.';


-- -----------------------------------------------------------------------------
-- 2. Which company an email domain belongs to
-- -----------------------------------------------------------------------------
-- The middle confidence tier. An address matching no contact can still identify
-- a company by its domain — and when it does, only the ACCOUNT link is safe.
-- Which building, or which deal, is a guess even when the company is certain.
--
-- unique(domain) is the whole design. "Exactly one account or nothing" is
-- enforced by the constraint rather than counted at query time, so an ambiguous
-- domain fails loudly at insert instead of quietly at 3am.
--
-- The consequence is worth stating: cbre.com and jll.com can never be mapped,
-- because CBRE manages four Tufts Medicine buildings and JLL three, under
-- separate accounts. So this tier is quietest on the largest relationships in
-- the book. That is correct, and it is why it is a tier and not the answer.

create table account_domains (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  domain     text not null check (domain = lower(domain) and domain not like '%@%'),
  added_by   uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (domain)
);

create index account_domains_account_idx on account_domains (account_id);

comment on table account_domains is
  'Email domain -> account. unique(domain) is the point: a domain that could '
  'mean two accounts must mean neither.';

-- Never map these. One personal Gmail address on one contact would otherwise
-- file every private email the mailbox receives against a client account.
-- Beale's own domain is here too: internal mail is not client activity.
create function public.is_public_email_domain(p_domain text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_domain, '')) in (
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'yahoo.com', 'yahoo.co.uk', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
    'msn.com', 'comcast.net', 'verizon.net', 'sbcglobal.net', 'att.net',
    'proton.me', 'protonmail.com', 'gmx.com', 'zoho.com',
    'bealesllc.com'
  );
$$;

comment on function public.is_public_email_domain(text) is
  'Domains that identify a person, not a company. Never mappable to an account.';


-- -----------------------------------------------------------------------------
-- 3. next_steps — the things that have not happened yet
-- -----------------------------------------------------------------------------
-- The same five nullable FKs as activities, for the same reason recorded in the
-- decision log: a meeting booked against a building must appear on the
-- account's page in one indexed query, with no joins at read time.
--
-- unique(source, external_id) mirrors activities, so a calendar event that
-- moves is updated rather than duplicated and a re-run costs nothing.

create type next_step_status as enum ('open', 'done', 'dismissed');
create type next_step_origin as enum ('calendar', 'commitment', 'manual');

create table next_steps (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (title <> ''),
  detail         text,
  due_at         timestamptz,
  -- An all-day event has no meaningful time, and rendering midnight as the
  -- start of a site visit is worse than rendering no time at all.
  all_day        boolean not null default false,
  status         next_step_status not null default 'open',
  origin         next_step_origin not null default 'manual',
  owner_id       uuid references profiles (id),

  account_id     uuid references accounts (id)      on delete cascade,
  building_id    uuid references buildings (id)     on delete cascade,
  contact_id     uuid references contacts (id)      on delete set null,
  opportunity_id uuid references opportunities (id) on delete cascade,
  employee_id    uuid references employees (id)     on delete set null,

  source         activity_source not null default 'manual',
  external_id    text,
  -- What this became once it happened. Null until the meeting is corroborated
  -- and converted; set, it is how you get from "Tuesday's walkthrough" to the
  -- note that came out of it.
  activity_id    uuid references activities (id) on delete set null,

  completed_at   timestamptz,
  created_by     uuid references profiles (id),
  import_batch_id uuid references import_batches (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (source, external_id)
);

create index next_steps_due_idx     on next_steps (due_at)           where status = 'open';
create index next_steps_owner_idx   on next_steps (owner_id, due_at) where status = 'open';
create index next_steps_account_idx on next_steps (account_id, due_at);

comment on table next_steps is
  'Forward-looking work: a booked meeting, or a commitment made in writing. '
  'Deliberately not a row in activities — a future date at the top of every '
  'timeline breaks both the timelines and the "days quiet" arithmetic.';

-- The same precedence chain as set_activity_account(), written out again rather
-- than shared: the two tables will drift — a next step may one day roll up from
-- a deal it was created to chase — and one function serving two triggers is how
-- that becomes a bug in the table nobody was editing.
create function public.set_next_step_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null and new.building_id is not null then
    select b.account_id into new.account_id from buildings b where b.id = new.building_id;
  end if;

  if new.account_id is null and new.opportunity_id is not null then
    select o.account_id into new.account_id from opportunities o where o.id = new.opportunity_id;
  end if;

  if new.account_id is null and new.contact_id is not null then
    select c.account_id into new.account_id from contacts c where c.id = new.contact_id;
  end if;

  return new;
end;
$$;

create trigger next_steps_set_account
  before insert or update of building_id, opportunity_id, contact_id, account_id
  on next_steps
  for each row execute function public.set_next_step_account();


-- -----------------------------------------------------------------------------
-- 4. ingested_items — the local mirror
-- -----------------------------------------------------------------------------
-- One row per thing seen at a source, whether or not it ever becomes a CRM
-- record. The same rule as the InspectQA mirror: the CRM reads local tables, so
-- Microsoft or Granola being down never breaks a screen, and a re-run is a
-- no-op rather than a second copy of last night's email.
--
-- `source` reuses activity_source rather than adding an enum. It already has
-- outlook, outlook_calendar and granola — and reusing it means (source,
-- external_id) here lines up exactly with the same pair on activities, so
-- "have I already logged this?" is one join on two columns and the database
-- refuses a duplicate even when the code is wrong.
--
-- external_id is NOT the provider's object id, and this is the trap:
--   mail     — internetMessageId. Graph's message.id CHANGES when a message
--              moves between folders, so filing an email would re-ingest it as
--              a brand new activity.
--   calendar — iCalUId, plus '/' || originalStart for one occurrence of a
--              series. iCalUId is also what Granola reports for the same
--              meeting, which is what joins calendar -> note -> activity.
--   granola  — the note id.
--
-- There is deliberately no body column. Exchange is the mail archive and has
-- retention and eDiscovery behind it; a second copy of every client email in
-- Postgres is a liability with no read path, readable in full by four people
-- who were not on the thread. The snippet is enough to review a suggestion.

create type ingest_item_status as enum ('new', 'linked', 'needs_review', 'ignored');
create type match_confidence   as enum ('exact', 'domain', 'inferred');

create table ingested_items (
  id           uuid primary key default gen_random_uuid(),
  source       activity_source not null,
  external_id  text not null,
  -- Whose mailbox this came out of. The same email reaching three colleagues is
  -- three rows here and ONE activity, credited to whoever sent it or to the
  -- first of them on the To line — otherwise a five-way client thread puts five
  -- identical rows on one account timeline and inflates every activity count.
  mailbox_id   uuid references profiles (id),
  occurred_at  timestamptz not null,
  direction    text check (direction in ('inbound', 'outbound', 'internal')),
  subject      text not null default '',
  snippet      text,
  -- [{ address, name, role: from|to|cc|organizer|attendee }]. The matcher's
  -- input. Kept as jsonb because the shape differs per source and nothing
  -- queries inside it except the matcher, once, on the night it arrives.
  participants jsonb not null default '[]'::jsonb,
  -- Conversation id or iCalUId. What ties a reply to its thread, and a Granola
  -- note to the meeting it came from.
  thread_key   text,

  status       ingest_item_status not null default 'new',
  matched_by   match_confidence,
  activity_id  uuid references activities (id) on delete set null,
  next_step_id uuid references next_steps (id) on delete set null,

  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  -- NULLS NOT DISTINCT matters: mailbox_id is null for a Granola note, and by
  -- default Postgres treats two nulls as different — so without this every
  -- re-run would insert the same note again, forever, and the mirror would stop
  -- being a mirror.
  unique nulls not distinct (source, external_id, mailbox_id)
);

create index ingested_items_status_idx on ingested_items (status, occurred_at desc);
create index ingested_items_thread_idx on ingested_items (thread_key) where thread_key is not null;

comment on table ingested_items is
  'One row per item seen at a source. Makes a re-run idempotent and keeps every '
  'screen working when a source is down — the same rule as the InspectQA mirror.';


-- -----------------------------------------------------------------------------
-- 5. ingest_suggestions — a proposed write, waiting for a person
-- -----------------------------------------------------------------------------
-- One table with a kind, and the reason it is not a junk drawer: every kind is
-- one of the same two verbs. subject_id set means "patch that row"; subject_id
-- null means "insert one". payload is column -> value either way. kind exists
-- to group and word the review screen, not to fork the code — which is what
-- makes a fifth kind free.
--
-- A patch is applied by apply_gap_fill(), which already journals every field,
-- refuses anything off the allowlist, skips jsonb nulls so a blank never
-- clears, casts through the column's own type, and writes one audit row per
-- record. So accepting a night's proposals is one import_batches row with an
-- Undo button, in the list that already exists at the bottom of /admin/import.
-- Nothing new is built for undo at all.
--
-- 'quiet_deal' is deliberately not a kind. It has no write to propose, so it is
-- a report — and a stored report is stale the second somebody logs a call, and
-- would need a job to unstale it. Silence is v_quiet_accounts, below, read at
-- the moment it is displayed.

create type suggestion_kind   as enum ('link_activity', 'create_contact', 'field_value', 'next_step');
create type suggestion_status as enum ('open', 'accepted', 'rejected', 'superseded');

create table ingest_suggestions (
  id            uuid primary key default gen_random_uuid(),
  kind          suggestion_kind not null,
  confidence    match_confidence not null,
  status        suggestion_status not null default 'open',

  subject_table text not null check (subject_table in
                  ('activities', 'contacts', 'accounts', 'buildings',
                   'opportunities', 'next_steps')),
  subject_id    uuid,
  payload       jsonb not null,

  -- Why, in a sentence, for a person to read. Never generated from a template
  -- that says "high confidence" — say what actually matched.
  rationale     text not null check (rationale <> ''),
  -- For anything a language model proposed: text lifted verbatim from the
  -- source and verified as a substring of it before this row was written, with
  -- offsets so the screen can show it in context. A quote proves the text
  -- exists. It does not prove the reading of it, and the screen says so.
  quote         text,
  quote_start   integer,
  quote_end     integer,

  ingested_item_id uuid references ingested_items (id) on delete cascade,
  -- What stops this table filling with the same proposals every single night.
  -- Unique across ALL statuses, including rejected, because "I already said no
  -- to this" has to stick. The payload hash is part of the key, so a genuinely
  -- different proposal about the same record still gets through.
  dedupe_key    text not null,
  expires_at    timestamptz,

  decided_by    uuid references profiles (id),
  decided_at    timestamptz,
  -- The batch the accepted change was journalled under, so Undo has somewhere
  -- to point.
  applied_batch_id uuid references import_batches (id) on delete set null,
  created_at    timestamptz not null default now(),

  unique (dedupe_key),
  -- An inferred suggestion with no verified quote is a fabrication with a
  -- confident tone. The database refuses it rather than trusting the caller.
  check (confidence <> 'inferred' or quote is not null),
  -- A patch needs something to patch.
  check (subject_id is not null or kind in ('create_contact', 'next_step'))
);

create index ingest_suggestions_open_idx
  on ingest_suggestions (created_at desc) where status = 'open';
create index ingest_suggestions_subject_idx
  on ingest_suggestions (subject_table, subject_id);

comment on table ingest_suggestions is
  'A proposed write. subject_id set = patch that row, null = insert one. '
  'Accepting a patch goes through apply_gap_fill(), so a night of accepted '
  'suggestions is one batch with one Undo button.';


-- -----------------------------------------------------------------------------
-- 6. The activity link columns join the gap-fill allowlist
-- -----------------------------------------------------------------------------
-- Accepting a link proposal is a patch, and every patch goes through
-- apply_gap_fill(). Only the four link columns are added: the machine may say
-- what an activity is ABOUT, never rewrite what it says. subject, body,
-- occurred_at, source and external_id stay off this list permanently.
--
-- Note what is still absent and stays absent: money. A model reading "$12,000"
-- out of an email cannot tell monthly from annual, or quoted from signed, and
-- the decision log records what one wrong contract figure already cost. A
-- contract value is typed by a person, on the Excel round trip, through
-- fill_building_contract_value().

create or replace function public.gap_fill_allows(p_table text, p_column text)
returns boolean
language sql
immutable
as $$
  select (p_table, p_column) in (
    ('buildings', 'property_type_id'),
    ('buildings', 'square_footage'),
    ('buildings', 'contract_start_date'),
    ('buildings', 'contract_end_date'),
    ('buildings', 'health_score'),
    ('buildings', 'owner_id'),
    ('buildings', 'secondary_owner_id'),
    ('buildings', 'day_porter'),
    ('buildings', 'day_porter_hours_per_day'),
    ('buildings', 'day_porter_days_per_week'),
    ('buildings', 'night_hours_per_night'),
    ('buildings', 'night_days_per_week'),
    ('buildings', 'weekend_service'),
    ('buildings', 'weekend_hours_per_week'),

    ('opportunities', 'monthly_value'),
    ('opportunities', 'expected_close_date'),
    ('opportunities', 'account_id'),
    ('opportunities', 'owner_id'),
    ('opportunities', 'secondary_owner_id'),
    ('opportunities', 'property_type_id'),
    ('opportunities', 'opened_on'),

    ('contacts', 'account_id'),
    ('contacts', 'title'),
    ('contacts', 'email'),

    ('accounts', 'primary_contact_id'),
    ('accounts', 'owner_id'),
    ('accounts', 'secondary_owner_id'),

    -- Phase 7a. What an activity is about, never what it says.
    ('activities', 'account_id'),
    ('activities', 'building_id'),
    ('activities', 'contact_id'),
    ('activities', 'opportunity_id')
  );
$$;

comment on function public.gap_fill_allows(text, text) is
  'The only (table, column) pairs a gap-fill import or an accepted suggestion '
  'may write. A security boundary for dynamic SQL, which is why it is a '
  'function and not a table.';


-- -----------------------------------------------------------------------------
-- 7. Silence, as a view rather than as rows
-- -----------------------------------------------------------------------------
-- The same rule as v_gap_census and the win rate: computed once, in one place,
-- at the moment it is read. A stored "this account has gone quiet" row is wrong
-- the second after somebody logs a call.
--
-- last_activity is null for an account nobody has ever touched, and days_quiet
-- is null with it — which is worse than a big number, not better, so callers
-- sort nulls first. This mirrors fetchMyFocus, which already does exactly that
-- for the accounts one person owns; this is the company-wide version.

create view v_quiet_accounts
with (security_invoker = on) as
with account_mrr as (
  select account_id, sum(monthly_value) as monthly_value
  from v_building_current_value
  where monthly_value is not null
  group by account_id
),
last_touch as (
  select account_id, max(occurred_at) as last_activity
  from activities
  where account_id is not null
  group by account_id
)
select
  a.id                                          as account_id,
  a.name                                        as account_name,
  a.owner_id,
  a.secondary_owner_id,
  t.last_activity,
  (current_date - t.last_activity::date)        as days_quiet,
  coalesce(m.monthly_value, 0)                  as monthly_value,
  exists (
    select 1
    from opportunities o
    join pipeline_stages s on s.id = o.stage_id
    where o.account_id = a.id
      and o.deleted_at is null
      and not s.is_won
      and not s.is_lost
  )                                             as has_open_deal
from accounts a
left join last_touch t on t.account_id = a.id
left join account_mrr m on m.account_id = a.id
where a.deleted_at is null
  and a.status <> 'former';

comment on view v_quiet_accounts is
  'How long since anything was logged against each account. has_open_deal is as '
  'close as the data gets to "this deal has gone quiet": 0 of 667 activities '
  'link to an opportunity, so deal-level silence is not measurable yet.';


-- -----------------------------------------------------------------------------
-- 8. Which domains could be mapped, counted from the contacts already held
-- -----------------------------------------------------------------------------
-- The analogue of v_gap_census for the domain map: it says what could be added
-- and refuses to offer a domain that spans two accounts, so the unique
-- constraint above is never the thing that tells you.
--
-- lower(email) because contacts_email_idx is on lower(email), is NOT unique and
-- has no deleted_at clause — two live contacts may share an address.

create view v_domain_candidates
with (security_invoker = on) as
select
  split_part(lower(c.email), '@', 2) as domain,
  count(*)                           as contact_count,
  -- array_agg rather than min(): uuid has no min() aggregate, and the HAVING
  -- clause has already guaranteed there is exactly one distinct value.
  (array_agg(distinct c.account_id))[1] as account_id,
  min(a.name)                        as account_name
from contacts c
join accounts a on a.id = c.account_id and a.deleted_at is null
where c.deleted_at is null
  and c.email is not null
  and c.email <> ''
  and position('@' in c.email) > 0
  and not public.is_public_email_domain(split_part(lower(c.email), '@', 2))
  and not exists (
    select 1 from account_domains d
    where d.domain = split_part(lower(c.email), '@', 2)
  )
group by 1
having count(distinct c.account_id) = 1;

comment on view v_domain_candidates is
  'Domains that could be mapped to an account, derived from contacts already '
  'held. A domain whose contacts span two accounts is excluded, not offered.';


-- -----------------------------------------------------------------------------
-- 9. Triggers, RLS and grants
-- -----------------------------------------------------------------------------
-- The trigger block in 20260812180000 is a `do $$` loop over a hardcoded array
-- — a snapshot, exactly like the grants block that stranded six objects in
-- Phase 5. New tables must attach their own.

create trigger next_steps_touch_updated_at before update on next_steps
  for each row execute function public.touch_updated_at();

create trigger next_steps_audit after insert or update or delete on next_steps
  for each row execute function public.write_audit_log();

create trigger account_domains_audit after insert or update or delete on account_domains
  for each row execute function public.write_audit_log();

-- ingested_items and ingest_suggestions are deliberately NOT audited. They are
-- machine-written every night; auditing them would grow audit_log faster than
-- every human edit combined, with nobody reading the rows. What matters is
-- audited already: the activity the ingest creates, and the record an accepted
-- suggestion patches.

-- next_steps, ingest_suggestions and ingested_items follow activities: every
-- member reads and writes. Accepting a suggestion is not an admin job —
-- linking a call to an account is the everyday work this app exists for, and
-- the ingest profile is a member, not an admin.
--
-- account_domains is admin-managed. A wrong domain silently files a stranger's
-- mail against a client for as long as nobody notices, which is a different
-- class of mistake from mislinking one activity.

do $$
declare
  t text;
  member_rw     text[] := array['next_steps', 'ingest_suggestions', 'ingested_items'];
  admin_managed text[] := array['account_domains'];
begin
  foreach t in array member_rw loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy members_select on %I for select to authenticated using (public.is_member())', t);
    execute format('create policy members_insert on %I for insert to authenticated with check (public.is_member())', t);
    execute format('create policy members_update on %I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('create policy members_delete on %I for delete to authenticated using (public.is_member())', t);
  end loop;

  foreach t in array admin_managed loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy members_select on %I for select to authenticated using (public.is_member())', t);
    execute format('create policy admins_write on %I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

-- `grant ... on all` is a snapshot, not a rule. Re-run it, or every object
-- above is invisible to `authenticated` on any database rebuilt from these
-- files — the exact failure Phase 5 found and db:verify now asserts.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
