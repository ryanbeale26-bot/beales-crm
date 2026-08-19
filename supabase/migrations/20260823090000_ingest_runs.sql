-- -----------------------------------------------------------------------------
-- ingest_runs — did the nightly job actually run, and did it work
-- -----------------------------------------------------------------------------
-- Nothing has ever recorded this. The only trace a run happened is the JSON the
-- cron route returns and Vercel's own log, and `/admin/ingest` reports "last
-- seen" from `ingested_items` — which only moves when something is *ingested*.
--
-- So a night where nothing arrived looks exactly like a night where the cron
-- never fired, or the function timed out, or the ingest profile failed to sign
-- in, or Granola answered 401 because somebody rotated the key. That gap is
-- live today for the Granola ingest, and 7b would multiply it across five
-- mailboxes.
--
-- The columns mirror RunSummary in src/lib/ingest/run.ts field for field. When
-- that type gains a number, this table should gain a column.

create table ingest_runs (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,

  -- Null means "still running, or died before it could say". That is the whole
  -- reason the row is written at the START of a run and updated at the end: a
  -- run killed by a timeout leaves a row saying so, which is precisely the
  -- failure this table exists to make visible. A row written only on success
  -- would be missing exactly when it mattered.
  ok                  boolean,
  ran_for_ms          integer,

  -- Which connectors were wired up that night. Granola is absent when the key
  -- is unset, so this also records "nothing was configured" rather than
  -- leaving it to be inferred from zero counts.
  sources             text[] not null default '{}',

  seen                integer not null default 0,
  ingested            integer not null default 0,
  already_seen        integer not null default 0,
  unknown_senders     integer not null default 0,
  ambiguous           integer not null default 0,
  unmatched           integer not null default 0,
  activities_created  integer not null default 0,
  next_steps_created  integer not null default 0,
  suggestions_written integer not null default 0,

  -- Hit the wall-clock deadline. Not a failure: state lives per item in
  -- ingested_items, so a deadline is a pause and the next run continues.
  stopped_early       boolean not null default false,

  -- Sources that reported a short read. Granola has always returned
  -- cursor: 'truncated' for this and nothing has ever read it.
  truncated           text[] not null default '{}',

  -- Already prefixed "<source>: <message>" by run.ts.
  errors              text[] not null default '{}'
);

-- The only question anybody asks of this table is "what happened lately".
create index ingest_runs_recent_idx on ingest_runs (started_at desc);

comment on table ingest_runs is
  'One row per nightly ingest, written when it starts and updated when it ends. A row with a null ok is a run that died. No retention job: two runs a night is ~730 rows a year.';

-- Same call as ingested_items: every member reads and writes, because the
-- ingest profile is a member and not an admin. Deliberately NOT audited — it is
-- machine-written twice a night, and auditing it would grow audit_log faster
-- than the thing it records.
alter table ingest_runs enable row level security;

create policy members_select on ingest_runs
  for select to authenticated using (public.is_member());
create policy members_insert on ingest_runs
  for insert to authenticated with check (public.is_member());
create policy members_update on ingest_runs
  for update to authenticated using (public.is_member()) with check (public.is_member());

-- No delete policy on purpose. Nothing in the app removes a run, and a history
-- of failures is worth more than a tidy table.

grant select, insert, update on ingest_runs to authenticated;
