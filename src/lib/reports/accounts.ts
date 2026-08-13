import type { Column } from '@/lib/csv'
import type { Supabase } from '@/lib/reports'

export type AccountChange = {
  account_id: string
  account_name: string
  mrr_now: number
  mrr_3m: number
  mrr_6m: number
  mrr_12m: number
  change_3m: number
  change_6m: number
  change_12m: number
  building_count: number
}

export async function fetchAccountExpansion(supabase: Supabase) {
  const { data, error } = await supabase
    .from('v_account_mrr_change')
    .select('*')
    .order('mrr_now', { ascending: false })

  const rows: AccountChange[] = (data ?? []).map((r) => ({
    account_id: String(r.account_id),
    account_name: String(r.account_name),
    mrr_now: Number(r.mrr_now ?? 0),
    mrr_3m: Number(r.mrr_3m ?? 0),
    mrr_6m: Number(r.mrr_6m ?? 0),
    mrr_12m: Number(r.mrr_12m ?? 0),
    change_3m: Number(r.change_3m ?? 0),
    change_6m: Number(r.change_6m ?? 0),
    change_12m: Number(r.change_12m ?? 0),
    building_count: Number(r.building_count ?? 0),
  }))

  // An account with no revenue at either end has nothing to say about
  // expansion. It is still in the CSV — the export is the full list — but on
  // screen it would be 16 rows of zeros pushing the real movement off the page.
  const billing = rows.filter((r) => r.mrr_now > 0 || r.mrr_12m > 0)
  const grew = billing.filter((r) => r.change_12m > 0).sort((a, b) => b.change_12m - a.change_12m)
  const shrank = billing.filter((r) => r.change_12m < 0).sort((a, b) => a.change_12m - b.change_12m)
  const flat = billing.filter((r) => r.change_12m === 0)

  return {
    rows,
    billing,
    grew,
    shrank,
    flat,
    unbilled: rows.length - billing.length,
    error,
  }
}

export const accountColumns: Column<AccountChange>[] = [
  { header: 'Account', value: (r) => r.account_name },
  { header: 'Buildings billing', value: (r) => r.building_count },
  { header: 'MRR now', value: (r) => r.mrr_now },
  { header: 'MRR 3 months ago', value: (r) => r.mrr_3m },
  { header: 'MRR 6 months ago', value: (r) => r.mrr_6m },
  { header: 'MRR 12 months ago', value: (r) => r.mrr_12m },
  { header: 'Change 3 months', value: (r) => r.change_3m },
  { header: 'Change 6 months', value: (r) => r.change_6m },
  { header: 'Change 12 months', value: (r) => r.change_12m },
]
