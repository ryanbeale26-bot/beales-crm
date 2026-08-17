-- =============================================================================
-- Phase 5b — the gap-filler
-- =============================================================================
-- The app is feature-rich and data-poor: 27 of 38 buildings have no contract
-- value, 38 of 38 no segment, 28 of 30 open deals no price, 63 of 97 contacts
-- no account. Every report says so on the tile, which is honest but is not a
-- fix. The fix is a round trip through Excel — download the records, fill the
-- blanks, upload, read every change, commit, undo.
--
-- Everything here exists to make the *undo* half of that safe.
--
-- The existing importer undoes a batch by deleting rows stamped with its
-- import_batch_id. The gap-filler only ever UPDATEs rows that already exist, so
-- there is nothing to delete — and stamping a batch id on a building it merely
-- edited would make undo delete a real building. (commitWonLost already refuses
-- to stamp rows it updates, for exactly this reason.)
--
-- So a gap-fill batch keeps a per-field before/after journal instead, and undo
-- replays it.


-- -----------------------------------------------------------------------------
-- 1. import_field_changes — the journal
-- -----------------------------------------------------------------------------
-- One row per field actually changed. Written by apply_gap_fill() below, never
-- by the application, so old_value and new_value are always in the database's
-- own representation of the type rather than whatever JavaScript sent.
--
-- id is `generated always as identity`, matching audit_log and NOT bigserial:
-- the grants block gives `authenticated` SELECT on sequences but never USAGE,
-- so a bigserial default would fail with "permission denied for sequence" on
-- every insert. Identity columns need no separate sequence grant.
--
-- old_value/new_value are NOT NULL and carry 'null'::jsonb for "the field was
-- empty". to_jsonb(NULL::date) is SQL NULL, not jsonb null, and a nullable
-- column here would make "this field was blank before" indistinguishable from
-- "nothing was recorded" — which would make undo a silent no-op for the exact
-- case the gap-filler exists to serve.

create table import_field_changes (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references import_batches (id) on delete cascade,
  table_name  text not null,
  record_id   uuid not null,
  column_name text not null,
  old_value   jsonb not null,
  new_value   jsonb not null,
  created_at  timestamptz not null default now()
);

create index import_field_changes_batch_idx
  on import_field_changes (batch_id, id desc);

comment on table import_field_changes is
  'Before/after journal for gap-fill imports. Undo replays old_value, because a '
  'batch of UPDATEs cannot be undone by deleting batch-stamped rows.';


-- -----------------------------------------------------------------------------
-- 2. The allowlist
-- -----------------------------------------------------------------------------
-- apply_gap_fill() and rollback_field_changes() both build dynamic SQL from
-- table and column names held in a text column. That is an injection surface,
-- so nothing reaches format(%I) without passing through here first.
--
-- This is deliberately a function and not a table: reference data is editable
-- by an admin at /admin/reference, and a security boundary must not be.
--
-- Everything absent is absent on purpose. In particular:
--   opportunities.stage_id     — stamp_opportunity_close_date() is a BEFORE
--                                trigger on UPDATE OF stage_id that stamps
--                                close dates and raises on a reopened converted
--                                deal. Stages move on the board, not in a
--                                spreadsheet.
--   *.annual_value             — GENERATED ALWAYS ... STORED, never writable.
--   *.id, *.deleted_at,
--   *.import_batch_id          — identity and bookkeeping, not data.
--   profiles.role, *.name      — not gaps, and a bulk edit of either is a
--                                different conversation.
-- Money is absent too: buildings have no value column at all. A contract value
-- goes through fill_building_contract_value() further down.

create function public.gap_fill_allows(p_table text, p_column text)
returns boolean
language sql
immutable
as $$
  select (p_table, p_column) in (
    ('buildings', 'property_type_id'),
    ('buildings', 'square_footage'),
    ('buildings', 'contract_start_date'),
    ('buildings', 'contract_end_date'),
    ('buildings', 'health_score'),
    ('buildings', 'owner_id'),
    ('buildings', 'secondary_owner_id'),
    ('buildings', 'day_porter'),
    ('buildings', 'day_porter_hours_per_day'),
    ('buildings', 'day_porter_days_per_week'),
    ('buildings', 'night_hours_per_night'),
    ('buildings', 'night_days_per_week'),
    ('buildings', 'weekend_service'),
    ('buildings', 'weekend_hours_per_week'),

    ('opportunities', 'monthly_value'),
    ('opportunities', 'expected_close_date'),
    ('opportunities', 'account_id'),
    ('opportunities', 'owner_id'),
    ('opportunities', 'secondary_owner_id'),
    ('opportunities', 'property_type_id'),
    ('opportunities', 'opened_on'),

    ('contacts', 'account_id'),
    ('contacts', 'title'),
    ('contacts', 'email'),

    ('accounts', 'primary_contact_id'),
    ('accounts', 'owner_id'),
    ('accounts', 'secondary_owner_id')
  );
$$;

comment on function public.gap_fill_allows(text, text) is
  'The only (table, column) pairs a gap-fill import may write. A security '
  'boundary for dynamic SQL, which is why it is a function and not a table.';


-- Look up a column's real type, so a value can be cast to it rather than
-- guessed at. This is what makes one code path work for uuid, date,
-- numeric(12,2), integer, boolean, text and the health_score enum alike.
create function public.gap_fill_column_type(p_table text, p_column text)
returns text
language sql
stable
set search_path = public
as $$
  select format_type(a.atttypid, a.atttypmod)
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = p_table
    and a.attname = p_column
    and a.attnum > 0
    and not a.attisdropped;
$$;


-- -----------------------------------------------------------------------------
-- 3. apply_gap_fill() — write the changes and journal them, atomically
-- -----------------------------------------------------------------------------
-- Supabase gives the application no transaction, and this has to do three
-- things together: work out which fields genuinely changed, update them, and
-- record what they were. Splitting that across PostgREST calls would leave a
-- building updated with no way back — the same failure that put
-- convert_opportunity_to_building() in the database.
--
-- Comparison happens *after* casting to the column's own type, which matters
-- more than it looks: jsonb preserves numeric scale, so '2500'::jsonb is not
-- equal to '2500.00'::jsonb. Comparing what JavaScript sent against what a
-- numeric(12,2) column holds would report a change on every money field
-- forever, and would make undo's "has someone edited this since?" check fire
-- on every one of them.
--
-- p_values is { column: value }. A jsonb null means "leave this field alone" —
-- blank cells never clear a field, so a half-filled re-upload cannot wipe data.
--
-- Returns the number of fields actually changed.

create function public.apply_gap_fill(
  p_table     text,
  p_record_id uuid,
  p_values    jsonb,
  p_batch_id  uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_col      text;
  v_type     text;
  v_incoming jsonb;
  v_text     text;
  v_new      jsonb;
  v_old      jsonb;
  v_sets     text[] := '{}';
  v_changed  integer := 0;
begin
  if p_table is null or p_record_id is null or p_batch_id is null then
    raise exception 'apply_gap_fill needs a table, a record and a batch';
  end if;

  for v_col, v_incoming in select key, value from jsonb_each(p_values) loop
    if not public.gap_fill_allows(p_table, v_col) then
      raise exception 'A gap fill may not write %.%', p_table, v_col
        using errcode = 'insufficient_privilege';
    end if;

    -- A blank cell leaves the field alone. There is no way to clear a field
    -- through an import at all; that is done on the record's own page.
    continue when v_incoming is null or jsonb_typeof(v_incoming) = 'null';

    v_type := public.gap_fill_column_type(p_table, v_col);
    if v_type is null then
      raise exception 'No such column %.%', p_table, v_col;
    end if;

    -- Round-trip the incoming value through the column's own type so the
    -- comparison below is between two values the database would store.
    -- #>> '{}' unwraps a jsonb scalar to bare text: to_jsonb of a uuid, date,
    -- text or enum is a *quoted* string, so ::text would carry the quotes into
    -- the cast and fail. This is the one extraction that works for every type
    -- in the allowlist.
    v_text := v_incoming #>> '{}';
    execute format('select to_jsonb(%L::%s)', v_text, v_type) into v_new;

    execute format('select coalesce(to_jsonb(t.%I), ''null''::jsonb) from %I t where t.id = $1',
                   v_col, p_table)
      using p_record_id
      into v_old;

    if v_old is null then
      raise exception 'No % row with id %', p_table, p_record_id
        using errcode = 'no_data_found';
    end if;

    continue when v_new = v_old;

    -- %L renders a SQL NULL as the NULL keyword rather than a quoted string,
    -- so this is correct for an empty old value too.
    v_sets := array_append(v_sets, format('%I = %L::%s', v_col, v_new #>> '{}', v_type));

    insert into import_field_changes (batch_id, table_name, record_id, column_name, old_value, new_value)
    values (p_batch_id, p_table, p_record_id, v_col, v_old, v_new);

    v_changed := v_changed + 1;
  end loop;

  -- One statement, so the audit trigger writes one row per record rather than
  -- one per field.
  if v_changed > 0 then
    execute format('update %I set %s where id = $1', p_table, array_to_string(v_sets, ', '))
      using p_record_id;
  end if;

  return v_changed;
end;
$$;

comment on function public.apply_gap_fill(text, uuid, jsonb, uuid) is
  'Applies a gap-fill row and journals every field it changed, in one '
  'transaction. A jsonb null leaves the field alone.';


-- -----------------------------------------------------------------------------
-- 4. rollback_field_changes() — undo
-- -----------------------------------------------------------------------------
-- Replays old_value back onto each record, but only where the field still holds
-- what this batch put there. Anyone can edit a building between the commit and
-- the undo, and the gap-fill filled a blank, so a later hand edit is almost
-- certainly the more considered value. Blindly reverting it would be worse than
-- an incomplete undo, so those fields are left alone and counted, and the UI
-- says how many.
--
-- Returns { reverted, skipped, records, skipped_fields: [ "buildings.<id>.col" ] }.

create function public.rollback_field_changes(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r          record;
  v_type     text;
  v_current  jsonb;
  v_sets     text[];
  v_reverted integer := 0;
  v_skipped  integer := 0;
  v_records  integer := 0;
  v_details  text[] := '{}';
begin
  -- One pass per record, newest batch entry first. Aggregating by column takes
  -- the earliest old_value and the latest new_value, so a column touched twice
  -- in one batch still unwinds to where it started.
  for r in
    select table_name, record_id,
           jsonb_object_agg(column_name, jsonb_build_object('old', old_value, 'new', new_value)) as fields
    from (
      select table_name, record_id, column_name,
             (array_agg(old_value order by id asc))[1]  as old_value,
             (array_agg(new_value order by id desc))[1] as new_value
      from import_field_changes
      where batch_id = p_batch_id
      group by table_name, record_id, column_name
    ) c
    group by table_name, record_id
  loop
    v_sets := '{}';

    declare
      k text;
      v jsonb;
    begin
      for k, v in select key, value from jsonb_each(r.fields) loop
        if not public.gap_fill_allows(r.table_name, k) then
          -- A journal row naming something outside the allowlist cannot have
          -- been written by apply_gap_fill(). Refuse it rather than execute it.
          v_skipped := v_skipped + 1;
          v_details := array_append(v_details, format('%s.%s.%s (not permitted)', r.table_name, r.record_id, k));
          continue;
        end if;

        v_type := public.gap_fill_column_type(r.table_name, k);
        continue when v_type is null;

        execute format('select coalesce(to_jsonb(t.%I), ''null''::jsonb) from %I t where t.id = $1',
                       k, r.table_name)
          using r.record_id
          into v_current;

        -- Row gone (deleted since the import). Nothing to put back.
        continue when v_current is null;

        if v_current is distinct from (v -> 'new') then
          v_skipped := v_skipped + 1;
          v_details := array_append(v_details, format('%s.%s.%s', r.table_name, r.record_id, k));
          continue;
        end if;

        v_sets := array_append(
          v_sets,
          format('%I = %L::%s', k, (v -> 'old') #>> '{}', v_type)
        );
        v_reverted := v_reverted + 1;
      end loop;
    end;

    if array_length(v_sets, 1) > 0 then
      execute format('update %I set %s where id = $1', r.table_name, array_to_string(v_sets, ', '))
        using r.record_id;
      v_records := v_records + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'reverted', v_reverted,
    'skipped', v_skipped,
    'records', v_records,
    'skipped_fields', to_jsonb(v_details)
  );
end;
$$;

comment on function public.rollback_field_changes(uuid) is
  'Undo for a gap-fill batch. Only restores a field that still holds what the '
  'batch wrote — anything edited by hand since is left alone and reported.';


-- -----------------------------------------------------------------------------
-- 5. fill_building_contract_value() — the first contract period, undoably
-- -----------------------------------------------------------------------------
-- A building's monthly value is not a column, so it cannot go through
-- apply_gap_fill(). It is a row in building_contract_periods written by
-- set_building_monthly_value().
--
-- Two traps this closes:
--
-- 1. set_building_monthly_value() returns the *existing* period's id unchanged
--    when the value has not moved. Since the gap-fill CSV exports current
--    values, a re-upload sends the same number back — and stamping the returned
--    id with a batch id would mean undo DELETED a real, pre-existing contract
--    period, dropping that building to $0 MRR forever with no screen to show
--    it. So this refuses outright unless the building has no period at all.
--
-- 2. Calling the function and then stamping the row are two PostgREST calls
--    with no transaction between them. Here they are one.
--
-- Refusing when *any* period exists, not just an open one, is deliberate: a
-- building with a closed period had a contract that ended, and starting a new
-- one after a gap is churn followed by new business in the waterfall — a real
-- business event that should be entered on the building page, not inferred
-- from a spreadsheet.

create function public.fill_building_contract_value(
  p_building_id    uuid,
  p_monthly_value  numeric,
  p_effective_date date,
  p_import_batch_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing integer;
  v_id       uuid;
begin
  select count(*) into v_existing
  from building_contract_periods
  where building_id = p_building_id;

  if v_existing > 0 then
    raise exception
      'Building % already has a contract value. Change it on the building page, where you can say whether it is a price change or a correction.',
      p_building_id
      using errcode = 'unique_violation';
  end if;

  v_id := public.set_building_monthly_value(
    p_building_id,
    p_monthly_value,
    coalesce(p_effective_date, current_date),
    'initial'::contract_change_reason,
    'Filled in by a gap-fill import'
  );

  update building_contract_periods
  set import_batch_id = p_import_batch_id
  where id = v_id;

  return v_id;
end;
$$;

comment on function public.fill_building_contract_value(uuid, numeric, date, uuid) is
  'Opens a building''s first contract period from a gap-fill import and stamps '
  'it so undo can remove it. Refuses if the building already has one.';


-- -----------------------------------------------------------------------------
-- 6. v_gap_census — what is still missing, counted once
-- -----------------------------------------------------------------------------
-- The census drives both the screen and the CSV downloads. It reads
-- v_mrr_coverage and v_pipeline_coverage for the two numbers those views
-- already own, rather than counting them again: two counts of one number
-- eventually disagree, and the revenue report is not the place for that to
-- happen. (Same reason win rate became a view rather than a line of TypeScript.)

create view v_gap_census
with (security_invoker = on) as
with buildings_live as (
  select * from buildings where deleted_at is null and status <> 'lost'
),
deals_open as (
  select o.*
  from opportunities o
  join pipeline_stages s on s.id = o.stage_id
  where o.deleted_at is null and not s.is_won and not s.is_lost
),
contacts_live as (
  select * from contacts where deleted_at is null
),
accounts_live as (
  select * from accounts where deleted_at is null
)
select 'buildings' as scope, 'monthly_value' as field, 'No contract value' as label,
       (select buildings_total - buildings_with_value from v_mrr_coverage) as missing,
       (select buildings_total from v_mrr_coverage) as total, 1 as sort_order
union all
select 'buildings', 'property_type_id', 'No segment',
       count(*) filter (where property_type_id is null), count(*), 2 from buildings_live
union all
-- Hours are gated by their booleans in v_building_hours, so "has hours" means
-- hours that actually count towards the weekly total.
select 'buildings', 'hours', 'No contracted hours',
       count(*) filter (where
         not (coalesce(day_porter, false) and coalesce(day_porter_hours_per_day, 0) > 0)
         and coalesce(night_hours_per_night, 0) = 0
         and not (coalesce(weekend_service, false) and coalesce(weekend_hours_per_week, 0) > 0)
       ), count(*), 3 from buildings_live
union all
select 'buildings', 'contract_end_date', 'No contract end date',
       count(*) filter (where contract_end_date is null), count(*), 4 from buildings_live
union all
select 'buildings', 'contract_start_date', 'No contract start date',
       count(*) filter (where contract_start_date is null), count(*), 5 from buildings_live
union all
select 'buildings', 'square_footage', 'No square footage',
       count(*) filter (where square_footage is null), count(*), 6 from buildings_live
union all
select 'buildings', 'health_score', 'Not health scored',
       count(*) filter (where health_score is null), count(*), 7 from buildings_live
union all
select 'buildings', 'owner_id', 'No owner',
       count(*) filter (where owner_id is null), count(*), 8 from buildings_live

union all
select 'deals', 'monthly_value', 'No monthly value',
       (select open_deals - open_deals_priced from v_pipeline_coverage),
       (select open_deals from v_pipeline_coverage), 1
union all
select 'deals', 'expected_close_date', 'No close date, or it has passed',
       count(*) filter (where expected_close_date is null or expected_close_date < current_date),
       count(*), 2 from deals_open
union all
select 'deals', 'account_id', 'Not linked to an account',
       count(*) filter (where account_id is null), count(*), 3 from deals_open
union all
select 'deals', 'opened_on', 'No opening date, so no sales cycle',
       count(*) filter (where opened_on is null), count(*), 4 from deals_open
union all
select 'deals', 'property_type_id', 'No segment',
       count(*) filter (where property_type_id is null), count(*), 5 from deals_open
union all
select 'deals', 'owner_id', 'No owner',
       count(*) filter (where owner_id is null), count(*), 6 from deals_open

union all
select 'contacts', 'account_id', 'Not linked to an account',
       count(*) filter (where account_id is null), count(*), 1 from contacts_live
union all
select 'contacts', 'email', 'No email address',
       count(*) filter (where email is null or email = ''), count(*), 2 from contacts_live
union all
select 'contacts', 'title', 'No job title',
       count(*) filter (where title is null or title = ''), count(*), 3 from contacts_live

union all
select 'accounts', 'primary_contact_id', 'No primary contact',
       count(*) filter (where primary_contact_id is null), count(*), 1 from accounts_live
union all
select 'accounts', 'owner_id', 'No owner',
       count(*) filter (where owner_id is null), count(*), 2 from accounts_live;

comment on view v_gap_census is
  'One row per field the gap-filler can fix, with how many records are still '
  'missing it. Drives /admin/gaps and the CSV downloads.';


-- -----------------------------------------------------------------------------
-- 7. RLS and grants
-- -----------------------------------------------------------------------------
-- import_field_changes follows import_batches and import_row_errors: everyone
-- reads, admins write. Writing one means running an import, and an import batch
-- is already admin-only.

alter table import_field_changes enable row level security;

create policy members_select on import_field_changes
  for select to authenticated using (public.is_member());

create policy admins_write on import_field_changes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
