import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  AUDIT_TABLES,
  type AuditTable,
  type RefTable,
  TABLE_META,
  fieldSpec,
  isAuditTable,
  subjectName,
} from '@/lib/audit/fields'
import { type NameMap, resolveNames } from '@/lib/audit/names'
import type { Database } from '@/lib/database.types'
import { date, humanise, money, squareFeet } from '@/lib/format'

type Supabase = SupabaseClient<Database>
type Json = Record<string, unknown>

export type AuditAction = 'insert' | 'update' | 'delete'

/** One field that moved, already in English. */
export type Change = { label: string; from: string; to: string }

export type Entry = {
  id: number
  table: AuditTable
  recordId: string | null
  action: AuditAction
  who: string
  at: string
  /** The record's own name, from its snapshot — so a deleted one still reads. */
  subject: string | null
  href: string | null
  /** Empty on an insert: "created" is the whole story, not thirty blank-to-value lines. */
  changes: Change[]
  /** True when the row came from a spreadsheet import rather than a person. */
  fromImport: boolean
}

const SELECT =
  'id, table_name, record_id, action, changed_at, old_values, new_values, changed_by'

function asJson(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One side of one field, formatted. */
function show(value: unknown, spec: ReturnType<typeof fieldSpec>, names: NameMap): string {
  if (value === null || value === undefined || value === '') return '—'
  if (!spec) return String(value)

  if (spec.ref && typeof value === 'string') return names.get(value) ?? 'a record since removed'
  if (spec.labels && typeof value === 'string' && spec.labels[value]) return spec.labels[value]

  switch (spec.format) {
    case 'money':
      return money(value as number)
    case 'date':
      return date(String(value))
    case 'datetime':
      return new Date(String(value)).toLocaleString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    case 'sqft':
      return squareFeet(Number(value))
    case 'bool':
      return value ? 'Yes' : 'No'
    case 'hours':
      return `${Number(value)} ${Number(value) === 1 ? 'hour' : 'hours'}`
    case 'days':
      return `${Number(value)} ${Number(value) === 1 ? 'day' : 'days'}`
    default:
      return typeof value === 'string' ? humanise(value) : String(value)
  }
}

/**
 * `set_building_monthly_value()` writes TWO audit rows for one price change:
 * an insert of the new period, and an update that closes the old one. The
 * second is the same call tidying up after itself, not a second thing anybody
 * did, so it is dropped.
 *
 * Written as a named rule rather than folded into a filter, so nobody removes
 * it later thinking it is dead code.
 */
function isPeriodBeingClosed(table: AuditTable, action: AuditAction, changed: string[]): boolean {
  return (
    table === 'building_contract_periods' && action === 'update' && changed.every((c) => c === 'end_date')
  )
}

type Row = {
  id: number
  table_name: string
  record_id: string | null
  action: AuditAction
  changed_at: string
  old_values: unknown
  new_values: unknown
  changed_by: string | null
}

/** Which uuids the whole page needs looked up, gathered in one pass. */
function collectRefs(rows: Row[]): Map<RefTable, Set<string>> {
  const wanted = new Map<RefTable, Set<string>>()
  const want = (table: RefTable, id: string) => {
    if (!UUID.test(id)) return
    const set = wanted.get(table) ?? new Set<string>()
    set.add(id)
    wanted.set(table, set)
  }

  for (const row of rows) {
    if (row.changed_by) want('profiles', row.changed_by)
    if (!isAuditTable(row.table_name)) continue
    const table = row.table_name

    for (const values of [asJson(row.old_values), asJson(row.new_values)]) {
      if (!values) continue
      for (const [column, value] of Object.entries(values)) {
        const spec = fieldSpec(table, column)
        if (spec?.ref && typeof value === 'string') want(spec.ref, value)
      }
    }
  }

  return wanted
}

function toEntry(row: Row, names: NameMap): Entry | null {
  if (!isAuditTable(row.table_name)) return null
  const table = row.table_name
  const before = asJson(row.old_values)
  const after = asJson(row.new_values)

  // Every column either side, so a field that only exists on one is still seen.
  const columns = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  const changed: string[] = []
  const changes: Change[] = []

  for (const column of columns) {
    const spec = fieldSpec(table, column)
    if (!spec) continue
    const from = before?.[column] ?? null
    const to = after?.[column] ?? null
    if (row.action === 'update' && JSON.stringify(from) === JSON.stringify(to)) continue
    changed.push(column)
    // An insert or delete is "created" / "removed" — the record's whole
    // contents as thirty lines of "— → something" is noise, not history.
    if (row.action === 'update') {
      changes.push({ label: spec.label, from: show(from, spec, names), to: show(to, spec, names) })
    }
  }

  if (row.action === 'update' && changes.length === 0) return null
  if (isPeriodBeingClosed(table, row.action, changed)) return null

  const snapshot = after ?? before
  const meta = TABLE_META[table]

  return {
    id: row.id,
    table,
    recordId: row.record_id,
    action: row.action,
    who: row.changed_by ? (names.get(row.changed_by) ?? 'Somebody since removed') : 'Set up outside the app',
    at: row.changed_at,
    subject: subjectName(table, snapshot),
    href: meta.href && row.record_id ? meta.href(row.record_id) : null,
    changes,
    fromImport: typeof snapshot?.import_batch_id === 'string',
  }
}

async function build(supabase: Supabase, rows: Row[]): Promise<Entry[]> {
  if (rows.length === 0) return []
  const names = await resolveNames(supabase, collectRefs(rows))
  return rows.map((row) => toEntry(row, names)).filter((e): e is Entry => e !== null)
}

/**
 * One record's history.
 *
 * A building also gets its contract values, because the money is the thing
 * anybody opening a history is looking for — and it does NOT live on
 * `buildings`, it lives in `building_contract_periods`, whose rows carry
 * `building_id` in their own snapshot so no join is needed.
 */
export async function fetchRecordHistory(
  supabase: Supabase,
  table: AuditTable,
  recordId: string,
  limit = 25,
): Promise<{ entries: Entry[]; error: string | null }> {
  const own = supabase
    .from('audit_log')
    .select(SELECT)
    .eq('table_name', table)
    .eq('record_id', recordId)
    .order('changed_at', { ascending: false })
    .limit(limit)

  const periods =
    table === 'buildings'
      ? supabase
          .from('audit_log')
          .select(SELECT)
          .eq('table_name', 'building_contract_periods')
          .eq('new_values->>building_id', recordId)
          .order('changed_at', { ascending: false })
          .limit(limit)
      : null

  const [ownResult, periodResult] = await Promise.all([own, periods ?? Promise.resolve(null)])

  if (ownResult.error) return { entries: [], error: ownResult.error.message }
  if (periodResult?.error) return { entries: [], error: periodResult.error.message }

  const rows = [...(ownResult.data ?? []), ...(periodResult?.data ?? [])] as Row[]
  rows.sort((a, b) => b.changed_at.localeCompare(a.changed_at))

  const entries = await build(supabase, rows.slice(0, limit))
  return { entries, error: null }
}

export type FeedFilters = {
  who?: string
  table?: AuditTable
  /** How far back, in days. Turned into a timestamp here rather than by the
   *  page, so nothing reads the clock during a render. */
  sinceDays?: number
  /** Imports are hidden unless this is on. */
  includeImports?: boolean
  page?: number
}

export const FEED_PAGE = 50

/**
 * The admin feed.
 *
 * `total` is counted without the page window so the screen can always say what
 * it is not showing — the same rule the review queue follows. `importCount` is
 * counted separately so the toggle can name a number rather than promise one.
 */
export async function fetchAuditFeed(
  supabase: Supabase,
  filters: FeedFilters = {},
): Promise<{ entries: Entry[]; total: number; importCount: number; error: string | null }> {
  const page = Math.max(filters.page ?? 1, 1)
  const from = (page - 1) * FEED_PAGE

  // The allowlist decides what the feed may contain, not the database. A table
  // audited later does not appear here until somebody has added it to
  // fields.ts and decided how to word it.
  const tables = filters.table ? [filters.table] : [...AUDIT_TABLES]

  const since =
    filters.sinceDays && filters.sinceDays > 0
      ? new Date(Date.now() - filters.sinceDays * 86400000).toISOString()
      : null

  const counter = () => {
    let q = supabase
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .in('table_name', tables)
    if (filters.who) q = q.eq('changed_by', filters.who)
    if (since) q = q.gte('changed_at', since)
    return q
  }

  const total$ = filters.includeImports
    ? counter()
    : counter().is('new_values->>import_batch_id', null)
  const imports$ = counter().not('new_values->>import_batch_id', 'is', null)

  const [totalResult, importResult] = await Promise.all([total$, imports$])
  if (totalResult.error) {
    return { entries: [], total: 0, importCount: 0, error: totalResult.error.message }
  }

  const total = totalResult.count ?? 0
  const importCount = importResult.count ?? 0

  // PostgREST answers a range starting past the end with a 416 rather than an
  // empty list, so `?page=99` rendered "Requested range not satisfiable" where
  // it should have said "nothing here". Counting first and skipping the query
  // is cleaner than translating the error afterwards.
  if (from >= total) return { entries: [], total, importCount, error: null }

  let rows = supabase.from('audit_log').select(SELECT).in('table_name', tables)
  if (filters.who) rows = rows.eq('changed_by', filters.who)
  if (since) rows = rows.gte('changed_at', since)
  if (!filters.includeImports) rows = rows.is('new_values->>import_batch_id', null)

  const result = await rows
    .order('changed_at', { ascending: false })
    .range(from, from + FEED_PAGE - 1)

  if (result.error) return { entries: [], total, importCount, error: result.error.message }

  return {
    entries: await build(supabase, (result.data ?? []) as Row[]),
    total,
    importCount,
    error: null,
  }
}
