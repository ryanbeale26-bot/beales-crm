-- One offer per phrase per record.
--
-- v_alias_candidates derives a phrase from a building's ADDRESS and from its
-- NAME, and several buildings are named after their own address — "1 Brookline
-- Pl" is both. That produced two rows with the same alias and the same target,
-- which the admin screen renders as two chips that look identical, do the same
-- thing, and share a React key.
--
-- The ambiguity count is unaffected and stays as it was: it already counted
-- DISTINCT records rather than rows, precisely so that one record wearing two
-- hats was never mistaken for two records competing. This only stops the screen
-- offering the same click twice.
--
-- `distinct on` with Address ordered first, because an address is the stronger
-- of the two descriptions and is what the person is most likely to recognise.

create or replace view v_alias_candidates
with (security_invoker = on) as
with raw as (
  select distinct
    public.normalise_alias(b.address_line1)      as alias,
    'Address'::text                              as kind,
    b.name                                       as label,
    null::uuid                                   as account_id,
    b.id                                         as building_id,
    null::uuid                                   as opportunity_id
  from buildings b
  where b.deleted_at is null
    and coalesce(btrim(b.address_line1), '') not in ('', '-')

  union

  select distinct
    public.normalise_alias(b.name), 'Building', b.name, null::uuid, b.id, null::uuid
  from buildings b
  where b.deleted_at is null

  union

  select distinct
    public.normalise_alias(a.name), 'Account', a.name, a.id, null::uuid, null::uuid
  from accounts a
  where a.deleted_at is null

  union

  select distinct
    public.normalise_alias(o.name), 'Deal', o.name, null::uuid, null::uuid, o.id
  from opportunities o
  join pipeline_stages s on s.id = o.stage_id
  where o.deleted_at is null
    and not s.is_won
    and not s.is_lost
),
claimed as (
  select
    alias,
    count(distinct coalesce(account_id::text, building_id::text, opportunity_id::text)) as records
  from raw
  where alias is not null
  group by alias
),
offerable as (
  select r.alias, r.kind, r.label, r.account_id, r.building_id, r.opportunity_id
  from raw r
  join claimed c on c.alias = r.alias
  where r.alias is not null
    and c.records = 1
    and (array_length(string_to_array(r.alias, ' '), 1) >= 2 or length(r.alias) >= 4)
    and not exists (select 1 from match_aliases m where m.alias = r.alias)
)
select distinct on (alias, coalesce(account_id::text, building_id::text, opportunity_id::text))
  alias, kind, label, account_id, building_id, opportunity_id
from offerable
order by
  alias,
  coalesce(account_id::text, building_id::text, opportunity_id::text),
  case kind when 'Address' then 0 when 'Deal' then 1 when 'Building' then 2 else 3 end;

comment on view v_alias_candidates is
  'Phrases that could be mapped, derived from the records already held. A phrase '
  'two different records would both claim is excluded rather than offered, a '
  'single short word is never offered, and one record never offers the same '
  'phrase twice.';

grant select on v_alias_candidates to authenticated;
