import type { createClient } from '@/lib/supabase/server'

/**
 * The gap-filler.
 *
 * Same rule as src/lib/reports: one fetcher per scope, called by both the
 * screen and the CSV route, so a download can never disagree with the count
 * that sent you to it.
 *
 * The CSV exports the *current* value of every fillable field rather than an
 * empty column. That is what makes "a blank cell leaves the field alone" safe:
 * leaving a cell as you found it is a no-op, so a half-filled re-upload cannot
 * wipe anything, and you can still correct a value you can see is wrong.
 */
export type Supabase = Awaited<ReturnType<typeof createClient>>

export type GapScope = 'buildings' | 'deals' | 'contacts' | 'accounts'

/**
 * The header of the first column. The uploaded file is matched to a scope by
 * this rather than by a dropdown — the file was written by this app, so it can
 * say what it is, and a buildings file uploaded as contacts should be an error
 * rather than a zero-row success.
 */
export const ID_HEADERS: Record<GapScope, string> = {
  buildings: 'Building ID',
  deals: 'Deal ID',
  contacts: 'Contact ID',
  accounts: 'Account ID',
}

/**
 * There is deliberately no "downloaded at" or "last changed" column.
 *
 * The obvious way to catch a stale file — stamp the export and compare — dies
 * on contact with Excel, which reformats 2026-08-17 to 8/17/2026 on save and
 * would then report every row as changed. The check that actually works is in
 * the preview: a change that fills a blank is always safe, and a change that
 * overwrites an existing value is the one to read. Those are separated and the
 * overwrites are listed first.
 */
export const SCOPES: { slug: GapScope; title: string; blurb: string }[] = [
  {
    slug: 'buildings',
    title: 'Buildings',
    blurb: 'Contract value, segment, contracted hours, square footage, dates, health and owner.',
  },
  {
    slug: 'deals',
    title: 'Open deals',
    blurb: 'Price, expected close date, the account it belongs to, when it opened, segment and owner.',
  },
  {
    slug: 'contacts',
    title: 'Contacts',
    blurb: 'Which account each person belongs to, plus job title and email address.',
  },
  {
    slug: 'accounts',
    title: 'Accounts',
    blurb: 'Primary contact and who owns the relationship.',
  },
]

export type CensusRow = {
  scope: GapScope
  field: string
  label: string
  missing: number
  total: number
  sort_order: number
}

/**
 * What is still missing, counted in Postgres.
 *
 * v_gap_census reads v_mrr_coverage and v_pipeline_coverage for the two numbers
 * those views already own, so the census cannot drift away from the revenue and
 * pipeline reports.
 */
export async function fetchCensus(supabase: Supabase) {
  const { data, error } = await supabase
    .from('v_gap_census')
    .select('*')
    .order('scope')
    .order('sort_order')

  const rows: CensusRow[] = (data ?? []).map((r) => ({
    scope: r.scope as GapScope,
    field: String(r.field),
    label: String(r.label),
    missing: Number(r.missing ?? 0),
    total: Number(r.total ?? 0),
    sort_order: Number(r.sort_order ?? 0),
  }))

  return { rows, error }
}

// ---------------------------------------------------------------------------
// Shared cell formatting
// ---------------------------------------------------------------------------
// These are for a spreadsheet, not for a screen: an ISO date rather than
// "12 Aug 2026", a raw number rather than "$12,000". Anything the export writes
// has to be something the import can read straight back, or a cell nobody
// touched would come back looking like a change.

/** YYYY-MM-DD, which Excel understands and the importer can read back. */
export function isoDate(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : ''
}

/** Yes / No, because TRUE and FALSE look like formulas in a spreadsheet. */
export function yesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value ? 'Yes' : 'No'
}

export function num(value: number | string | null | undefined): number | '' {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  return Number.isNaN(n) ? '' : n
}
