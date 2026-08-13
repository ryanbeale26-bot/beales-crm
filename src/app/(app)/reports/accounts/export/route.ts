import { csvFilename, csvResponse, toCsv } from '@/lib/csv'
import { accountColumns, fetchAccountExpansion } from '@/lib/reports/accounts'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { rows, error } = await fetchAccountExpansion(supabase)
  if (error) return new Response(`Could not build the export: ${error.message}`, { status: 500 })
  return csvResponse(csvFilename('account-expansion'), toCsv(rows, accountColumns))
}
