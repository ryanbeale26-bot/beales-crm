import { csvFilename, csvResponse, toCsv } from '@/lib/csv'
import { fetchLosses, lossColumns } from '@/lib/reports/losses'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { rows, error } = await fetchLosses(supabase)
  if (error) return new Response(`Could not build the export: ${error.message}`, { status: 500 })
  return csvResponse(csvFilename('losses'), toCsv(rows, lossColumns))
}
