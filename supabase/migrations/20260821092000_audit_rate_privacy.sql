-- -----------------------------------------------------------------------------
-- Keep pay rates out of the audit log for anyone who cannot see pay rates
-- -----------------------------------------------------------------------------
-- employee_compensation and employee_assignment_rates live in their own tables
-- precisely because RLS filters rows and not columns, and can_see_rates() keeps
-- them away from anyone without profiles.sees_rates.
--
-- Both tables are also in the `audited` array, so every pay rate and bill rate
-- ever set is sitting in audit_log.old_values / new_values as raw jsonb -- and
-- audit_log's only policy tested is_member(). Anyone who can sign in could read
-- every rate change straight off /rest/v1/audit_log. The rate tables' own RLS
-- was being walked around by their own history.
--
-- Fixed here rather than in the screen that surfaces it, because a screen only
-- protects itself: a report, a CSV export, or a PostgREST call from a phone all
-- go around it. The database refusing the rows protects all three.

drop policy audit_log_select on audit_log;

create policy audit_log_select on audit_log
  for select to authenticated
  using (
    public.is_member()
    and (
      table_name not in ('employee_compensation', 'employee_assignment_rates')
      or public.can_see_rates()
    )
  );

comment on table audit_log is
  'Who changed what, written by trigger. Rows for the two rate tables are visible only to profiles with sees_rates -- see audit_log_select.';
