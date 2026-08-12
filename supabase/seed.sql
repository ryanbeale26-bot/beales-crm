-- =============================================================================
-- Demo data — development only
-- =============================================================================
-- Every name here is deliberately, obviously fake. No real Beale's building,
-- customer, employee or contract value appears in this file, because seed data
-- that looks real eventually gets quoted in a meeting as though it were.
--
-- This never runs against production. It is applied by `supabase db reset`
-- against a local database only.
-- =============================================================================

begin;

insert into accounts (id, name, account_type, status, notes) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Demo Property Group',   'Property management', 'active',   'Sample record — not a real customer.'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Example Health System', 'Healthcare',          'active',   'Sample record — not a real customer.'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'Sample Labs Inc',       'Life science',        'prospect', 'Sample record — not a real customer.')
on conflict (id) do nothing;

insert into buildings (id, account_id, name, city, state, entity, square_footage, status, contract_start_date) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '1 Example Plaza',    'Boston',    'MA', 'beales', 120000, 'active',  current_date - interval '18 months'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', '2 Example Plaza',    'Boston',    'MA', 'beales',  85000, 'active',  current_date - interval '12 months'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 'Sample Medical Park','Quincy',    'MA', 'afs',    210000, 'active',  current_date - interval '9 months'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000003', 'Placeholder Labs',   'Cambridge', 'MA', 'beales',  60000, 'pending', null)
on conflict (id) do nothing;

-- Contract values, written through the helper so history behaves like the real thing.
select set_building_monthly_value('bbbbbbbb-0000-4000-8000-000000000001', 12000, (current_date - interval '18 months')::date, 'initial');
select set_building_monthly_value('bbbbbbbb-0000-4000-8000-000000000001', 13500, (current_date - interval '4 months')::date,  'scope_add');
select set_building_monthly_value('bbbbbbbb-0000-4000-8000-000000000002',  8000, (current_date - interval '12 months')::date, 'initial');
select set_building_monthly_value('bbbbbbbb-0000-4000-8000-000000000003', 24000, (current_date - interval '9 months')::date,  'initial');

insert into contacts (id, first_name, last_name, title, account_id, email, contact_role) values
  ('cccccccc-0000-4000-8000-000000000001', 'Sample',  'Manager',   'Portfolio Manager',  'aaaaaaaa-0000-4000-8000-000000000001', 'sample.manager@example.test',  'Decision maker'),
  ('cccccccc-0000-4000-8000-000000000002', 'Example', 'Director',  'Facilities Director','aaaaaaaa-0000-4000-8000-000000000002', 'example.director@example.test','EVS/facilities manager')
on conflict (id) do nothing;

-- One contact covering several buildings, which is the normal case.
insert into contact_buildings (contact_id, building_id, is_primary) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', true),
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', true),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', true)
on conflict do nothing;

insert into employees (id, first_name, last_name, title, status, start_date) values
  ('dddddddd-0000-4000-8000-000000000001', 'Demo',   'Cleaner',    'Custodian',       'active', current_date - interval '2 years'),
  ('dddddddd-0000-4000-8000-000000000002', 'Sample', 'Supervisor', 'Site Supervisor', 'active', current_date - interval '3 years')
on conflict (id) do nothing;

insert into employee_assignments (id, employee_id, building_id, scheduled_hours_per_week, shift, start_date) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 40, 'Nights', current_date - interval '2 years'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', 25, 'Days',   current_date - interval '9 months')
on conflict (id) do nothing;

insert into employee_assignment_rates (assignment_id, pay_rate, bill_rate) values
  ('eeeeeeee-0000-4000-8000-000000000001', 20.00, 32.00),
  ('eeeeeeee-0000-4000-8000-000000000002', 24.00, 38.00)
on conflict (assignment_id) do nothing;

insert into opportunities (id, name, account_id, city, state, stage_id, monthly_value, expected_close_date)
select
  'ffffffff-0000-4000-8000-000000000001',
  'Placeholder Labs — nightly cleaning',
  'aaaaaaaa-0000-4000-8000-000000000003',
  'Cambridge', 'MA',
  id, 9500, current_date + interval '45 days'
from pipeline_stages where name = 'RFP Sent'
on conflict (id) do nothing;

insert into activities (activity_type_id, subject, body, building_id, occurred_at)
select id, 'Walkthrough with property manager',
       'Sample activity so timelines are not empty in development.',
       'bbbbbbbb-0000-4000-8000-000000000001',
       now() - interval '3 days'
from activity_types where name = 'Walkthrough';

insert into activities (activity_type_id, subject, body, account_id, occurred_at)
select id, 'Monthly check-in call',
       'Sample activity so timelines are not empty in development.',
       'aaaaaaaa-0000-4000-8000-000000000002',
       now() - interval '10 days'
from activity_types where name = 'Call';

insert into projects (building_id, project_type_id, name, scheduled_date, quoted_amount, status)
select 'bbbbbbbb-0000-4000-8000-000000000001', id, 'Lobby carpet extraction',
       current_date + interval '20 days', 3200, 'scheduled'
from project_types where name = 'Carpet extraction';

commit;
