import Link from 'next/link'

import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { Bar, Delta, ExportLink, Stat } from '@/components/report'
import { money } from '@/lib/format'
import { type AccountChange, fetchAccountExpansion } from '@/lib/reports/accounts'
import { createClient } from '@/lib/supabase/server'

function AccountRow({ row, max }: { row: AccountChange; max: number }) {
  return (
    <div className="border-border border-b px-2 py-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <Link href={`/accounts/${row.account_id}`} className="min-w-0 truncate text-sm font-medium">
          {row.account_name}
        </Link>
        <span className="text-muted-foreground shrink-0 text-sm">
          {money(row.mrr_now)} <Delta value={row.change_12m} />
        </span>
      </div>
      <div className="mt-1.5">
        <Bar
          value={Math.abs(row.change_12m)}
          max={max}
          tone={row.change_12m < 0 ? 'muted' : 'navy'}
        />
      </div>
      <p className="text-muted-foreground/80 mt-1 text-xs">
        {row.building_count} {row.building_count === 1 ? 'building' : 'buildings'} billing · 12
        months ago {money(row.mrr_12m)}
      </p>
    </div>
  )
}

export default async function AccountExpansionReportPage() {
  const supabase = await createClient()
  const { rows, billing, grew, shrank, flat, unbilled, error } =
    await fetchAccountExpansion(supabase)

  const totalNow = billing.reduce((n, r) => n + r.mrr_now, 0)
  const netChange = billing.reduce((n, r) => n + r.change_12m, 0)
  const maxChange = Math.max(...billing.map((r) => Math.abs(r.change_12m)), 1)

  return (
    <div>
      <PageHeader
        title="Account expansion"
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Account expansion' }]}
        subtitle="Which accounts have grown, and which have shrunk."
        action={<ExportLink href="/reports/accounts/export" />}
      />

      {error && (
        <p className="text-destructive text-sm">Could not load the report: {error.message}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Accounts billing"
          value={String(billing.length)}
          note={
            unbilled > 0
              ? `${unbilled} more accounts have no contract figure at all`
              : 'Every account is billing'
          }
        />
        <Stat label="Their MRR" value={money(totalNow)} />
        <Stat
          label="Net change, 12 months"
          value={netChange === 0 ? '—' : money(netChange)}
          note={`${grew.length} grew · ${shrank.length} shrank · ${flat.length} unchanged`}
        />
      </div>

      <SectionTitle>Grown</SectionTitle>
      {grew.length === 0 ? (
        <EmptyState title="No account has grown in the last twelve months.">
          Growth is recorded when a building&apos;s monthly value rises, or a new building joins an
          account.
        </EmptyState>
      ) : (
        <div className="border-border border-t">
          {grew.map((r) => (
            <AccountRow key={r.account_id} row={r} max={maxChange} />
          ))}
        </div>
      )}

      <SectionTitle>Shrunk</SectionTitle>
      {shrank.length === 0 ? (
        <EmptyState title="No account has shrunk." />
      ) : (
        <div className="border-border border-t">
          {shrank.map((r) => (
            <AccountRow key={r.account_id} row={r} max={maxChange} />
          ))}
        </div>
      )}

      {flat.length > 0 && (
        <>
          <SectionTitle
            aside={
              <span className="text-muted-foreground text-xs">
                {flat.length} {flat.length === 1 ? 'account' : 'accounts'}
              </span>
            }
          >
            Unchanged
          </SectionTitle>
          <div className="border-border border-t">
            {flat.map((r) => (
              <div
                key={r.account_id}
                className="border-border flex items-baseline justify-between gap-4 border-b px-2 py-2.5 text-sm"
              >
                <Link href={`/accounts/${r.account_id}`} className="min-w-0 truncate font-medium">
                  {r.account_name}
                </Link>
                <span className="text-muted-foreground shrink-0">{money(r.mrr_now)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {unbilled > 0 && (
        <p className="text-muted-foreground/80 mt-6 text-xs">
          {unbilled} of {rows.length} accounts carry no contract figure on any building, so they
          cannot appear above. They are still in the CSV export.
        </p>
      )}
    </div>
  )
}
