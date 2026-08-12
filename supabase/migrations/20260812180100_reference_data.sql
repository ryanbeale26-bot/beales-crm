-- =============================================================================
-- Baseline reference data
-- =============================================================================
-- These are starting points, not decisions. All of them are editable from the
-- Admin screen once it exists, and several need Ryan's review:
--
--   * property_types  — taken from the account-type list in the spec. The real
--                       list of building types has not been confirmed.
--   * pipeline_stages — the six from the spec. Explicitly NOT settled; revisit
--                       at Phase 3 against the stage column in tab 1-Pipeline.
--   * loss_reasons    — generic placeholders. Replace with the real reasons
--                       from tab 5-Won/Loss Analysis at Phase 3.
--   * lead_sources    — generic placeholders.
--
-- activity_types and project_types come straight from the spec and should be
-- close to correct already.
-- =============================================================================

insert into activity_types (name, sort_order) values
  ('Call',           1),
  ('Email',          2),
  ('Meeting',        3),
  ('Site visit',     4),
  ('Walkthrough',    5),
  ('Complaint',      6),
  ('Proposal sent',  7),
  ('Note',           8)
on conflict (name) do nothing;

insert into project_types (name, sort_order) values
  ('Carpet extraction',      1),
  ('VCT strip & wax',        2),
  ('Machine scrub & recoat', 3),
  ('Burnish',                4),
  ('Interior windows',       5),
  ('Exterior windows',       6),
  ('Construction clean',     7),
  ('Deep clean',             8),
  ('Floor restoration',      9),
  ('Other',                 10)
on conflict (name) do nothing;

-- NEEDS REVIEW — building types, borrowed from the account-type list.
insert into property_types (name, sort_order) values
  ('Property management',   1),
  ('Healthcare',            2),
  ('Life science',          3),
  ('Corporate/commercial',  4),
  ('Education',             5),
  ('Industrial',            6),
  ('Government',            7)
on conflict (name) do nothing;

-- NEEDS REVIEW — placeholder stage names and probabilities. Phase 3 replaces
-- these with the real ones. Renaming a stage here is a normal edit, not a
-- migration, which is exactly why stages are a table.
insert into pipeline_stages (name, sort_order, probability, is_won, is_lost) values
  ('Identified',           1,  10, false, false),
  ('Qualified',            2,  25, false, false),
  ('Walkthrough complete', 3,  40, false, false),
  ('Proposal delivered',   4,  60, false, false),
  ('Negotiation',          5,  80, false, false),
  ('Closed won',           6, 100, true,  false),
  ('Closed lost',          7,   0, false, true)
on conflict (name) do nothing;

-- NEEDS REVIEW — placeholders until the real loss reasons come from the sheet.
insert into loss_reasons (name, applies_to, sort_order) values
  ('Price',                    'both',        1),
  ('Service quality',          'both',        2),
  ('Change in ownership',      'both',        3),
  ('Brought in-house',         'both',        4),
  ('Contract not renewed',     'building',    5),
  ('Went with incumbent',      'opportunity', 6),
  ('No decision',              'opportunity', 7),
  ('Other',                    'both',        8)
on conflict (name) do nothing;

-- NEEDS REVIEW — placeholders.
insert into lead_sources (name, sort_order) values
  ('Referral',          1),
  ('Existing client',   2),
  ('Broker',            3),
  ('Cold outreach',     4),
  ('Inbound enquiry',   5),
  ('Other',             6)
on conflict (name) do nothing;
