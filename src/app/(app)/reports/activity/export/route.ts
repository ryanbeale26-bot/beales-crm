import { csvFilename, csvResponse, toCsv } from '@/lib/csv'
import { activityColumns, fetchActivityCoverage } from '@/lib/reports/activity'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { rows, error } = await fetchActivityCoverage(supabase)
  if (error) return new Response(`Could not build the export: ${error.message}`, { status: 500 })
  return csvResponse(csvFilename('activity-coverage'), toCsv(rows, activityColumns))
}
