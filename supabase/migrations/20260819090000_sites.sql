-- ---------------------------------------------------------------------------
-- Sites: the physical building, separated from the commercial relationship.
-- ---------------------------------------------------------------------------
--
-- Phase 0 assumed one building, one account, and recorded the doubt as an open
-- question: "Can one building ever be billed to two accounts? Assumed no."
--
-- The answer is yes, and it is not an edge case. Beale's sells to the landlord
-- AND to that landlord's tenants at the same address:
--
--   90 Libbey Pkwy      Fox Rock Properties owns it; Beale's has a day porter
--                       and night cleaning contract with Fox Rock, and a
--                       separate contract with South Shore Health for the
--                       Wound Center, which is a tenant in the building.
--   101 Columbian St    South Shore Health owns it; Dana-Farber / Brigham are
--                       the tenants.
--
-- Those are two customers, two contracts, two renewal dates, two health scores
-- and one postcode. The existing schema models that as two `buildings` rows,
-- which is right commercially and wrong physically: square footage gets typed
-- twice, "how many buildings do we service" double counts, and the Granola
-- title matcher cannot tell a genuine ambiguity from a pair of records that
-- are the same place.
--
-- So `buildings` is left exactly as it is — one account's contract at one
-- place — and the physical building becomes its own row that several of them
-- can point at.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH: the revenue model.
-- `building_contract_periods` and all six MRR views are untouched, and no
-- column they read changes type or meaning. That is not conservatism for its
-- own sake — three of the records this migration exists to untangle carry
-- $13,100 of a reported $47,148 MRR between them, so a schema change that
-- could move the dashboard as a side effect is a schema change that would
-- destroy the trust the coverage notes were built to earn.
-- ---------------------------------------------------------------------------


-- Which side of the lease Beale's contract is with.
--
-- Named `landlord` rather than `owner` on purpose: `buildings.owner_id` already
-- exists and means the Beale's person responsible for the account. Two
-- different "owner"s on one table is how somebody eventually reads the wrong
-- one in a report.
--
-- Nullable on the column, because 38 of 38 buildings have never been asked this
-- and a NOT NULL default would assert an answer nobody gave. Required fields
-- are the enemy; an honest blank is better than a confident guess.
create type building_tenancy as enum ('landlord', 'tenant');


create table sites (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (name <> ''),
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  postal_code     text,
  -- Square footage belongs to the building, not to a contract in it. 25 of 38
  -- buildings are missing it, and the duplicate pairs would have needed it
  -- entered twice and kept in step forever.
  square_footage  integer,
  floors          integer,
  notes           text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index sites_name_idx    on sites (lower(name))          where deleted_at is null;
create index sites_address_idx on sites (lower(address_line1)) where deleted_at is null;


-- `on delete set null`, never cascade. Deleting a site must not be capable of
-- deleting a contract — the commercial record is the one with money on it, and
-- it has to survive somebody tidying up the physical list.
alter table buildings add column site_id  uuid references sites (id) on delete set null;
alter table buildings add column tenancy  building_tenancy;

create index buildings_site_idx on buildings (site_id) where deleted_at is null;

comment on column buildings.site_id is
  'The physical building this contract is at. Several buildings rows may share '
  'one site: the landlord contract and each tenant contract are separate '
  'commercial relationships at the same address.';

comment on column buildings.tenancy is
  'Whether this contract is with the building''s landlord or with a tenant in '
  'it. Null means nobody has said yet.';


-- ---------------------------------------------------------------------------
-- Moving a contract onto the record it should always have been on.
-- ---------------------------------------------------------------------------
--
-- The duplicate pairs put the money on the wrong half. $2,100 sits on
-- `90 Libbey St` when the Wound Center contract belongs to South Shore Health,
-- and there is no safe way to move it by hand: ending the period on one
-- building and opening it on the other writes $2,100 of CHURN and $2,100 of
-- NEW BUSINESS into the same month of the revenue waterfall — a contraction
-- and a win that never happened, permanently, with no screen to take it back.
--
-- This repoints the existing period rows instead. Same rows, same values, same
-- effective dates, different building. Company-wide MRR in every month is
-- arithmetically unchanged because the waterfall sums the same rows; what
-- changes is which building and which account they roll up to, which is the
-- entire point. It is the same argument as correct_open_contract_value(): a
-- correction restates history rather than recording a movement.
--
-- Refuses when the target already has an open period, because two open periods
-- on one building double-count it in every MRR view for ever.
create function move_contract_periods_to_building(
  p_from_building uuid,
  p_to_building   uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can move contract history between buildings.';
  end if;

  if p_from_building = p_to_building then
    raise exception 'Source and destination are the same building.';
  end if;

  if not exists (select 1 from buildings where id = p_from_building and deleted_at is null) then
    raise exception 'The building being moved from does not exist.';
  end if;

  if not exists (select 1 from buildings where id = p_to_building and deleted_at is null) then
    raise exception 'The building being moved to does not exist.';
  end if;

  if exists (
    select 1 from building_contract_periods
    where building_id = p_to_building and end_date is null
  ) then
    raise exception
      'The destination building already has an open contract period. Moving '
      'another one onto it would bill the same site twice in every month of '
      'the revenue report. Close or correct the existing period first.';
  end if;

  update building_contract_periods
     set building_id = p_to_building
   where building_id = p_from_building;

  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

comment on function move_contract_periods_to_building(uuid, uuid) is
  'Repoints every contract period from one building to another without writing '
  'churn or new business into the revenue waterfall. For correcting duplicate '
  'records only — a genuine price change still goes through '
  'set_building_monthly_value().';


-- ---------------------------------------------------------------------------
-- What is actually at each site.
-- ---------------------------------------------------------------------------
--
-- A view rather than stored counts, for the same reason the win rate and the
-- gap census are views: a stored "this site has two contracts" is wrong the
-- moment somebody adds a third, and would need a job to unstale it.
-- security_invoker = on so this obeys the caller's RLS rather than the view
-- owner's. Without it a view is a hole straight through every policy on the
-- tables underneath it.
create view v_site_contracts
with (security_invoker = on) as
select
  s.id                                        as site_id,
  s.name                                      as site_name,
  s.address_line1,
  s.city,
  s.square_footage,
  count(b.id)                                 as contract_count,
  count(*) filter (where b.tenancy = 'landlord') as landlord_contracts,
  count(*) filter (where b.tenancy = 'tenant')   as tenant_contracts,
  count(distinct b.account_id)                as account_count,
  coalesce(sum(cp.monthly_value), 0)          as monthly_value
from sites s
left join buildings b
  on b.site_id = s.id
 and b.deleted_at is null
left join building_contract_periods cp
  on cp.building_id = b.id
 and cp.end_date is null
where s.deleted_at is null
group by s.id, s.name, s.address_line1, s.city, s.square_footage;

comment on view v_site_contracts is
  'One row per physical building, with how many separate Beale''s contracts sit '
  'on it and what they are worth together. The honest answer to "how many '
  'buildings do we service", which counting the buildings table double counts.';


-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------

alter table sites enable row level security;

create policy members_select on sites for select to authenticated using (public.is_member());
create policy members_insert on sites for insert to authenticated with check (public.is_member());
create policy members_update on sites for update to authenticated using (public.is_member()) with check (public.is_member());
create policy members_delete on sites for delete to authenticated using (public.is_member());

create trigger sites_audit
after insert or update or delete on sites
for each row execute function public.write_audit_log();

create trigger sites_set_updated_at
before update on sites
for each row execute function public.touch_updated_at();

-- `grant ... on all` is a snapshot, not a rule — the mistake Phase 5 found,
-- where six objects created after the original grant were invisible to
-- `authenticated` on any database rebuilt from these files. Re-run it, and
-- db:verify asserts every view is selectable.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
