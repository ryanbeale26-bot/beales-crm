import type { Column } from '@/lib/csv'
import { date } from '@/lib/format'
import type { Supabase } from '@/lib/reports'

export type LossRow = {
  kind: 'Deal' | 'Building'
  name: string
  account: string | null
  annual_value: number | null
  lost_on: string | null
  reason: string | null
  competitor: string | null
}

export async function fetchLosses(supabase: Supabase) {
  const [{ data: outcomes, error: outcomeError }, { data: buildings, error: buildingError }, { data: accounts }] =
    await Promise.all([
      supabase.from('v_opportunity_outcomes').select('*'),
      supabase
        .from('buildings')
        .select(
          'id, name, account_id, lost_date, loss_reason:loss_reasons(name), competitor:competitors(name)',
        )
        .eq('status', 'lost')
        .is('deleted_at', null),
      supabase.from('accounts').select('id, name').is('deleted_at', null),
    ])

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const closed = outcomes ?? []
  const lostDeals = closed.filter((o) => !o.won)

  const rows: LossRow[] = [
    ...lostDeals.map((o) => ({
      kind: 'Deal' as const,
      name: String(o.name),
      account: o.account_id ? (accountName.get(o.account_id) ?? null) : null,
      annual_value: o.annual_value === null ? null : Number(o.annual_value),
      lost_on: o.actual_close_date,
      reason: o.loss_reason,
      competitor: o.competitor,
    })),
    ...(buildings ?? []).map((b) => ({
      kind: 'Building' as const,
      name: String(b.name),
      account: b.account_id ? (accountName.get(b.account_id) ?? null) : null,
      annual_value: null,
      lost_on: b.lost_date,
      reason: b.loss_reason?.name ?? null,
      competitor: b.competitor?.name ?? null,
    })),
  ].sort((a, b) => (b.lost_on ?? '').localeCompare(a.lost_on ?? ''))

  // A competitor named on a win is one we beat; on a loss, one that beat us.
  const competitors = new Map<string, { beat: number; lostTo: number }>()
  for (const o of closed) {
    if (!o.competitor) continue
    const row = competitors.get(o.competitor) ?? { beat: 0, lostTo: 0 }
    if (o.won) row.beat += 1
    else row.lostTo += 1
    competitors.set(o.competitor, row)
  }

  return {
    rows,
    lostDeals,
    lostBuildings: buildings ?? [],
    lostAnnual: lostDeals.reduce((n, o) => n + Number(o.annual_value ?? 0), 0),
    competitors: [...competitors.entries()].sort(
      (a, b) => b[1].beat + b[1].lostTo - (a[1].beat + a[1].lostTo),
    ),
    error: outcomeError ?? buildingError,
  }
}

export const lossColumns: Column<LossRow>[] = [
  { header: 'What', value: (r) => r.kind },
  { header: 'Name', value: (r) => r.name },
  { header: 'Account', value: (r) => r.account },
  { header: 'Annual value', value: (r) => r.annual_value },
  { header: 'Lost on', value: (r) => (r.lost_on ? date(r.lost_on) : '') },
  { header: 'Reason', value: (r) => r.reason },
  { header: 'Competitor', value: (r) => r.competitor },
]
