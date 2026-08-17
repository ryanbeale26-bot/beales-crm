import type { Column } from '@/lib/csv'
import { accountGapColumns, fetchAccountGaps } from '@/lib/gaps/accounts'
import { buildingGapColumns, fetchBuildingGaps } from '@/lib/gaps/buildings'
import { contactGapColumns, fetchContactGaps } from '@/lib/gaps/contacts'
import { dealGapColumns, fetchDealGaps } from '@/lib/gaps/deals'
import { SCOPES, type GapScope, type Supabase } from '@/lib/gaps'

/**
 * One place that knows all four scopes, kept apart from src/lib/gaps/index.ts
 * so the scope files can import the shared helpers from there without a cycle.
 */
export function isGapScope(value: string): value is GapScope {
  return SCOPES.some((s) => s.slug === value)
}

/** The rows and the columns for a scope. The page and the CSV route share it. */
export async function fetchScope(supabase: Supabase, scope: GapScope) {
  switch (scope) {
    case 'buildings': {
      const { rows, error } = await fetchBuildingGaps(supabase)
      return { rows, columns: buildingGapColumns as Column<unknown>[], error }
    }
    case 'deals': {
      const { rows, error } = await fetchDealGaps(supabase)
      return { rows, columns: dealGapColumns as Column<unknown>[], error }
    }
    case 'contacts': {
      const { rows, error } = await fetchContactGaps(supabase)
      return { rows, columns: contactGapColumns as Column<unknown>[], error }
    }
    case 'accounts': {
      const { rows, error } = await fetchAccountGaps(supabase)
      return { rows, columns: accountGapColumns as Column<unknown>[], error }
    }
    default: {
      // ImporterKey-style exhaustiveness: adding a scope without handling it
      // here fails `npm run typecheck` rather than at runtime.
      const never: never = scope
      throw new Error(`Unknown gap scope: ${String(never)}`)
    }
  }
}
