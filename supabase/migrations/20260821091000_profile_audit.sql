-- -----------------------------------------------------------------------------
-- Audit profile changes
-- -----------------------------------------------------------------------------
-- The `audited` array in the initial schema covers accounts, buildings,
-- contacts and seven more, and leaves profiles out. That was fair when roles
-- were only ever set from the terminal. Since the People screen shipped, an
-- admin can change somebody's role, their rate access or their ability to sign
-- in from a browser -- and those are the most consequential edits in the app,
-- with no history behind them at all.
--
-- Attached individually rather than by editing the array, which is what every
-- migration since has done (sites, match_aliases, ingest).
--
-- profiles carries updated_at, so write_audit_log()'s no-op skip works here and
-- a save that changes nothing writes no row.

create trigger profiles_audit
  after insert or update or delete on profiles
  for each row execute function public.write_audit_log();
