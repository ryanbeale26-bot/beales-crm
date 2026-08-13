import type { Column } from '@/lib/csv'
import { date } from '@/lib/format'
import type { Supabase } from '@/lib/reports'

/**
 * The pipeline export is one row per deal, open and closed together — that is
 * what someone actually wants in Excel, rather than the funnel summary the
 * screen leads with, which is five rows they can read at a glance anyway.
 */
export type PipelineDeal = {
  name: string
  account: string | null
  stage: string
  probability: number
  monthly_value: number | null
  annual_value: number | null
  weighted_annual: number | null
  opened_on: string | null
  expected_close_date: string | null
  actual_close_date: string | null
  outcome: string
  reason: string | null
  competitor: string | null
}

export async function fetchPipelineDeals(supabase: Supabase) {
  const [{ data: deals, error }, { data: stages }, { data: accounts }, { data: outcomes }] =
    await Promise.all([
      supabase
        .from('opportunities')
        .select(
          'id, name, account_id, stage_id, monthly_value, annual_value, opened_on, expected_close_date, actual_close_date',
        )
        .is('deleted_at', null)
        .order('name'),
      supabase.from('pipeline_stages').select('id, name, probability, is_won, is_lost'),
      supabase.from('accounts').select('id, name').is('deleted_at', null),
      supabase
        .from('v_opportunity_outcomes')
        .select('opportunity_id, loss_reason, win_reason, competitor'),
    ])

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]))
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const outcomeById = new Map((outcomes ?? []).map((o) => [o.opportunity_id, o]))

  const rows: PipelineDeal[] = (deals ?? []).map((d) => {
    const stage = stageById.get(d.stage_id)
    const outcome = outcomeById.get(d.id)
    const annual = d.annual_value === null ? null : Number(d.annual_value)
    const probability = Number(stage?.probability ?? 0)
    return {
      name: String(d.name),
      account: d.account_id ? (accountName.get(d.account_id) ?? null) : null,
      stage: stage?.name ?? '',
      probability,
      monthly_value: d.monthly_value === null ? null : Number(d.monthly_value),
      annual_value: annual,
      weighted_annual: annual === null ? null : Math.round(annual * probability) / 100,
      opened_on: d.opened_on,
      expected_close_date: d.expected_close_date,
      actual_close_date: d.actual_close_date,
      outcome: stage?.is_won ? 'Won' : stage?.is_lost ? 'Lost' : 'Open',
      reason: outcome?.loss_reason ?? outcome?.win_reason ?? null,
      competitor: outcome?.competitor ?? null,
    }
  })

  return { rows, error }
}

export const pipelineColumns: Column<PipelineDeal>[] = [
  { header: 'Deal', value: (r) => r.name },
  { header: 'Account', value: (r) => r.account },
  { header: 'Stage', value: (r) => r.stage },
  { header: 'Outcome', value: (r) => r.outcome },
  { header: 'Win probability %', value: (r) => r.probability },
  { header: 'Monthly value', value: (r) => r.monthly_value },
  { header: 'Annual value', value: (r) => r.annual_value },
  { header: 'Weighted annual', value: (r) => r.weighted_annual },
  { header: 'Opened', value: (r) => (r.opened_on ? date(r.opened_on) : '') },
  {
    header: 'Expected close',
    value: (r) => (r.expected_close_date ? date(r.expected_close_date) : ''),
  },
  { header: 'Actual close', value: (r) => (r.actual_close_date ? date(r.actual_close_date) : '') },
  { header: 'Reason', value: (r) => r.reason },
  { header: 'Competitor', value: (r) => r.competitor },
]
