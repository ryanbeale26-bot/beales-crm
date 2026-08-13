import { csvFilename, csvResponse, toCsv } from '@/lib/csv'
import { fetchPipelineDeals, pipelineColumns } from '@/lib/reports/pipeline'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { rows, error } = await fetchPipelineDeals(supabase)
  if (error) return new Response(`Could not build the export: ${error.message}`, { status: 500 })
  return csvResponse(csvFilename('pipeline'), toCsv(rows, pipelineColumns))
}
