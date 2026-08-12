-- =============================================================================
-- Align the schema with what is actually in Ryan's spreadsheet
-- =============================================================================
-- Everything here comes from reading the real workbook rather than the spec.
-- Safe to run destructively on reference data because no accounts, buildings or
-- opportunities exist yet.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Health Score
-- -----------------------------------------------------------------------------
-- Ryan already runs the business on this and the dashboard summarises by it.

create type health_score as enum ('healthy', 'needs_attention', 'at_risk');

alter table buildings add column health_score health_score;

comment on column buildings.health_score is
  'Ryan''s working judgement of the relationship, from the Active Clients tab. Drives the client health summary on the dashboard.';


-- -----------------------------------------------------------------------------
-- 2. Ownership — primary plus an optional second
-- -----------------------------------------------------------------------------
-- The sheet records shared ownership ("Both", "Ryan / Robert"). One owner drives
-- reporting so nothing is double-counted; the second is recorded honestly.
-- Owner sits on the building as well as the account, because different sites in
-- one portfolio have different owners in the sheet.

alter table accounts      add column secondary_owner_id uuid references profiles (id);
alter table opportunities add column secondary_owner_id uuid references profiles (id);
alter table buildings     add column owner_id           uuid references profiles (id);
alter table buildings     add column secondary_owner_id uuid references profiles (id);

create index buildings_owner_idx on buildings (owner_id) where deleted_at is null;

comment on column accounts.secondary_owner_id is
  'Second person on the relationship. Reports group by owner_id only, so a shared account is never counted twice.';


-- -----------------------------------------------------------------------------
-- 3. More activity sources
-- -----------------------------------------------------------------------------
-- The real log shows iMessage, both calendars, Cowork and an automated logger.
-- New enum values cannot be used in the same transaction that adds them, which
-- is fine — nothing here inserts activities.

alter type activity_source add value if not exists 'imessage';
alter type activity_source add value if not exists 'google_calendar';
alter type activity_source add value if not exists 'outlook_calendar';
alter type activity_source add value if not exists 'cowork';
alter type activity_source add value if not exists 'phone';
alter type activity_source add value if not exists 'system';


-- -----------------------------------------------------------------------------
-- 4. Real deal stages
-- -----------------------------------------------------------------------------
-- Replaces the invented placeholders. Probabilities for Targeting, Pre-RFP,
-- RFP Sent and Verbal Commitment come from Ryan's own dashboard.
--
-- NEEDS RYAN: 'Hot Lead' and 'RFP Response' are not on his dashboard. The values
-- below are interpolated from the stages either side and should be corrected in
-- the Admin screen.

delete from pipeline_stages;

insert into pipeline_stages (name, sort_order, probability, is_won, is_lost) values
  ('Targeting',          1,   5, false, false),
  ('Hot Lead',           2,  10, false, false),  -- interpolated
  ('Pre-RFP',            3,  15, false, false),
  ('RFP Sent',           4,  35, false, false),
  ('RFP Response',       5,  50, false, false),  -- interpolated
  ('Verbal Commitment',  6,  75, false, false),
  ('Closed Won',         7, 100, true,  false),
  ('Closed Lost',        8,   0, false, true);


-- -----------------------------------------------------------------------------
-- 5. Real segments, as property types
-- -----------------------------------------------------------------------------
-- Taken from the Segment column of the Pipeline tab. "Healthcare / Office
-- (Union)" is the AFS side of the business.

delete from property_types;

insert into property_types (name, sort_order) values
  ('Healthcare',                     1),
  ('Office',                         2),
  ('CRE / Life Sci',                 3),
  ('Biotech / Life Sci',             4),
  ('Industrial',                     5),
  ('Property Mgmt',                  6),
  ('Government',                     7),
  ('Education',                      8),
  ('Multi-Family / Affordable Housing', 9),
  ('Healthcare / Office (Union)',   10),
  ('Other',                         11);


-- -----------------------------------------------------------------------------
-- 6. Known competitor
-- -----------------------------------------------------------------------------

insert into competitors (name, notes) values
  ('Janitronics', 'Won a contract from Beale''s — the only loss recorded in the Won/Loss tab.')
on conflict (name) do nothing;
