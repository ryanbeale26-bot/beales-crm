-- -----------------------------------------------------------------------------
-- Global search
-- -----------------------------------------------------------------------------
-- One function, because there were already two implementations of "find a
-- record" and a Cmd-K palette would have made a third: searchRecords() in
-- src/app/(app)/activity/actions.ts fanned out three ilike queries for Quick
-- Add, and six list pages each carry their own q filter. Two counts of one
-- number eventually disagree, and so do two searches.
--
-- The other reason is ranking. Four separate queries can only interleave their
-- results by a fixed type order -- which is why the old fan-out always put
-- buildings first, however badly they matched. In one query an exact hit on an
-- account name can outrank a partial hit on a building, which is what a person
-- typing a name actually expects.
--
-- No pg_trgm and no tsvector. Nothing in this schema installs an extension, and
-- `npm run db:verify` runs a bare PGlite with none available, so reaching for
-- one would take the whole schema out of test on the day it was added. Plain
-- ilike over a book of 21 accounts and 46 buildings is instant.

create function public.search_records(
  term     text,
  kinds    text[] default null,
  max_rows int    default 20
)
returns table (
  kind     text,
  id       uuid,
  label    text,
  sublabel text,
  score    int
)
language sql
stable
-- SECURITY INVOKER on purpose. It is the default, and it is written down here
-- so nobody "tidies" it to definer later: the caller's own RLS policies decide
-- what comes back, exactly as they do on the list pages. A definer function
-- would hand every row to anyone holding the public key.
set search_path = public
as $$
  with pat as (
    select
      btrim(term) as t,
      -- Escape the LIKE metacharacters, so somebody typing "90_Libbey" is
      -- searching for an underscore rather than for any character at all.
      replace(replace(replace(btrim(term), '\', '\\'), '%', '\%'), '_', '\_')
        as esc
  ),
  p as (
    select t, esc || '%' as starts, '%' || esc || '%' as contains
    from pat
    -- One letter matches most of the book, so it is not a search.
    where length(t) >= 2
  ),
  hits as (
    -- Buildings first among equals: it is the record somebody standing in a
    -- car park is looking for.
    select
      'building'::text as kind,
      b.id,
      b.name as label,
      nullif(concat_ws(' · ', acc.name, b.city), '') as sublabel,
      case
        when lower(b.name) = lower(p.t) then 3
        when b.name ilike p.starts or b.address_line1 ilike p.starts then 2
        else 1
      end as score,
      0 as kind_order
    from buildings b
    join accounts acc on acc.id = b.account_id
    cross join p
    where b.deleted_at is null
      and (
        b.name ilike p.contains
        or b.address_line1 ilike p.contains
        or b.city ilike p.contains
      )

    union all

    select
      'account', a.id, a.name,
      initcap(replace(a.status::text, '_', ' ')),
      case
        when lower(a.name) = lower(p.t) then 3
        when a.name ilike p.starts then 2
        else 1
      end,
      1
    from accounts a
    cross join p
    where a.deleted_at is null
      and a.name ilike p.contains

    union all

    select
      'contact', c.id,
      btrim(concat_ws(' ', nullif(c.first_name, ''), nullif(c.last_name, ''))),
      nullif(concat_ws(' · ', acc.name, c.title), ''),
      case
        when lower(btrim(concat_ws(' ', c.first_name, c.last_name))) = lower(p.t)
          then 3
        when c.first_name ilike p.starts
          or c.last_name ilike p.starts
          or c.email ilike p.starts then 2
        else 1
      end,
      2
    from contacts c
    left join accounts acc on acc.id = c.account_id and acc.deleted_at is null
    cross join p
    where c.deleted_at is null
      and (
        c.first_name ilike p.contains
        or c.last_name ilike p.contains
        or btrim(concat_ws(' ', c.first_name, c.last_name)) ilike p.contains
        or c.email ilike p.contains
      )

    union all

    select
      'opportunity', o.id, o.name,
      nullif(concat_ws(' · ', s.name, acc.name), ''),
      case
        when lower(o.name) = lower(p.t) then 3
        when o.name ilike p.starts or o.address_line1 ilike p.starts then 2
        else 1
      end,
      3
    from opportunities o
    join pipeline_stages s on s.id = o.stage_id
    left join accounts acc on acc.id = o.account_id and acc.deleted_at is null
    cross join p
    where o.deleted_at is null
      and (
        o.name ilike p.contains
        or o.address_line1 ilike p.contains
        or o.city ilike p.contains
      )
  ),
  ranked as (
    select
      h.*,
      -- Cap each kind, so typing "st" cannot fill the list with 40 buildings
      -- and hide the account somebody was actually after.
      row_number() over (
        partition by h.kind order by h.score desc, h.label
      ) as within_kind
    from hits h
    where kinds is null or h.kind = any (kinds)
  )
  select kind, id, label, sublabel, score
  from ranked
  where within_kind <= 8
  order by score desc, kind_order, label
  limit greatest(coalesce(max_rows, 20), 1);
$$;

comment on function public.search_records(text, text[], int) is
  'Global search across buildings, accounts, contacts and open records. SECURITY INVOKER: RLS decides what the caller sees. Callers: src/lib/search.ts, which is the only place the app queries it from.';

-- Section 21 of the initial schema learned this the hard way: `grant ... on all
-- tables` is a snapshot, not a rule, so anything created later has to say so.
grant execute on function public.search_records(text, text[], int) to authenticated;
