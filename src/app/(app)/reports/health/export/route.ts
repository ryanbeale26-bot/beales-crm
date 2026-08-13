import { csvFilename, csvResponse, toCsv } from '@/lib/csv'
import { fetchHealth, healthColumns } from '@/lib/reports/health'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { buildings, error } = await fetchHealth(supabase)
  if (error) return new Response(`Could not build the export: ${error.message}`, { status: 500 })
  return csvResponse(csvFilename('client-health'), toCsv(buildings, healthColumns))
}
