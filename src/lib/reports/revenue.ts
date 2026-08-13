import type { Column } from '@/lib/csv'
import { monthLabel } from '@/lib/format'
import type { Supabase } from '@/lib/reports'

export type RevenueMonth = {
  month: string
  mrr: number
  buildings: number
  accounts: number
  newBusiness: number
  expansion: number
  contraction: number
  churn: number
}

export async function fetchRevenue(supabase: Supabase) {
  const [{ data: series, error: seriesError }, { data: movement, error: movementError }, { data: coverage, error: coverageError }] =
    await Promise.all([
      supabase.from('v_mrr_by_month').select('*').order('month'),
      supabase.from('v_mrr_waterfall').select('*').order('month'),
      supabase.from('v_mrr_coverage').select('*').single(),
    ])

  // The waterfall is split by entity — Beale's LLC and AFS bill separately.
  // Every building is currently 'beales', so this is one row per month today,
  // but summing rather than assuming is what stops the report silently showing
  // one entity's revenue as the company's the day AFS gets its first building.
  const byMonth = new Map<string, RevenueMonth>()
  for (const row of series ?? []) {
    byMonth.set(String(row.month), {
      month: String(row.month),
      mrr: Number(row.mrr ?? 0),
      buildings: Number(row.building_count ?? 0),
      accounts: Number(row.account_count ?? 0),
      newBusiness: 0,
      expansion: 0,
      contraction: 0,
      churn: 0,
    })
  }
  for (const row of movement ?? []) {
    const key = String(row.month)
    const m = byMonth.get(key)
    if (!m) continue
    m.newBusiness += Number(row.new_business ?? 0)
    m.expansion += Number(row.expansion ?? 0)
    m.contraction += Number(row.contraction ?? 0)
    m.churn += Number(row.churn ?? 0)
  }

  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))

  return {
    months,
    coverage,
    error: seriesError ?? movementError ?? coverageError,
    // Contract history only starts where the importer put it, and no contract
    // has ever been superseded or ended in the app. Three of the four movement
    // columns are therefore structurally zero, and the report has to say so
    // rather than print three columns of nothing and look broken.
    hasMovement: months.some((m) => m.expansion > 0 || m.contraction > 0 || m.churn > 0),
  }
}

export const revenueColumns: Column<RevenueMonth>[] = [
  { header: 'Month', value: (r) => monthLabel(r.month) },
  { header: 'MRR', value: (r) => r.mrr },
  { header: 'Buildings billing', value: (r) => r.buildings },
  { header: 'Accounts billing', value: (r) => r.accounts },
  { header: 'New business', value: (r) => r.newBusiness },
  { header: 'Expansion', value: (r) => r.expansion },
  { header: 'Contraction', value: (r) => r.contraction },
  { header: 'Churn', value: (r) => r.churn },
]
