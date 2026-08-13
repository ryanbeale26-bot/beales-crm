-- =============================================================================
-- Phase 5 — reporting views
-- =============================================================================
-- Three things the dashboard and the reports need did not exist in SQL:
--
--   1. health_score appeared in no view at all, though the dashboard summarises
--      the portfolio by it.
--   2. There was no company-wide MRR-per-month row. v_mrr_waterfall splits by
--      entity, so every caller had to remember to sum() — and one that forgot
--      would silently report one entity's revenue as the company's.
--   3. Win rate existed only as a line of TypeScript inside the pipeline
--      report. The dashboard needs the same number, and two implementations of
--      one number eventually disagree.
--
-- All revenue maths lives here. React never computes MRR.
-- security_invoker = on so these obey the caller's RLS, not the owner's.

-- -----------------------------------------------------------------------------
-- 1. v_building_current_value — widened
-- -----------------------------------------------------------------------------
-- The reports need to name a building, colour it by health and attribute it to
-- an owner without joining back to buildings every time. Purely additive: both
-- existing callers select named columns.

drop view if exists v_building_current_value;

create view v_building_current_value
with (security_invoker = on) as
select
  b.id            as building_id,
  b.account_id,
  b.name,
  b.entity,
  b.status,
  b.health_score,
  b.property_type_id,
  b.owner_id,
  b.square_footage,
  b.contract_end_date,
  p.monthly_value,
  p.annual_value,
  p.effective_date
from buildings b
left join building_contract_periods p
  on p.building_id = b.id and p.end_date is null
where b.deleted_at is null;

-- -----------------------------------------------------------------------------
-- 2. v_mrr_by_month — one row per month, company-wide
-- -----------------------------------------------------------------------------

create view v_mrr_by_month
with (security_invoker = on) as
select
  v.month,
  sum(v.monthly_value)             as mrr,
  count(distinct v.building_id)    as building_count,
  count(distinct v.account_id)     as account_count
from v_building_mrr_by_month v
group by v.month;

-- -----------------------------------------------------------------------------
-- 3. v_mrr_coverage — how much of the portfolio the MRR number actually covers
-- -----------------------------------------------------------------------------
-- The counts deliberately come from buildings, NOT from the MRR views.
-- v_building_mrr_by_month inner-joins its contract periods, so a building with
-- no contract disappears from it entirely and silently — and that building is
-- precisely what this view exists to count. Reading the denominator from the
-- same place as the numerator would always report 100% coverage.
--
-- Lost buildings are excluded from the denominator: they are not unpriced, they
-- are gone.

create view v_mrr_coverage
with (security_invoker = on) as
select
  count(*)                                                     as buildings_total,
  count(*) filter (where p.building_id is not null)            as buildings_with_value,
  count(distinct b.account_id)                                 as accounts_total,
  count(distinct b.account_id)
    filter (where p.building_id is not null)                   as accounts_with_value,
  coalesce(sum(p.monthly_value), 0)                            as mrr
from buildings b
left join building_contract_periods p
  on p.building_id = b.id and p.end_date is null
where b.deleted_at is null
  and b.status <> 'lost';

-- -----------------------------------------------------------------------------
-- 4. v_account_mrr_change — the account expansion report
-- -----------------------------------------------------------------------------
-- v_mrr_waterfall carries no account_id, so "who grew and who shrank" cannot be
-- answered from it. This re-derives the comparison per account.
--
-- coalesce(…, 0) throughout, on purpose: an account with no row for a month did
-- not bill that month. Leaving it null would drop the account from the ranking
-- instead of showing it as growth from zero.

create view v_account_mrr_change
with (security_invoker = on) as
with anchors as (
  select
     date_trunc('month', now())::date                          as m_now,
    (date_trunc('month', now()) - interval '3 months')::date    as m_3,
    (date_trunc('month', now()) - interval '6 months')::date    as m_6,
    (date_trunc('month', now()) - interval '12 months')::date   as m_12
)
select
  a.id                                          as account_id,
  a.name                                        as account_name,
  coalesce(now_v.mrr,  0)                       as mrr_now,
  coalesce(v3.mrr,     0)                       as mrr_3m,
  coalesce(v6.mrr,     0)                       as mrr_6m,
  coalesce(v12.mrr,    0)                       as mrr_12m,
  coalesce(now_v.mrr, 0) - coalesce(v3.mrr,  0) as change_3m,
  coalesce(now_v.mrr, 0) - coalesce(v6.mrr,  0) as change_6m,
  coalesce(now_v.mrr, 0) - coalesce(v12.mrr, 0) as change_12m,
  (select count(*)
     from v_building_current_value cv
    where cv.account_id = a.id
      and cv.monthly_value is not null)         as building_count
from accounts a
cross join anchors k
left join v_account_mrr_by_month now_v on now_v.account_id = a.id and now_v.month = k.m_now
left join v_account_mrr_by_month v3    on v3.account_id    = a.id and v3.month    = k.m_3
left join v_account_mrr_by_month v6    on v6.account_id    = a.id and v6.month    = k.m_6
left join v_account_mrr_by_month v12   on v12.account_id   = a.id and v12.month   = k.m_12
where a.deleted_at is null;

-- -----------------------------------------------------------------------------
-- 5. v_building_health_mrr — the client-health block on the dashboard
-- -----------------------------------------------------------------------------
-- health_score is nullable, so this view has a null row. That row is not a bug
-- to be filtered away: a building nobody has scored is a real state, and it
-- currently holds real revenue.

create view v_building_health_mrr
with (security_invoker = on) as
select
  v.health_score,
  count(*)                                                as building_count,
  count(distinct v.account_id)                            as account_count,
  count(*) filter (where v.monthly_value is not null)     as buildings_with_value,
  coalesce(sum(v.monthly_value), 0)                       as mrr
from v_building_current_value v
where v.status <> 'lost'
group by v.health_score;

-- -----------------------------------------------------------------------------
-- 6. v_opportunity_win_rate — one definition of win rate
-- -----------------------------------------------------------------------------
-- Read by the dashboard tile and by /reports/pipeline, so the two cannot
-- disagree. closed_without_date is here rather than left to the caller because
-- every screen that shows a win rate has to say how many of those wins have no
-- date behind them.

create view v_opportunity_win_rate
with (security_invoker = on) as
select
  count(*) filter (where s.is_won)                              as won,
  count(*) filter (where s.is_lost)                             as lost,
  count(*)                                                      as closed,
  case
    when count(*) > 0
    then round(count(*) filter (where s.is_won)::numeric * 100 / count(*), 1)
  end                                                           as win_rate,
  coalesce(sum(o.annual_value) filter (where s.is_won),  0)     as won_annual,
  coalesce(sum(o.annual_value) filter (where s.is_lost), 0)     as lost_annual,
  count(*) filter (where o.actual_close_date is null)           as closed_without_date,
  count(*) filter (where o.monthly_value is null)               as closed_without_value
from opportunities o
join pipeline_stages s on s.id = o.stage_id
where o.deleted_at is null
  and (s.is_won or s.is_lost);

-- -----------------------------------------------------------------------------
-- 7. v_pipeline_coverage — open pipeline, and how much of it carries a price
-- -----------------------------------------------------------------------------
-- Most open deals have no value. A pipeline total without the priced count
-- beside it reads as a small pipeline rather than an unpriced one.

create view v_pipeline_coverage
with (security_invoker = on) as
select
  count(*)                                                          as open_deals,
  count(*) filter (where o.monthly_value is not null)               as open_deals_priced,
  coalesce(sum(o.monthly_value), 0)                                 as open_monthly,
  coalesce(sum(o.annual_value), 0)                                  as open_annual,
  coalesce(sum(round(coalesce(o.annual_value, 0) * s.probability / 100.0, 2)), 0)
                                                                    as weighted_annual
from opportunities o
join pipeline_stages s on s.id = o.stage_id
where o.deleted_at is null
  and not s.is_won
  and not s.is_lost;

-- -----------------------------------------------------------------------------
-- 8. correct_open_contract_value() — fixing a typo without inventing history
-- -----------------------------------------------------------------------------
-- set_building_monthly_value() closes the current period and opens a new one.
-- That is right for a real price change and wrong for a wrong number: putting
-- a corrected figure through it records a contraction (or an expansion) in the
-- waterfall that never happened, and there is no way to take it back.
--
-- This amends the open period in place and writes no history at all. Use it
-- only when the stored figure was never true.

create function public.correct_open_contract_value(
  p_building_id   uuid,
  p_monthly_value numeric,
  p_notes         text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  update building_contract_periods
  set monthly_value = p_monthly_value,
      notes         = coalesce(p_notes, notes)
  where building_id = p_building_id
    and end_date is null
  returning id into v_id;

  if v_id is null then
    raise exception
      'Building % has no open contract period to correct. Use set_building_monthly_value() to open one.',
      p_building_id
      using errcode = 'no_data_found';
  end if;

  return v_id;
end;
$$;

comment on function public.correct_open_contract_value is
  'Amends the open contract period in place for a value that was simply wrong. '
  'Writes no history — use set_building_monthly_value() for a genuine price change.';

-- -----------------------------------------------------------------------------
-- 9. Grants
-- -----------------------------------------------------------------------------
-- The initial migration ends with "grant select on all tables in schema public",
-- which is a snapshot taken at that moment, not a standing rule. Everything
-- created by a later migration was never granted: v_building_hours,
-- v_building_scheduled_hours, v_pipeline_funnel, v_opportunity_stage_durations,
-- win_reasons, and v_opportunity_outcomes (dropped and recreated in
-- 20260813140000). Hosted Supabase masks this with its own default privileges,
-- so nothing is broken today — but a schema rebuilt anywhere else would fail
-- with "permission denied" on exactly the views the reports read.
--
-- Re-run the grants, then make it a rule so this stops recurring.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
