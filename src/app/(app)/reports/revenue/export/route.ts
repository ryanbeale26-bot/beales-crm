import { csvFilename, csvResponse, toCsv } from '@/lib/csv'
import { fetchRevenue, revenueColumns } from '@/lib/reports/revenue'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { months, error } = await fetchRevenue(supabase)
  if (error) return new Response(`Could not build the export: ${error.message}`, { status: 500 })
  return csvResponse(csvFilename('revenue'), toCsv(months, revenueColumns))
}
