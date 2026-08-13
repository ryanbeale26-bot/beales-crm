/** Shared display formatting. Keep every currency and date format in here. */

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** $12,000 — whole dollars, because cents are noise on a contract value. */
export function money(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '—'
  return currency.format(n)
}

/** 12 Aug 2026 */
export function date(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 345,774 SF */
export function squareFeet(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toLocaleString('en-US')} SF`
}

export function fullName(
  person: { first_name?: string | null; last_name?: string | null } | null | undefined,
): string {
  if (!person) return '—'
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim()
  return name || '—'
}

/** For an <input type="date">, which will not accept a timestamp. */
export function dateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ''
}

export const ENTITY_LABELS = {
  beales: "Beale's LLC",
  afs: 'Assurance Facility Services',
} as const

export const ACCOUNT_STATUS_LABELS = {
  prospect: 'Prospect',
  active: 'Active customer',
  former: 'Former customer',
} as const

export const BUILDING_STATUS_LABELS = {
  pending: 'Pending',
  active: 'Active',
  lost: 'Lost',
} as const

export const ASSIGNMENT_ROLE_LABELS = {
  day_porter: 'Day porter',
  night_cleaner: 'Night cleaner',
  lead_cleaner: 'Lead cleaner',
  supervisor: 'Supervisor',
  other: 'Other',
} as const

export const HEALTH_LABELS = {
  healthy: 'Healthy',
  needs_attention: 'Needs attention',
  at_risk: 'At risk',
} as const
