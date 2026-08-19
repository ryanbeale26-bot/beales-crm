-- -----------------------------------------------------------------------------
-- An index for the history feed
-- -----------------------------------------------------------------------------
-- `audit_log_record_idx` is (table_name, record_id, changed_at desc), which
-- serves one record's own History exactly. The company-wide feed orders by
-- time alone and filters on table_name, so it had nothing.
--
-- Trivial today at 2,000 rows. It is here because this table is the one that
-- grows every night once the mail ingest runs, and an index added later is an
-- index added after somebody has already noticed the screen is slow.

create index audit_log_recent_idx on audit_log (changed_at desc);
