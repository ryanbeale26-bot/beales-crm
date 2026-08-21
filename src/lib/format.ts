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

/** 80% — no decimal unless the number needs one to be honest. */
export function percent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '—'
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`
}

/** Aug 2026 — for a month column that has to fit 27 of them across. */
export function monthLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** 1,247 — a plain count, grouped. */
export function count(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US')
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

/**
 * `scope_add` → "Scope add". The fallback for an enum nobody has written a
 * label map for — honest for values that read fine with the underscores gone,
 * and the reason there is no map for every enum in the schema.
 */
export function humanise(value: string): string {
  const words = value.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value
}

/** "3 days ago" reads faster than a date when you are scanning a timeline.
 *  Shared by the activity timeline and the record history so the two phrase
 *  time the same way. */
export function ago(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * How much of a long note a timeline row shows before the rest goes behind a
 * disclosure. Roughly three lines on a laptop, six on a phone.
 *
 * Deliberately NOT `SNIPPET_LENGTH`. That number is about what gets stored and
 * why; this one is about how much vertical space one row of a two-hundred-row
 * feed may take. Two unrelated reasons, so two unrelated numbers — tying them
 * would let a storage decision silently relay out every screen.
 */
const EXCERPT_LENGTH = 240

/** Never hide a tail this short: a "Show all" that reveals one more line is
 *  more annoying than the line. */
const WORTH_HIDING = 80

/**
 * The opening of a long note, cut at a word.
 *
 * Returns null when the note is short enough to print whole — so the threshold
 * lives here and nowhere else, and a caller cannot accidentally apply a second
 * one. Only the excerpt is derived; the note itself is always rendered intact
 * beside it.
 */
export function excerpt(text: string): string | null {
  if (text.length <= EXCERPT_LENGTH + WORTH_HIDING) return null
  const cut = text.slice(0, EXCERPT_LENGTH)
  // Back up to a word boundary, but only a short way: a 240-character stretch
  // with no space in it is not prose, and chopping 200 characters off it to
  // find one would be worse than cutting mid-word.
  const space = cut.lastIndexOf(' ')
  return `${(space > EXCERPT_LENGTH - 40 ? cut.slice(0, space) : cut).trimEnd()}…`
}
