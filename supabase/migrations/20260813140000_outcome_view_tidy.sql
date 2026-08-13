-- =============================================================================
-- Keep won and lost details on their own side of the outcomes view
-- =============================================================================
-- stamp_opportunity_close_date() deliberately leaves loss_reason_id,
-- competitor_id, win_reason_id and win_notes alone when a deal moves stage —
-- clearing them looks tidy and quietly destroys context, and a deal does get
-- dragged into the wrong column and back.
--
-- The cost of that showed up in testing: a deal that was closed lost and later
-- closed won still carried its loss reason, so v_opportunity_outcomes reported
-- a won deal with a reason for losing. The columns are right to keep; the
-- REPORTING surface is the wrong place to expose them.
--
-- So the view now shows loss fields only on a loss and win fields only on a win.
-- Nothing is deleted: the opportunities table still holds every value, the audit
-- log still holds every change, and the deal page reads the columns directly.
-- =============================================================================

drop view if exists v_opportunity_outcomes;

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
  case when s.is_lost then lr.id   end as loss_reason_id,
  case when s.is_lost then lr.name end as loss_reason,
  case when s.is_won  then wr.id   end as win_reason_id,
  case when s.is_won  then wr.name end as win_reason,
  case when s.is_won  then o.win_notes end as win_notes,
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
