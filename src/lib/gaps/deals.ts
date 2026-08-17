import type { Column } from '@/lib/csv'
import { isoDate, num, type Supabase } from '@/lib/gaps'

export type DealGapRow = {
  id: string
  name: string
  stage: string
  monthly_value: number | null
  expected_close_date: string | null
  account: string
  owner: string
  segment: string
  opened_on: string | null
}

/**
 * Open deals only. A closed deal's price and close date are history, and the
 * board is where a deal closes — see the stage note in the migration.
 */
export async function fetchDealGaps(supabase: Supabase) {
  const [
    { data: stages },
    { data: accounts },
    { data: segments },
    { data: profiles },
  ] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name, is_won, is_lost'),
    supabase.from('accounts').select('id, name').is('deleted_at', null),
    supabase.from('property_types').select('id, name'),
    supabase.from('profiles').select('id, full_name'),
  ])

  const openStages = (stages ?? []).filter((s) => !s.is_won && !s.is_lost)
  const stageName = new Map((stages ?? []).map((s) => [s.id, s.name]))
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const segmentName = new Map((segments ?? []).map((s) => [s.id, s.name]))
  const ownerName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  const { data: deals, error } = await supabase
    .from('opportunities')
    .select(
      'id, name, stage_id, monthly_value, expected_close_date, account_id, owner_id, property_type_id, opened_on',
    )
    .is('deleted_at', null)
    .in(
      'stage_id',
      openStages.map((s) => s.id),
    )

  const rows: DealGapRow[] = (deals ?? [])
    .map((d) => ({
      id: d.id,
      name: d.name,
      stage: stageName.get(d.stage_id) ?? '',
      monthly_value: d.monthly_value === null ? null : Number(d.monthly_value),
      expected_close_date: d.expected_close_date,
      account: d.account_id ? (accountName.get(d.account_id) ?? '') : '',
      owner: d.owner_id ? (ownerName.get(d.owner_id) ?? '') : '',
      segment: d.property_type_id ? (segmentName.get(d.property_type_id) ?? '') : '',
      opened_on: d.opened_on,
    }))
    .sort((a, b) => emptiness(b) - emptiness(a) || a.name.localeCompare(b.name))

  return { rows, error }
}

function emptiness(r: DealGapRow): number {
  return [
    r.monthly_value === null,
    r.expected_close_date === null,
    r.account === '',
    r.opened_on === null,
    r.segment === '',
    r.owner === '',
  ].filter(Boolean).length
}

export const dealGapColumns: Column<DealGapRow>[] = [
  { header: 'Deal ID', value: (r) => r.id },
  { header: 'Deal', value: (r) => r.name },
  { header: 'Stage', value: (r) => r.stage },
  { header: 'Monthly value', value: (r) => num(r.monthly_value) },
  { header: 'Expected close', value: (r) => isoDate(r.expected_close_date) },
  { header: 'Account', value: (r) => r.account },
  { header: 'Owner', value: (r) => r.owner },
  { header: 'Segment', value: (r) => r.segment },
  { header: 'Opened on', value: (r) => isoDate(r.opened_on) },
]
