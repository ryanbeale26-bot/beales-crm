-- -----------------------------------------------------------------------------
-- ingest_runs.next_steps_updated — a meeting that moved
-- -----------------------------------------------------------------------------
-- 20260818090000_ingest.sql said, of next_steps, that "a calendar event that
-- moves is updated rather than duplicated". The unique(source, external_id) it
-- was describing did stop the duplication, but nothing anywhere performed the
-- update: run.ts short-circuited on any item already linked, before anything
-- was compared, so a rescheduled meeting kept its old due_at for ever. Once the
-- dashboard strip started rendering next steps that stopped being an
-- inaccuracy and became a lie on the first screen anybody opens — a Tuesday
-- that had moved to Thursday, and then a Tuesday sitting in "Still open" as
-- though it had been missed.
--
-- This column is what makes the fix VISIBLE. Without it the only evidence a
-- reschedule ever landed is the dashboard reading differently from how somebody
-- remembers it reading yesterday, which is no evidence at all.
--
-- Additive, and no policy or grant work: the policies on ingest_runs are
-- table-wide and `grant select, insert, update on ingest_runs to authenticated`
-- covers a column added later.
--
-- The instruction to do this is in that table's own comment: "The columns
-- mirror RunSummary in src/lib/ingest/run.ts field for field. When that type
-- gains a number, this table should gain a column."

alter table ingest_runs
  add column next_steps_updated integer not null default 0;

comment on column ingest_runs.next_steps_updated is
  'Open next steps whose calendar event had moved or been renamed since we last '
  'saw it. Counts rows CHANGED, not rows checked — an unchanged meeting seen '
  'again is not one of these. A closed next step is never counted, because a '
  'nightly run does not reopen a decision somebody took.';
