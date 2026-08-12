-- Takes the roster back out of the schema.
--
-- The previous comment named individuals, which meant every personnel change
-- needed a migration — and it went stale within the hour. Who has rate access
-- is recorded in CLAUDE.md and enforced by the profiles.sees_rates flag; the
-- database describes the mechanism, not the people.

comment on column profiles.sees_rates is
  'Controls access to employee pay rates, bill rates and labour margin, via the can_see_rates() policy on employee_compensation and employee_assignment_rates. See the roster in CLAUDE.md for who currently has it.';
