import { csvFilename, csvResponse, toCsv } from '@/lib/csv'
import { fetchScope, isGapScope } from '@/lib/gaps/scope'
import { getCurrentProfile } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

/**
 * The download half of the round trip: /admin/import/blanks/buildings.
 *
 * One route for all four scopes rather than four nine-line files like the
 * reports, because unlike the reports these are genuinely uniform — and the
 * scope has to be validated either way.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const profile = await getCurrentProfile()
  if (profile?.role !== 'admin') {
    return new Response('Only an admin can download the gap sheets.', { status: 403 })
  }

  const { scope } = await params
  if (!isGapScope(scope)) return new Response(`No such gap sheet: ${scope}`, { status: 404 })

  const supabase = await createClient()
  const { rows, columns, error } = await fetchScope(supabase, scope)
  if (error) return new Response(`Could not build the sheet: ${error.message}`, { status: 500 })

  return csvResponse(csvFilename(`gaps-${scope}`), toCsv(rows, columns))
}
