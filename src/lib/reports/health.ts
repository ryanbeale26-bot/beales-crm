import type { Column } from '@/lib/csv'
import { HEALTH_LABELS } from '@/lib/format'
import type { Supabase } from '@/lib/reports'

export type HealthBuilding = {
  building_id: string
  name: string
  account: string | null
  health_score: string | null
  monthly_value: number | null
  city: string | null
}

/** Healthy first, at risk last, unscored after that. */
const ORDER: Record<string, number> = { healthy: 0, needs_attention: 1, at_risk: 2 }

export function healthRank(score: string | null): number {
  return score === null ? 3 : (ORDER[score] ?? 3)
}

export function healthLabel(score: string | null): string {
  if (!score) return 'Not scored'
  return HEALTH_LABELS[score as keyof typeof HEALTH_LABELS] ?? score
}

export async function fetchHealth(supabase: Supabase) {
  const [{ data: summary, error: summaryError }, { data: current, error: currentError }, { data: accounts }, { data: cities }] =
    await Promise.all([
      supabase.from('v_building_health_mrr').select('*'),
      supabase.from('v_building_current_value').select('*').neq('status', 'lost'),
      supabase.from('accounts').select('id, name').is('deleted_at', null),
      supabase.from('buildings').select('id, city').is('deleted_at', null),
    ])

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const cityOf = new Map((cities ?? []).map((b) => [b.id, b.city]))

  const buildings: HealthBuilding[] = (current ?? [])
    .map((b) => ({
      building_id: String(b.building_id),
      name: String(b.name ?? ''),
      account: b.account_id ? (accountName.get(b.account_id) ?? null) : null,
      health_score: b.health_score,
      monthly_value: b.monthly_value === null ? null : Number(b.monthly_value),
      city: cityOf.get(String(b.building_id)) ?? null,
    }))
    // Worst health first, then biggest revenue — the at-risk site with the
    // largest contract is the row that should be read first on this page.
    .sort(
      (a, b) =>
        healthRank(b.health_score) - healthRank(a.health_score) ||
        (b.monthly_value ?? 0) - (a.monthly_value ?? 0),
    )

  const rows = [...(summary ?? [])].sort(
    (a, b) => healthRank(a.health_score) - healthRank(b.health_score),
  )

  return { rows, buildings, error: summaryError ?? currentError }
}

export const healthColumns: Column<HealthBuilding>[] = [
  { header: 'Building', value: (r) => r.name },
  { header: 'Account', value: (r) => r.account },
  { header: 'City', value: (r) => r.city },
  { header: 'Health', value: (r) => healthLabel(r.health_score) },
  { header: 'Monthly value', value: (r) => r.monthly_value },
]
