-- =============================================================================
-- Phase 3 — opportunities and the pipeline
-- =============================================================================
-- The tables were all created at Phase 0 and nothing has ever written to them.
-- This adds the four things the original schema could not have known:
--
--   * why a deal was won, in a form that can be ranked next to why deals are lost
--   * when a deal actually opened, which is not when someone imported it
--   * one transaction that turns a won deal into an account, a building and an
--     opening contract period, so a crash cannot leave a building with no revenue
--   * the real lead sources, replacing the Phase 0 placeholders
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The stage probabilities are confirmed
-- -----------------------------------------------------------------------------
-- 20260812230000 flagged 'Hot Lead' (10) and 'RFP Response' (50) as interpolated
-- and needing Ryan's confirmation. He confirmed both on 2026-08-13, unchanged, so
-- there is no data to correct — only the note saying they were guesses.
--
-- That migration is already applied to the live project, so the correction goes
-- here rather than being edited in place. Same reason as 20260812210000.

comment on column pipeline_stages.probability is
  'Chance of winning, used for the weighted pipeline. All eight values confirmed by Ryan against his own dashboard, 2026-08-13. Editable in Admin — changing one is data, not a migration.';


-- -----------------------------------------------------------------------------
-- 2. Why we won
-- -----------------------------------------------------------------------------
-- The Won/Loss tab has a "Tipped the Win" column, and it has to be rankable
-- alongside the loss reasons. Loss reasons are a lookup table, so this is one
-- too: free text becomes ninety-five spellings of "price", exactly like the
-- activity types in the spreadsheet.
--
-- It ships EMPTY on purpose. The real values in the sheet are compound phrases
-- ("CBRE referral relationship + pricing"), not categories, and inventing a list
-- here would repeat the mistake this migration is cleaning up for lead sources.
-- The Won/Loss importer offers the distinct phrases for Ryan to curate into
-- reasons in the preview, before anything is written.
--
-- The verbatim phrase still matters, so it is kept beside the lookup in
-- win_notes. The lookup drives the report; the note is what you read out in a
-- meeting.

create table win_reasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

-- The DO block that attached policies in bulk has already run, so a table added
-- later gets its RLS by hand. Same shape as the other admin-managed reference
-- data: everyone reads, admins write.
alter table win_reasons enable row level security;

create policy members_select on win_reasons
  for select to authenticated using (public.is_member());

create policy admins_write on win_reasons
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table opportunities
  add column win_reason_id uuid references win_reasons (id),
  add column win_notes     text;

comment on column opportunities.win_notes is
  'What actually tipped it, in the words on the Won/Loss tab. win_reason_id is the ranked category; this is the sentence worth quoting to the next prospect.';


-- -----------------------------------------------------------------------------
-- 3. When the deal opened
-- -----------------------------------------------------------------------------
-- The sales-cycle report needs a start date, and created_at is not it. Every
-- deal imported from the Pipeline tab is created within the same second, so
-- measuring from created_at would report a zero-day sales cycle for all sixty-odd
-- historical deals — wrong, and wrong silently.
--
-- Deliberately NULLABLE. The Won/Loss tab gives a real answer (close date minus
-- days to close), but the Pipeline tab has no start date at all, and a null that
-- the report can exclude and count is honest where today's date would be a lie
-- that averages into a number someone acts on.

alter table opportunities add column opened_on date;

comment on column opportunities.opened_on is
  'When the deal started, not when the row was created. Sales cycle is actual_close_date - opened_on. Null means genuinely unknown — the reports count those separately rather than guessing.';

-- Anything already here was created by hand, so its creation date is its start.
update opportunities set opened_on = created_at::date where opened_on is null;


-- -----------------------------------------------------------------------------
-- 4. Closing a deal stamps the close date
-- -----------------------------------------------------------------------------
-- Separate from record_opportunity_stage_change(), and deliberately BEFORE:
--
--   * an AFTER trigger cannot assign to NEW, so it would need a second UPDATE,
--     which writes a second audit_log row for one drag of one card
--   * the stage-event trigger is security definer because it writes a table the
--     user cannot write. Nothing here needs that, and a definer function should
--     do only the one privileged thing it exists for
--   * BEFORE means the audit log records the stamped date rather than a null
--
-- It never overwrites a date that is already there, so a deal imported with its
-- real March close date keeps March instead of today.

create function public.stamp_opportunity_close_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now_closed boolean;
  v_was_closed boolean;
begin
  select s.is_won or s.is_lost into v_now_closed
  from pipeline_stages s where s.id = new.stage_id;

  if tg_op = 'INSERT' then
    if v_now_closed and new.actual_close_date is null then
      new.actual_close_date := current_date;
    end if;
    return new;
  end if;

  -- Dropping a card back on the column it came from is not a stage change.
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select s.is_won or s.is_lost into v_was_closed
  from pipeline_stages s where s.id = old.stage_id;

  if v_now_closed and not v_was_closed then
    if new.actual_close_date is null then
      new.actual_close_date := current_date;
    end if;

  elsif v_was_closed and not v_now_closed then
    -- Reopening a deal that was already converted would leave a building billing
    -- against a deal that says it never closed. Refuse, loudly, rather than
    -- letting the portfolio and the pipeline quietly disagree.
    if new.building_id is not null then
      raise exception 'This deal has already been converted into %. Unlink the building before reopening the deal.',
        coalesce((select b.name from buildings b where b.id = new.building_id), 'a building')
        using errcode = 'check_violation';
    end if;

    -- Open again means no close date. The old value survives in audit_log.
    new.actual_close_date := null;
  end if;

  -- loss_reason_id, competitor_id and win_reason_id are left alone on purpose.
  -- Clearing them looks tidy and throws away context; the reporting views read
  -- closed deals only, so a stale reason on a reopened deal is invisible rather
  -- than wrong.

  return new;
end;
$$;

create trigger opportunities_close_date
  before insert or update of stage_id on opportunities
  for each row execute function public.stamp_opportunity_close_date();


-- -----------------------------------------------------------------------------
-- 5. The real lead sources
-- -----------------------------------------------------------------------------
-- Taken from the Source column of the Pipeline tab, with the variants Ryan
-- confirmed as the same thing merged: "Direct" and "Cold Outreach" are Direct
-- Outreach; the CBRE and Tufts/CBRE variants are one CBRE Referral; both inbound
-- RFP rows are one Inbound RFP.
--
-- The placeholders are deactivated rather than deleted, because
-- opportunities.lead_source_id has no ON DELETE and a delete would start failing
-- the moment anything pointed at one.
--
-- The insert runs AFTER the deactivation and upserts is_active back to true,
-- because 'Referral' is in both lists. A plain "do nothing" would leave the most
-- common real source switched off, and nothing would ever say so.
--
-- Nothing here adds an 'Other'. When a row's source does not map the importer
-- leaves lead_source_id null: an honest unknown beats a bucket nobody empties.

update lead_sources
set is_active  = false,
    sort_order = sort_order + 90
where name in ('Existing client', 'Broker', 'Cold outreach', 'Inbound enquiry', 'Other');

insert into lead_sources (name, sort_order) values
  ('Direct Outreach',           1),
  ('CBRE Referral',             2),
  ('Referral',                  3),
  ('Existing Relationship',     4),
  ('Existing Client Expansion', 5),
  ('LinkedIn',                  6),
  ('Inbound RFP',               7),
  ('BBM Partnership',           8)
on conflict (name) do update
  set sort_order = excluded.sort_order,
      is_active  = true;


-- -----------------------------------------------------------------------------
-- 6. Lost to a competitor
-- -----------------------------------------------------------------------------
-- The only recorded loss in the entire workbook is "Janitronics won contract",
-- so this is the reason people reach for first and it sorts first. The Phase 0
-- placeholders stay active: unlike the lead sources they are all plausible, and
-- one data point is not a list to derive from. 'both', because a building can be
-- lost to a competitor too — buildings.lost_to_competitor_id already exists.

update loss_reasons set sort_order = sort_order + 1 where sort_order < 90;

insert into loss_reasons (name, applies_to, sort_order) values
  ('Lost to competitor', 'both', 1)
on conflict (name) do update
  set applies_to = 'both', sort_order = 1, is_active = true;

-- 'Other' belongs at the bottom of every dropdown.
update loss_reasons set sort_order = 99 where name = 'Other';


-- -----------------------------------------------------------------------------
-- 7. Turning a won deal into a building
-- -----------------------------------------------------------------------------
-- One transaction, because Supabase gives the app no transaction of its own.
-- Doing this from a server action is four separate PostgREST calls, and a
-- failure between "create the building" and "set its value" leaves a live
-- building with no contract period — a building that exists, shows in the
-- portfolio, and contributes nothing to MRR forever, with no screen to say so.
--
-- What this deliberately does NOT do is decide WHICH account. Matching
-- "Tufts Medicine — CBRE (Reading)" to an existing account is fuzzy, and that
-- belongs where a person can be shown the guess first — the same rule the
-- importer already follows. The app resolves; this writes.
--
-- security invoker: whoever calls it gets exactly the permissions they already
-- have, and set_building_monthly_value keeps stamping created_by with the real
-- auth.uid().

create function public.convert_opportunity_to_building(
  p_opportunity_id uuid,
  p_account_id     uuid    default null,
  p_account_name   text    default null,
  p_building_name  text    default null,
  p_monthly_value  numeric default null,
  p_effective_date date    default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_opp         opportunities;
  v_is_won      boolean;
  v_account_id  uuid;
  v_building_id uuid;
  v_value       numeric;
begin
  select * into v_opp
  from opportunities
  where id = p_opportunity_id and deleted_at is null;

  if not found then
    raise exception 'That opportunity no longer exists.' using errcode = 'no_data_found';
  end if;

  -- Idempotent: a double-tapped button must not create a second building and a
  -- second opening contract period.
  if v_opp.building_id is not null then
    raise exception 'This deal has already been converted into a building.'
      using errcode = 'unique_violation';
  end if;

  select s.is_won into v_is_won from pipeline_stages s where s.id = v_opp.stage_id;
  if not coalesce(v_is_won, false) then
    raise exception 'Move the deal to a won stage before converting it.'
      using errcode = 'check_violation';
  end if;

  v_account_id := coalesce(p_account_id, v_opp.account_id);

  if v_account_id is null then
    -- buildings.account_id is not null, so say this plainly rather than letting
    -- the constraint say it in Postgres's words.
    if coalesce(btrim(p_account_name), '') = '' then
      raise exception 'A won deal needs an account: choose an existing one, or give a name for a new one.'
        using errcode = 'not_null_violation';
    end if;

    insert into accounts (
      name, status, owner_id, secondary_owner_id,
      hq_address_line1, hq_address_line2, hq_city, hq_state, hq_postal_code
    ) values (
      btrim(p_account_name), 'active', v_opp.owner_id, v_opp.secondary_owner_id,
      v_opp.address_line1, v_opp.address_line2, v_opp.city, v_opp.state, v_opp.postal_code
    )
    returning id into v_account_id;
  else
    -- A prospect that just signed is a customer.
    update accounts set status = 'active'
    where id = v_account_id and status = 'prospect';
  end if;

  -- import_batch_id is NOT copied across from the opportunity. Undoing the
  -- pipeline import must never delete a live, billing building.
  insert into buildings (
    account_id, name,
    address_line1, address_line2, city, state, postal_code,
    property_type_id, square_footage, entity, scope_notes,
    status, contract_start_date, owner_id, secondary_owner_id
  ) values (
    v_account_id,
    coalesce(nullif(btrim(p_building_name), ''), v_opp.name),
    v_opp.address_line1, v_opp.address_line2, v_opp.city, v_opp.state, v_opp.postal_code,
    v_opp.property_type_id, v_opp.square_footage, v_opp.entity, v_opp.scope_notes,
    'active', p_effective_date, v_opp.owner_id, v_opp.secondary_owner_id
  )
  returning id into v_building_id;

  -- Contract value always goes through the helper, never straight into
  -- building_contract_periods, so the revenue history starts properly.
  v_value := coalesce(p_monthly_value, v_opp.monthly_value);
  if v_value is not null then
    perform set_building_monthly_value(
      v_building_id, v_value, p_effective_date, 'initial',
      'Converted from the won deal "' || v_opp.name || '".'
    );
  end if;

  -- stage_id is untouched: the card is already in the won column and the close
  -- date is already stamped. Stage changes happen in exactly one place.
  update opportunities
  set building_id       = v_building_id,
      account_id        = v_account_id,
      actual_close_date = coalesce(actual_close_date, p_effective_date)
  where id = p_opportunity_id;

  return v_building_id;
end;
$$;

comment on function public.convert_opportunity_to_building is
  'Won deal -> account (created or reused), building, opening contract period, deal linked back. One transaction. The caller decides which account; this never guesses.';


-- -----------------------------------------------------------------------------
-- 8. Pipeline reporting
-- -----------------------------------------------------------------------------
-- security_invoker on every view, like the rest of this schema, so they obey the
-- caller's RLS rather than the owner's.

-- The funnel, and the pipeline-by-stage table Ryan already has on his dashboard.
--
-- Driven FROM pipeline_stages with a left join, so a stage holding no deals still
-- appears: an empty column is information, and a board that hides one is broken.
-- The deleted_at test sits in the JOIN, not the WHERE — in the WHERE it silently
-- turns this back into an inner join and the empty stages vanish again.
--
-- Closed stages are included, unlike v_weighted_pipeline, because a funnel has to
-- show where deals ended up. That makes the weighted total meaningless if summed
-- blindly (Closed Won weights at 100%), so is_open is exposed to subtotal on.
create view v_pipeline_funnel
with (security_invoker = on) as
select
  s.id                        as stage_id,
  s.name                      as stage_name,
  s.sort_order                as stage_sort_order,
  s.probability,
  s.is_won,
  s.is_lost,
  not (s.is_won or s.is_lost) as is_open,
  s.is_active,
  count(o.id)                                                        as deal_count,
  coalesce(sum(o.monthly_value), 0)                                  as monthly_value,
  coalesce(sum(o.annual_value), 0)                                   as annual_value,
  round(coalesce(sum(o.annual_value), 0) * s.probability / 100.0, 2) as weighted_annual_value,
  count(o.id) filter (where o.monthly_value is null)                 as deals_without_value,
  min(o.expected_close_date)                                         as next_expected_close
from pipeline_stages s
left join opportunities o
  on o.stage_id = s.id and o.deleted_at is null
group by s.id, s.name, s.sort_order, s.probability, s.is_won, s.is_lost, s.is_active;

-- One row per closed deal. The whole win/loss report reads from here, so the win
-- rate on the dashboard and the win rate in the report cannot ever disagree.
--
-- Deals with no close date are kept, with a null sales cycle. Filtering them out
-- would quietly move the win rate every time someone forgot a date.
create view v_opportunity_outcomes
with (security_invoker = on) as
select
  o.id            as opportunity_id,
  o.name,
  o.account_id,
  o.building_id,
  o.owner_id,
  o.entity,
  s.id            as stage_id,
  s.name          as stage_name,
  s.is_won        as won,
  o.monthly_value,
  o.annual_value,
  o.opened_on,
  o.actual_close_date,
  date_trunc('month', o.actual_close_date)::date as closed_month,
  -- Negative values stay visible on purpose: a deal that closed before it opened
  -- is a data-entry error worth seeing, not worth hiding behind greatest().
  (o.actual_close_date - o.opened_on)            as days_to_close,
  pt.id           as property_type_id,
  pt.name         as property_type,
  ls.name         as lead_source,
  lr.id           as loss_reason_id,
  lr.name         as loss_reason,
  wr.id           as win_reason_id,
  wr.name         as win_reason,
  o.win_notes,
  -- On a win this is who we beat; on a loss it is who beat us. Read it with won.
  c.id            as competitor_id,
  c.name          as competitor,
  o.incumbent_provider
from opportunities o
join pipeline_stages s      on s.id  = o.stage_id
left join property_types pt on pt.id = o.property_type_id
left join lead_sources   ls on ls.id = o.lead_source_id
left join loss_reasons   lr on lr.id = o.loss_reason_id
left join win_reasons    wr on wr.id = o.win_reason_id
left join competitors    c  on c.id  = o.competitor_id
where o.deleted_at is null
  and (s.is_won or s.is_lost);

-- How long a deal sat in each stage. The stage it was IN is the event's
-- to_stage_id; the next event is when it left, and a null means it is still there.
--
-- Worth knowing before reading it: every deal imported from the spreadsheet has
-- exactly one stage event, stamped at import. This view says nothing about
-- anything that happened before go-live, and everything about what happens after.
create view v_opportunity_stage_durations
with (security_invoker = on) as
select
  e.opportunity_id,
  e.id                                as stage_event_id,
  e.to_stage_id                       as stage_id,
  s.name                              as stage_name,
  s.sort_order                        as stage_sort_order,
  e.changed_at                        as entered_at,
  lead(e.changed_at) over w           as left_at,
  (lead(e.changed_at) over w) is null as is_current,
  round(
    (extract(epoch from (coalesce(lead(e.changed_at) over w, now()) - e.changed_at)) / 86400.0)::numeric,
    1
  )                                   as days_in_stage
from opportunity_stage_events e
join opportunities   o on o.id = e.opportunity_id and o.deleted_at is null
join pipeline_stages s on s.id = e.to_stage_id
window w as (partition by e.opportunity_id order by e.changed_at, e.id);


-- -----------------------------------------------------------------------------
-- 9. Indexes
-- -----------------------------------------------------------------------------
-- At sixty-odd deals none of these change a query plan. Two are hygiene —
-- building_id is an unindexed foreign key, which also slows deleting a building,
-- and import_batch_id is what an undo deletes on — and the close-date one is the
-- one that will matter in two years when the report is filtered by quarter.
--
-- opportunities (stage_id) for the board and stage_events (opportunity_id,
-- changed_at) for the durations view already exist from Phase 0.

create index opportunities_building_idx on opportunities (building_id)
  where deleted_at is null;

create index opportunities_closed_idx on opportunities (actual_close_date desc)
  where deleted_at is null and actual_close_date is not null;

create index opportunities_import_batch_idx on opportunities (import_batch_id)
  where import_batch_id is not null;
