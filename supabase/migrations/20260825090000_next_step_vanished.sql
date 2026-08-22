-- -----------------------------------------------------------------------------
-- A meeting that has gone from the calendar altogether
-- -----------------------------------------------------------------------------
-- The other half of the reschedule problem, and a different KIND of problem.
--
-- A reschedule is an update: the event arrives carrying a new time and
-- nextStepPatch() compares it. A cancellation is ABSENCE — delete a meeting in
-- Outlook and Graph simply stops returning it from calendarView, so nothing
-- arrives at all and nothing is ever compared. The next step went overdue, fell
-- into "Still open" on the dashboard strip, and stayed there for ever.
--
-- What this does NOT do is close it. The nightly job flags; a person decides.
-- Absence is an inference, and this app's standing rule is that a link is
-- applied only when it is a fact. Auto-dismissing a real meeting because Graph
-- had a bad night is a worse failure than the bug being fixed: a wrong flag
-- costs a glance, a wrong dismissal silently removes a meeting from the only
-- screen it appears on. So the row stays `open` and there is deliberately no
-- new next_step_status value.
--
-- 1. The counters go on ingested_items, NOT on next_steps
-- -----------------------------------------------------------------------------
-- next_steps is in the `audited` array; ingested_items deliberately is not.
-- Believing an absence takes three misses, so putting the counter on the
-- audited table would write three audit rows per vanished meeting into the very
-- table whose History is rendered on the record pages — noise, in the place
-- this app is most careful about noise.
--
-- The mirror is also where it BELONGS on the merits. ingested_items records
-- what the source said about an object; that we did not see it tonight is a
-- fact about the source object, not about the commitment a person made. What
-- goes on next_steps is the conclusion, written once.
--
-- 2. Two conditions, not one, because the job runs TWICE a night
-- -----------------------------------------------------------------------------
-- vercel.json fires at 07:00 and 09:00 UTC, so three misses alone is about a
-- night and a half rather than the three nights the threshold is meant to mean.
-- first_missed_at is what turns a count of runs into a span of days, and it
-- survives a night where only one pass ran because the first hit its deadline.
--
-- 3. vanished_reason, because the two cases are not equally certain
-- -----------------------------------------------------------------------------
-- 'cancelled' is a fact Graph stated: it returned the event with isCancelled
-- set, which cannot be a bad night — the event came back fine, with a flag on
-- it. 'absent' is an inference from three nights of silence. The strip says
-- which, because "Cancelled in Outlook" and "No longer on the calendar" deserve
-- different confidence from the person reading them.
--
-- Additive throughout, and no policy or grant work: the policies on all three
-- tables are table-wide and the grants cover a column added later.

alter table ingested_items
  add column missed_sightings integer not null default 0,
  add column first_missed_at  timestamptz;

comment on column ingested_items.missed_sightings is
  'How many consecutive complete calendar windows have come back WITHOUT this '
  'event. Reset to zero the moment it is seen again. Only ever nonzero for a '
  'calendar item: a source that cannot vouch for a complete window never '
  'produces a miss.';

comment on column ingested_items.first_missed_at is
  'When the current run of misses began. Stamped on the FIRST miss and not '
  'moved by later ones, because it is what measures elapsed days rather than '
  'elapsed runs — the job fires twice a night, so counting runs alone would '
  'believe an absence in a night and a half.';

alter table next_steps
  add column vanished_at     timestamptz,
  add column vanished_reason text check (vanished_reason in ('cancelled', 'absent'));

comment on column next_steps.vanished_at is
  'When the calendar stopped offering this meeting. The row stays OPEN and is '
  'never closed by the job — this only marks it on the dashboard strip, where '
  'Dismiss and Undo already are. Cleared if the meeting comes back.';

comment on column next_steps.vanished_reason is
  'Which kind of disappearance. ''cancelled'' is a fact: Graph returned the '
  'event marked isCancelled. ''absent'' is an inference: three complete '
  'calendar windows in a row, spanning at least 48 hours, did not hold it.';

alter table ingest_runs
  add column next_steps_vanished integer not null default 0;

comment on column ingest_runs.next_steps_vanished is
  'Open next steps flagged this run as no longer on the calendar. Counts rows '
  'FLAGGED, not rows checked or rows still missing — a meeting already flagged '
  'is not counted again, and an accumulating miss that has not yet been '
  'believed is not counted at all. Rendered on /admin/ingest only when above '
  'zero, like next_steps_updated beside it.';
