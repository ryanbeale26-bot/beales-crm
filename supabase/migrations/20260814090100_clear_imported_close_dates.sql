-- =============================================================================
-- Phase 5 — clear the close dates the import invented
-- =============================================================================
-- stamp_opportunity_close_date() sets actual_close_date = current_date whenever
-- a deal enters a won or lost stage. That is right when someone drags a card.
-- It is wrong when a spreadsheet import inserts 25 already-closed deals: tab 1
-- carried no close date for its Closed Won rows, so every one of them was
-- stamped with the day of the import.
--
-- On the live database that is 13 deals all reading 2026-08-13, which would put
-- a spike of 13 wins into this month on every report that counts wins over
-- time — a spike that never happened.
--
-- Fixing the data rather than filtering it in six places, because the date is
-- equally wrong on the deal's own detail page. Once it is null, closed_month
-- and days_to_close in v_opportunity_outcomes are null too, and every report
-- excludes it for free. v_opportunity_win_rate.closed_without_date counts them
-- so the gap stays visible instead of becoming invisible.
--
-- Matched on the batch's own creation date, never on a date literal, so this is
-- reproducible and a no-op on a fresh database. The deal keeps its stage, its
-- value and its win/loss reason — only the invented date goes.
--
-- Narrow by design: a deal genuinely closed on the same day its batch was
-- imported would be caught too. None of the 13 is one — they are all historic
-- portfolio rows — and a date that is right can be re-entered, while a date
-- that is wrong is believed.

update opportunities o
set actual_close_date = null
from import_batches b
where o.import_batch_id = b.id
  and o.actual_close_date = (b.created_at at time zone 'UTC')::date
  and o.deleted_at is null;
