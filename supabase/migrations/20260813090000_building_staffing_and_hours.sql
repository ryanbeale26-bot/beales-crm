-- =============================================================================
-- Service types, contracted hours, and who works at each building
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Service types
-- -----------------------------------------------------------------------------
-- A building often has more than one — the spreadsheet shows "Janitorial +
-- Maintenance" — so these hang off the existing building_services join table
-- rather than becoming a single column.

insert into service_types (name, sort_order) values
  ('Janitorial',  1),
  ('Maintenance', 2),
  ('HVAC',        3),
  ('Security',    4)
on conflict (name) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Contracted hours on the building
-- -----------------------------------------------------------------------------
-- These are the hours the contract calls for. What the crew is actually
-- scheduled for lives on employee_assignments, and the two are deliberately
-- separate so a gap between them is visible rather than hidden.

alter table buildings
  add column day_porter               boolean not null default false,
  add column day_porter_hours_per_day numeric(5,2) check (day_porter_hours_per_day >= 0),
  add column day_porter_days_per_week numeric(3,1) default 5
    check (day_porter_days_per_week between 0 and 7),
  add column night_hours_per_night    numeric(5,2) check (night_hours_per_night >= 0),
  add column night_days_per_week      numeric(3,1) default 5
    check (night_days_per_week between 0 and 7),
  add column weekend_service          boolean not null default false,
  add column weekend_hours_per_week   numeric(5,2) check (weekend_hours_per_week >= 0);

comment on column buildings.weekend_hours_per_week is
  'Total weekend hours per week, not per weekend day — avoids the "is that each day or both days" ambiguity.';

-- Replaced by the fields above, which say the same thing with actual numbers.
alter table buildings drop column service_days;
alter table buildings drop column service_nights;


-- -----------------------------------------------------------------------------
-- 3. What someone does at a building
-- -----------------------------------------------------------------------------

create type assignment_role as enum (
  'day_porter',
  'night_cleaner',
  'lead_cleaner',
  'supervisor',
  'other'
);

alter table employee_assignments add column role assignment_role;

create index assignments_role_idx on employee_assignments (building_id, role);


-- -----------------------------------------------------------------------------
-- 4. Hours maths, in one place
-- -----------------------------------------------------------------------------
-- Weekly, monthly and annual hours are derived here rather than in React, for
-- the same reason MRR is: one definition, read by every screen and report.
-- Monthly is the annual figure divided by twelve, not weekly × 4, because most
-- months are longer than four weeks and the difference compounds.

create view v_building_hours
with (security_invoker = on) as
select
  b.id as building_id,
  b.account_id,
  round(
    case when b.day_porter
         then coalesce(b.day_porter_hours_per_day, 0) * coalesce(b.day_porter_days_per_week, 5)
         else 0 end
  + coalesce(b.night_hours_per_night, 0) * coalesce(b.night_days_per_week, 5)
  + case when b.weekend_service then coalesce(b.weekend_hours_per_week, 0) else 0 end
  , 2) as weekly_hours,
  round((
    case when b.day_porter
         then coalesce(b.day_porter_hours_per_day, 0) * coalesce(b.day_porter_days_per_week, 5)
         else 0 end
  + coalesce(b.night_hours_per_night, 0) * coalesce(b.night_days_per_week, 5)
  + case when b.weekend_service then coalesce(b.weekend_hours_per_week, 0) else 0 end
  ) * 52 / 12, 2) as monthly_hours,
  round((
    case when b.day_porter
         then coalesce(b.day_porter_hours_per_day, 0) * coalesce(b.day_porter_days_per_week, 5)
         else 0 end
  + coalesce(b.night_hours_per_night, 0) * coalesce(b.night_days_per_week, 5)
  + case when b.weekend_service then coalesce(b.weekend_hours_per_week, 0) else 0 end
  ) * 52, 2) as annual_hours
from buildings b
where b.deleted_at is null;

-- What the crew is actually scheduled for, to compare against the contract.
create view v_building_scheduled_hours
with (security_invoker = on) as
select
  a.building_id,
  sum(a.scheduled_hours_per_week)                                            as scheduled_weekly_hours,
  count(*)                                                                   as staff_count,
  count(*) filter (where a.role = 'day_porter')                              as day_porters,
  count(*) filter (where a.role = 'night_cleaner')                           as night_cleaners,
  count(*) filter (where a.role = 'lead_cleaner')                            as lead_cleaners
from employee_assignments a
where a.end_date is null
group by a.building_id;
