import type { Column } from '@/lib/csv'
import { HEALTH_LABELS } from '@/lib/format'
import { isoDate, num, yesNo, type Supabase } from '@/lib/gaps'

export type BuildingGapRow = {
  id: string
  name: string
  account: string
  monthly_value: number | null
  segment: string
  square_footage: number | null
  contract_start_date: string | null
  contract_end_date: string | null
  health: string
  owner: string
  day_porter: boolean
  day_porter_hours_per_day: number | null
  day_porter_days_per_week: number | null
  night_hours_per_night: number | null
  night_days_per_week: number | null
  weekend_service: boolean
  weekend_hours_per_week: number | null
  /** True when this building has no contract period at all, so a value can be filled in. */
  can_fill_value: boolean
}

/**
 * Every live building, with the current value of everything the gap-filler can
 * write. Sorted so the emptiest rows come first — that is where the work is.
 *
 * Lookups are joined in JavaScript rather than embedded, following the reports:
 * buildings reaches profiles twice (owner_id and secondary_owner_id), so a bare
 * embed is ambiguous and fails with "more than one relationship was found".
 */
export async function fetchBuildingGaps(supabase: Supabase) {
  const [
    { data: buildings, error },
    { data: accounts },
    { data: segments },
    { data: profiles },
    { data: periods },
  ] = await Promise.all([
    supabase
      .from('buildings')
      .select(
        `id, name, account_id, property_type_id, square_footage, contract_start_date,
         contract_end_date, health_score, owner_id, day_porter, day_porter_hours_per_day,
         day_porter_days_per_week, night_hours_per_night, night_days_per_week,
         weekend_service, weekend_hours_per_week`,
      )
      .is('deleted_at', null)
      .neq('status', 'lost'),
    supabase.from('accounts').select('id, name').is('deleted_at', null),
    supabase.from('property_types').select('id, name'),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('building_contract_periods').select('building_id, monthly_value, end_date'),
  ])

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const segmentName = new Map((segments ?? []).map((s) => [s.id, s.name]))
  const ownerName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  // Two different questions: what is it billing now, and may a value be filled
  // in at all. A building with a *closed* period had a contract that ended —
  // starting a new one is churn followed by new business, which is a real
  // business event for the building page, not a blank to fill from a file.
  const openValue = new Map<string, number>()
  const hasAnyPeriod = new Set<string>()
  for (const p of periods ?? []) {
    hasAnyPeriod.add(p.building_id)
    if (p.end_date === null) openValue.set(p.building_id, Number(p.monthly_value))
  }

  const rows: BuildingGapRow[] = (buildings ?? [])
    .map((b) => ({
      id: b.id,
      name: b.name,
      account: b.account_id ? (accountName.get(b.account_id) ?? '') : '',
      monthly_value: openValue.get(b.id) ?? null,
      segment: b.property_type_id ? (segmentName.get(b.property_type_id) ?? '') : '',
      square_footage: b.square_footage,
      contract_start_date: b.contract_start_date,
      contract_end_date: b.contract_end_date,
      health: b.health_score
        ? (HEALTH_LABELS[b.health_score as keyof typeof HEALTH_LABELS] ?? '')
        : '',
      owner: b.owner_id ? (ownerName.get(b.owner_id) ?? '') : '',
      day_porter: b.day_porter ?? false,
      day_porter_hours_per_day: b.day_porter_hours_per_day,
      day_porter_days_per_week: b.day_porter_days_per_week,
      night_hours_per_night: b.night_hours_per_night,
      night_days_per_week: b.night_days_per_week,
      weekend_service: b.weekend_service ?? false,
      weekend_hours_per_week: b.weekend_hours_per_week,
      can_fill_value: !hasAnyPeriod.has(b.id),
    }))
    .sort((a, b) => emptiness(b) - emptiness(a) || a.name.localeCompare(b.name))

  return { rows, error }
}

/** How many fillable fields are blank. Ranks the file so the work is at the top. */
function emptiness(r: BuildingGapRow): number {
  return [
    r.monthly_value === null,
    r.segment === '',
    r.square_footage === null,
    r.contract_start_date === null,
    r.contract_end_date === null,
    r.health === '',
    r.owner === '',
    !r.day_porter && !r.night_hours_per_night && !r.weekend_service,
  ].filter(Boolean).length
}

/**
 * The round-trip columns.
 *
 * Building and Account are context — they are here so the file reads like a
 * spreadsheet rather than a list of uuids, and edits to them are ignored.
 * Everything else is writable.
 */
export const buildingGapColumns: Column<BuildingGapRow>[] = [
  { header: 'Building ID', value: (r) => r.id },
  { header: 'Building', value: (r) => r.name },
  { header: 'Account', value: (r) => r.account },
  { header: 'Monthly value', value: (r) => num(r.monthly_value) },
  { header: 'Segment', value: (r) => r.segment },
  { header: 'Square footage', value: (r) => num(r.square_footage) },
  { header: 'Contract start', value: (r) => isoDate(r.contract_start_date) },
  { header: 'Contract end', value: (r) => isoDate(r.contract_end_date) },
  { header: 'Health', value: (r) => r.health },
  { header: 'Owner', value: (r) => r.owner },
  { header: 'Day porter', value: (r) => yesNo(r.day_porter) },
  { header: 'Day porter hours per day', value: (r) => num(r.day_porter_hours_per_day) },
  { header: 'Day porter days per week', value: (r) => num(r.day_porter_days_per_week) },
  { header: 'Night hours per night', value: (r) => num(r.night_hours_per_night) },
  { header: 'Night days per week', value: (r) => num(r.night_days_per_week) },
  { header: 'Weekend service', value: (r) => yesNo(r.weekend_service) },
  { header: 'Weekend hours per week', value: (r) => num(r.weekend_hours_per_week) },
]
