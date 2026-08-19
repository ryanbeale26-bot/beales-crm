import type { SupabaseClient } from '@supabase/supabase-js'

import type { RefTable } from '@/lib/audit/fields'
import type { Database } from '@/lib/database.types'

type Supabase = SupabaseClient<Database>

/**
 * Turning the uuids in a diff into names.
 *
 * `src/lib/reference.ts` looks like the obvious thing to reuse and is the
 * wrong tool for this, twice over. `getOwners()` excludes service accounts —
 * which is precisely the profile that wrote every row the nightly job touched.
 * And most of the others filter `is_active = true`, so a diff naming a stage
 * or a competitor somebody has since retired would resolve to nothing and the
 * history would read "changed the stage to —".
 *
 * History has to name what was true at the time, so these lookups filter
 * nothing. They are batched once per table per page, so 50 entries cost a
 * handful of small queries rather than a join per row.
 */

/** Tables whose display name is a plain `name` column. */
const NAMED = [
  'accounts',
  'buildings',
  'sites',
  'pipeline_stages',
  'property_types',
  'loss_reasons',
  'competitors',
  'lead_sources',
  'win_reasons',
  'activity_types',
] as const
type NamedTable = (typeof NAMED)[number]

/** Tables whose display name is first_name + last_name. */
const PEOPLE = ['contacts', 'employees'] as const
type PeopleTable = (typeof PEOPLE)[number]

function isNamed(t: RefTable): t is NamedTable {
  return (NAMED as readonly string[]).includes(t)
}
function isPeople(t: RefTable): t is PeopleTable {
  return (PEOPLE as readonly string[]).includes(t)
}

/**
 * One flat map across every table, keyed by uuid. Ids are unique across the
 * schema, so nothing collides and the caller does not have to remember which
 * table a given field pointed at.
 */
export type NameMap = Map<string, string>

export async function resolveNames(
  supabase: Supabase,
  wanted: Map<RefTable, Set<string>>,
): Promise<NameMap> {
  const names: NameMap = new Map()

  await Promise.all(
    [...wanted].map(async ([table, idSet]) => {
      const ids = [...idSet]
      if (ids.length === 0) return

      if (isPeople(table)) {
        const { data } = await supabase
          .from(table)
          .select('id, first_name, last_name')
          .in('id', ids)
        for (const row of data ?? []) {
          const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
          if (name) names.set(row.id, name)
        }
        return
      }

      if (isNamed(table)) {
        const { data } = await supabase.from(table).select('id, name').in('id', ids)
        for (const row of data ?? []) names.set(row.id, row.name)
        return
      }

      // profiles — the one table whose name column is called something else,
      // falling back to the address so a profile with no name still reads.
      const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
      for (const row of data ?? []) names.set(row.id, row.full_name || row.email)
    }),
  )

  return names
}
