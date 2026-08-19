import Link from 'next/link'

import { EmptyState } from '@/components/page-header'
import type { Entry } from '@/lib/audit'
import { fetchRecordHistory } from '@/lib/audit'
import type { AuditTable } from '@/lib/audit/fields'
import { TABLE_META } from '@/lib/audit/fields'
import { ago } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

/**
 * Who changed what on one record, in English.
 *
 * Modelled on `activity-timeline.tsx` on purpose — same markup, same empty
 * state, same "render the error rather than throw" behaviour, so the two
 * timelines on a record page read as one thing.
 *
 * `RowList`/`Row` is not used: `Row` renders a `<Link>` and a history entry is
 * not somewhere you navigate to.
 */
export async function RecordHistory({
  table,
  recordId,
  limit = 25,
}: {
  table: AuditTable
  recordId: string
  limit?: number
}) {
  const supabase = await createClient()
  const { entries, error } = await fetchRecordHistory(supabase, table, recordId, limit)

  if (error) {
    return <p className="text-destructive text-sm">Could not load the history: {error}</p>
  }

  if (entries.length === 0) {
    return (
      <EmptyState title="No changes recorded yet.">
        Every edit from here on is logged — who made it, and what moved.
      </EmptyState>
    )
  }

  return (
    <ol className="border-border border-t">
      {entries.map((entry) => (
        <li key={entry.id} className="border-border border-b px-2 py-2.5">
          <HistoryLine entry={entry} context={table} />
        </li>
      ))}
    </ol>
  )
}

/**
 * One entry, shared by the record view and the admin feed.
 *
 * Laid out like the activity timeline: a type chip and the subject on top,
 * who and when underneath, then what actually moved. `context` is the table
 * whose page this is on — an entry from that same table needs no chip,
 * because you can see what you are looking at.
 */
export function HistoryLine({
  entry,
  context,
  showSubject = false,
}: {
  entry: Entry
  context?: AuditTable
  showSubject?: boolean
}) {
  const meta = TABLE_META[entry.table]
  const chip = entry.table !== context
  const verb =
    entry.action === 'insert' ? 'Added' : entry.action === 'delete' ? 'Removed' : 'Changed'

  return (
    <>
      {(chip || showSubject) && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {chip && (
            <span className="bg-muted rounded-[3px] px-1.5 py-0.5 text-xs capitalize">
              {meta.singular}
            </span>
          )}
          {showSubject && entry.subject && (
            <span className="font-medium">
              {entry.href ? (
                <Link href={entry.href} className="hover:underline">
                  {entry.subject}
                </Link>
              ) : (
                entry.subject
              )}
            </span>
          )}
        </div>
      )}

      <div className="text-muted-foreground mt-0.5 text-xs">
        {verb} by {entry.who} · {ago(entry.at)}
        {entry.fromImport && ' · from a spreadsheet import'}
      </div>

      {entry.changes.length > 0 && (
        <dl className="mt-1.5 space-y-0.5 text-sm">
          {entry.changes.map((change) => (
            <div key={change.label} className="flex flex-wrap items-baseline gap-x-1.5">
              <dt className="text-muted-foreground w-40 shrink-0 truncate">{change.label}</dt>
              <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                <span className="text-muted-foreground line-through">{change.from}</span>
                <span aria-hidden className="text-muted-foreground/60">
                  &rarr;
                </span>
                <span>{change.to}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}
