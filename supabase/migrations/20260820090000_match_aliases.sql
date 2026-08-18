-- ---------------------------------------------------------------------------
-- What a note title means, and which addresses are one of us.
-- ---------------------------------------------------------------------------
--
-- Phase 7a matches on PARTICIPANTS: an address that equals exactly one live
-- contact, or a domain that maps to exactly one account. Measured against all
-- 231 real Granola notes, that resolves NOTHING on any of them — not one note
-- carries an external attendee address, because most are solo site inspections
-- dictated into a phone. The only addresses on them are Ryan's own.
--
-- The signal is the note TITLE, which carries street addresses, building names
-- and deal names:
--
--   "8-13-2026 46 Obery st inspection"
--   "8-12-2026 wound center inspection"
--   "900 middlesex turnpike building 5 Billerica ma - jumbo Capital"
--
-- Two of those three cannot be derived from anything already in the database.
-- "wound center" is not a building name and not an address; "jumbo Capital" is
-- a deal. So the title matcher needs a curated phrase book, and that is what
-- match_aliases is.
--
-- The hazard this table exists alongside, rather than instead of: some titles
-- are private. "Sleep apnea - reliable respiratory" and "Sleep study Review -
-- Dr Amit Anad - Center for Specialty Care - Milton Hospital - 199 Reedsdale
-- Road Milton MA" are Ryan's own medical appointments, and the second carries
-- both a hospital name and a street address. A single-word matcher filed a
-- family hospice note under Beth Israel Lahey on the word "Beth". That is why
-- derived candidates must be phrases and why an address match must include the
-- street NUMBER — 199 Reedsdale Road matches nothing because Beale's has no
-- contract at that number.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Normalising a phrase, once, in one place
-- ---------------------------------------------------------------------------
-- Lower-case, punctuation to spaces, whitespace collapsed, and street suffixes
-- collapsed to one token so "90 Libbey Pkwy" and "90 Libbey Parkway" are the
-- same phrase and "90 Libbey Pkwy." is not a third one.
--
-- This is DUPLICATED in TypeScript as normaliseAlias() in
-- src/lib/ingest/titles.ts, for the same reason is_public_email_domain() is
-- duplicated as PUBLIC_EMAIL_DOMAINS: v_alias_candidates below has to apply it
-- and a view cannot call TypeScript, while the matcher runs over 231 titles and
-- cannot make a round trip per phrase. Two copies of a rule is a real cost, so
-- db:verify asserts the two agree on a fixture list. If one is edited, edit
-- both.
--
-- plpgsql with a loop rather than thirteen nested regexp_replace calls, because
-- the nested version is unreadable and unreviewable, and this function is a
-- thing people will need to read.
create function public.normalise_alias(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  v    text;
  pair text[];
  -- Long form -> canonical short form. The short forms are already canonical,
  -- so they need no entry of their own.
  pairs text[][] := array[
    array['street',     'st'],
    array['road',       'rd'],
    array['drive',      'dr'],
    array['avenue',     'ave'],
    array['boulevard',  'blvd'],
    array['parkway',    'pkwy'],
    array['circle',     'cir'],
    array['lane',       'ln'],
    array['court',      'ct'],
    array['place',      'pl'],
    array['turnpike',   'tpke'],
    array['highway',    'hwy'],
    array['suites',     'suite'],
    array['ste',        'suite']
  ];
begin
  -- Anything that is not a letter or a digit becomes a space. That is what
  -- makes "Beale's", "Dana-Farber" and "90 Libbey Pkwy." normalise cleanly
  -- without a list of punctuation to keep in step with anything.
  v := btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'));

  foreach pair slice 1 in array pairs loop
    v := regexp_replace(v, '\m' || pair[1] || '\M', pair[2], 'g');
  end loop;

  return nullif(btrim(regexp_replace(v, '\s+', ' ', 'g')), '');
end;
$$;

comment on function public.normalise_alias(text) is
  'Lower-cases, strips punctuation and collapses street suffixes. Duplicated in '
  'TypeScript as normaliseAlias() in src/lib/ingest/titles.ts — db:verify '
  'asserts the two agree. Edit both or neither.';


-- ---------------------------------------------------------------------------
-- 2. match_aliases — a phrase means exactly one record
-- ---------------------------------------------------------------------------
-- The same contract as account_domains, and unique(alias) is the whole point: a
-- phrase that could mean two records must mean NEITHER, enforced by the
-- database rather than counted at 3am by the job that is about to write.
--
-- Three nullable foreign keys with num_nonnulls() = 1, rather than a
-- (target_table, target_id) pair. `activities` already carries five nullable
-- FKs for the same reason: a polymorphic pair has no referential integrity, so
-- deleting a building would leave an alias pointing at a ghost that the matcher
-- resolves to nothing, with no way to see why. On delete cascade means tidying
-- up a record takes its aliases with it.
--
-- Deliberately NO minimum length. "HTA" is three characters and is a real alias
-- Ryan wants; "SSMC" is four. A short alias is safe HERE precisely because a
-- person typed it — the "Beth" failure came from deriving single words
-- automatically off record names, which is what the phrase rule in
-- v_alias_candidates and titles.ts governs. Curation is the safeguard, not
-- length.
create table match_aliases (
  id             uuid primary key default gen_random_uuid(),
  -- Stored already normalised, so a lookup is an equality and never a function
  -- call on every row of the table.
  alias          text not null check (alias = public.normalise_alias(alias)),
  account_id     uuid references accounts (id)      on delete cascade,
  building_id    uuid references buildings (id)     on delete cascade,
  opportunity_id uuid references opportunities (id) on delete cascade,
  -- Why this phrase means this record, for whoever reads it in a year.
  note           text,
  added_by       uuid references profiles (id),
  created_at     timestamptz not null default now(),

  unique (alias),
  constraint match_aliases_one_target
    check (num_nonnulls(account_id, building_id, opportunity_id) = 1)
);

create index match_aliases_account_idx     on match_aliases (account_id)     where account_id is not null;
create index match_aliases_building_idx    on match_aliases (building_id)    where building_id is not null;
create index match_aliases_opportunity_idx on match_aliases (opportunity_id) where opportunity_id is not null;

comment on table match_aliases is
  'A phrase in a note title -> exactly one account, building or deal. '
  'unique(alias) is the contract: a phrase that could mean two records means '
  'neither. Ships empty — seeding it needs uuids, which are runtime data.';


-- ---------------------------------------------------------------------------
-- 3. profile_email_aliases — a second address that is still one of us
-- ---------------------------------------------------------------------------
-- Granola authenticates as ryanbeale26@gmail.com, not ryan@bealesllc.com. With
-- no alias, three things go wrong at once and all three are live bugs:
--
--   creditTo() finds no colleague and falls back to the ingest profile, so
--   every Granola activity reads "logged by Nightly ingest" instead of by Ryan;
--
--   recordUnknownSender() files Ryan's own Gmail address in the list of
--   strangers we do not know;
--
--   and matchParticipants() treats him as an external party.
--
-- Deliberately NOT account_domains. gmail.com is on the
-- is_public_email_domain() list and has to stay there: mapping it would file
-- every private message the mailbox receives against a client account. This
-- maps ONE ADDRESS to ONE PERSON, which is a different claim entirely.
--
-- 7b gets multi-address colleagues out of this for free.
create table profile_email_aliases (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  email      text not null check (email = lower(email) and position('@' in email) > 1),
  note       text,
  added_by   uuid references profiles (id),
  created_at timestamptz not null default now(),

  -- One address is one person. Two profiles claiming the same address would
  -- make "who logged this" a coin toss.
  unique (email)
);

create index profile_email_aliases_profile_idx on profile_email_aliases (profile_id);

comment on table profile_email_aliases is
  'Other addresses that belong to one of the five. Granola signs in as a '
  'personal Gmail address, so without this every note it produces is credited '
  'to the machine account instead of to a person.';


-- ---------------------------------------------------------------------------
-- 4. What actually matched, recorded on the mirror row
-- ---------------------------------------------------------------------------
-- matched_by already says WHICH TIER matched. This says what the matching TEXT
-- was, so the admin screen can print "linked because the title says «wound
-- center»" rather than asking somebody to take the tier on faith.
--
-- On ingested_items rather than on the activity: an activity's body is the
-- note's own words and must not acquire machine commentary. The mirror is where
-- the machine's reasoning belongs.
alter table ingested_items add column matched_on text;

comment on column ingested_items.matched_on is
  'The phrase that matched, verbatim from the title. Null for a participant '
  'match, where matched_by and the address already say everything.';


-- ---------------------------------------------------------------------------
-- 5. v_alias_candidates — what could be aliased, offered rather than typed
-- ---------------------------------------------------------------------------
-- The analogue of v_domain_candidates, and it carries the same refusal: a
-- phrase that two different records would both claim is EXCLUDED, never
-- offered, so unique(alias) is not the thing that tells you.
--
-- It also carries the phrase rule, as a floor rather than as the whole defence:
-- at least two tokens, or four characters. A single derived word is exactly the
-- "Beth" failure, and no real record name falls foul of this — the shortest
-- building name in the book is two tokens.
--
-- security_invoker = on, or the view is a hole straight through every RLS
-- policy on the tables underneath it.
create view v_alias_candidates
with (security_invoker = on) as
with raw as (
  -- A building's street address. The strongest candidate there is, because a
  -- street number is close to unique and is what most titles actually carry.
  select distinct
    public.normalise_alias(b.address_line1)      as alias,
    'Address'::text                              as kind,
    b.name                                       as label,
    null::uuid                                   as account_id,
    b.id                                         as building_id,
    null::uuid                                   as opportunity_id
  from buildings b
  where b.deleted_at is null
    and coalesce(btrim(b.address_line1), '') not in ('', '-')

  union

  select distinct
    public.normalise_alias(b.name), 'Building', b.name, null::uuid, b.id, null::uuid
  from buildings b
  where b.deleted_at is null

  union

  select distinct
    public.normalise_alias(a.name), 'Account', a.name, a.id, null::uuid, null::uuid
  from accounts a
  where a.deleted_at is null

  union

  -- Open deals only. A phrase from a deal closed two years ago would file
  -- tonight's note against history.
  select distinct
    public.normalise_alias(o.name), 'Deal', o.name, null::uuid, null::uuid, o.id
  from opportunities o
  join pipeline_stages s on s.id = o.stage_id
  where o.deleted_at is null
    and not s.is_won
    and not s.is_lost
),
-- How many DISTINCT records claim each phrase. Counting rows instead would
-- exclude a building whose name happens to equal its own address, which is one
-- record wearing two hats rather than an ambiguity.
claimed as (
  select
    alias,
    count(distinct coalesce(account_id::text, building_id::text, opportunity_id::text)) as records
  from raw
  where alias is not null
  group by alias
)
select r.alias, r.kind, r.label, r.account_id, r.building_id, r.opportunity_id
from raw r
join claimed c on c.alias = r.alias
where r.alias is not null
  and c.records = 1
  and (array_length(string_to_array(r.alias, ' '), 1) >= 2 or length(r.alias) >= 4)
  and not exists (select 1 from match_aliases m where m.alias = r.alias);

comment on view v_alias_candidates is
  'Phrases that could be mapped, derived from the records already held. A '
  'phrase two different records would both claim is excluded rather than '
  'offered, and a single short word is never offered at all.';


-- ---------------------------------------------------------------------------
-- 6. Security
-- ---------------------------------------------------------------------------
-- Both tables are ADMIN-MANAGED, copying account_domains and for the reason
-- recorded there: a wrong alias silently files notes against the wrong client
-- for as long as nobody notices, which is a different class of mistake from
-- mislinking one activity. A wrong profile alias silently credits one person's
-- work to another.
--
-- Every member reads them, because the matcher runs as the ingest profile,
-- which is a member and not an admin.

alter table match_aliases        enable row level security;
alter table profile_email_aliases enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['match_aliases', 'profile_email_aliases'] loop
    execute format('create policy members_select on %I for select to authenticated using (public.is_member())', t);
    execute format('create policy admins_write on %I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

-- The trigger block in 20260812180000 is a `do $$` loop over a hardcoded array
-- — a snapshot, exactly like the grants block that stranded six objects in
-- Phase 5. New tables attach their own.
create trigger match_aliases_audit
after insert or update or delete on match_aliases
for each row execute function public.write_audit_log();

create trigger profile_email_aliases_audit
after insert or update or delete on profile_email_aliases
for each row execute function public.write_audit_log();

-- `grant ... on all` is a snapshot, not a rule. Re-run it, or everything above
-- is invisible to `authenticated` on any database rebuilt from these files —
-- the exact failure Phase 5 found and db:verify now asserts.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
