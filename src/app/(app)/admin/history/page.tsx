import Link from 'next/link'

import { EmptyState, PageHeader } from '@/components/page-header'
import { HistoryLine } from '@/components/record-history'
import { Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { FEED_PAGE, fetchAuditFeed } from '@/lib/audit'
import { AUDIT_TABLES, TABLE_META, isAuditTable } from '@/lib/audit/fields'
import { count } from '@/lib/format'
import { getCurrentProfile } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

/**
 * Everything that changed, newest first.
 *
 * The audit triggers have been writing since the first migration and nothing
 * ever read them. This is the company-wide view; each record also carries its
 * own History on its own page, which is where you would normally look.
 *
 * What it can show is decided by the allowlist in `src/lib/audit/fields.ts`,
 * not by what happens to be audited — so a table audited later stays out until
 * somebody has decided how to word it.
 */

const SINCE = [
  { value: '', label: 'Any time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

export default async function AuditHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    who?: string
    table?: string
    since?: string
    imports?: string
    page?: string
  }>
}) {
  const profile = await getCurrentProfile()

  if (profile?.role !== 'admin') {
    return (
      <div>
        <PageHeader title="History" />
        <EmptyState title="Only an admin can see the company-wide history.">
          Every record still shows its own History on its own page.
        </EmptyState>
      </div>
    )
  }

  const params = await searchParams
  const supabase = await createClient()

  const page = Math.max(Number(params.page ?? '1') || 1, 1)
  const includeImports = params.imports === '1'
  const table = params.table && isAuditTable(params.table) ? params.table : undefined
  const sinceDays = Number(params.since ?? '') || undefined

  const [{ entries, total, importCount, error }, { data: people }] = await Promise.all([
    fetchAuditFeed(supabase, { who: params.who || undefined, table, sinceDays, includeImports, page }),
    // Everyone who could have changed something, service accounts included —
    // filtering the nightly job out of this list is how a bad night becomes
    // invisible.
    supabase.from('profiles').select('id, full_name').order('full_name'),
  ])

  const shownTo = (page - 1) * FEED_PAGE + entries.length
  const query = (over: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    const merged = { ...params, ...over }
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, String(v))
    const qs = next.toString()
    return qs ? `/admin/history?${qs}` : '/admin/history'
  }

  return (
    <div>
      <PageHeader
        title="History"
        subtitle="Who changed what, newest first."
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'History' }]}
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="who" defaultValue={params.who ?? ''} aria-label="Filter by person">
          <option value="">Anyone</option>
          {(people ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </Select>

        <Select name="table" defaultValue={params.table ?? ''} aria-label="Filter by record type">
          <option value="">Every kind of record</option>
          {AUDIT_TABLES.map((t) => (
            <option key={t} value={t}>
              {TABLE_META[t].plural}
            </option>
          ))}
        </Select>

        <Select name="since" defaultValue={params.since ?? ''} aria-label="How far back">
          {SINCE.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        {includeImports && <input type="hidden" name="imports" value="1" />}
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(params.who || params.table || params.since) && (
          <Button variant="ghost" asChild>
            <Link href={includeImports ? '/admin/history?imports=1' : '/admin/history'}>Clear</Link>
          </Button>
        )}
      </form>

      {/* Never a silent cap. Imports have their own screen and their own Undo,
          so the feed defaults to what people did by hand — and says so, with
          the number it is leaving out. */}
      <p className="text-muted-foreground mb-4 text-sm">
        {includeImports ? (
          <>
            Showing everything, imports included.{' '}
            <Link href={query({ imports: undefined, page: undefined })} className="underline">
              Hide the {count(importCount)} from spreadsheet imports
            </Link>
          </>
        ) : (
          <>
            Changes people made by hand.{' '}
            <Link href={query({ imports: '1', page: undefined })} className="underline">
              Include the {count(importCount)} from spreadsheet imports
            </Link>
          </>
        )}
      </p>

      {error && <p className="text-destructive text-sm">Could not load the history: {error}</p>}

      {!error && entries.length === 0 && (
        <EmptyState title="Nothing here yet.">
          {params.who || params.table || params.since
            ? 'Try a wider filter.'
            : 'Every edit made in the app is recorded from here on.'}
        </EmptyState>
      )}

      {entries.length > 0 && (
        <>
          <ol className="border-border border-t">
            {entries.map((entry) => (
              <li key={entry.id} className="border-border border-b px-2 py-2.5">
                <HistoryLine entry={entry} showSubject />
              </li>
            ))}
          </ol>

          <div className="text-muted-foreground mt-3 flex items-center justify-between text-sm">
            <span>
              {shownTo} of {count(total)}
            </span>
            <span className="flex gap-2">
              {page > 1 && (
                <Button variant="secondary" size="sm" asChild>
                  <Link href={query({ page: page === 2 ? undefined : String(page - 1) })}>
                    Newer
                  </Link>
                </Button>
              )}
              {shownTo < total && (
                <Button variant="secondary" size="sm" asChild>
                  <Link href={query({ page: String(page + 1) })}>Older</Link>
                </Button>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
