import Link from 'next/link'

import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { ExportLink, Stat } from '@/components/report'
import { count, date, money } from '@/lib/format'
import { type AccountActivity, fetchActivityCoverage } from '@/lib/reports/activity'
import { createClient } from '@/lib/supabase/server'

function Line({ row }: { row: AccountActivity }) {
  return (
    <Link
      href={`/accounts/${row.account_id}`}
      className="row-hover border-border flex items-center justify-between gap-4 border-b px-2 py-2.5"
    >
      <div className="min-w-0">
        <span className="truncate text-sm font-medium">{row.account_name}</span>
        <p className="text-muted-foreground mt-0.5 truncate text-sm">
          {row.total === 0
            ? 'Nothing ever logged'
            : `${row.total} logged · last on ${date(row.last_activity)}`}
        </p>
      </div>
      <div className="shrink-0 text-right text-sm">
        <div>{row.days_quiet === null ? '—' : `${row.days_quiet} days`}</div>
        {row.monthly_value > 0 && (
          <div className="text-muted-foreground">{money(row.monthly_value)}/mo</div>
        )}
      </div>
    </Link>
  )
}

export default async function ActivityReportPage() {
  const supabase = await createClient()
  const { rows, silent, quiet, active, attributed, totalLogged, unattributed, error } =
    await fetchActivityCoverage(supabase)

  // The number that makes this page worth opening: revenue nobody has touched.
  const quietMrr = [...silent, ...quiet].reduce((n, r) => n + r.monthly_value, 0)

  return (
    <div>
      <PageHeader
        title="Activity coverage"
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Activity coverage' }]}
        subtitle="Which accounts have gone quiet."
        action={<ExportLink href="/reports/activity/export" />}
      />

      {error && (
        <p className="text-destructive text-sm">Could not load the report: {error.message}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Touched in 90 days"
          value={`${active.length} of ${rows.length}`}
          note={`${count(attributed)} of ${count(totalLogged)} activities are attached to an account`}
        />
        <Stat
          label="Gone quiet"
          value={String(quiet.length + silent.length)}
          note={
            silent.length > 0
              ? `${silent.length} have never had anything logged`
              : 'All have some history'
          }
        />
        <Stat
          label="Quiet revenue"
          value={money(quietMrr)}
          note="MRR on accounts nobody has touched in 90 days"
        />
      </div>

      <SectionTitle>Nothing ever logged</SectionTitle>
      {silent.length === 0 ? (
        <EmptyState title="Every account has some history." />
      ) : (
        <div className="border-border border-t">
          {silent.map((r) => (
            <Line key={r.account_id} row={r} />
          ))}
        </div>
      )}

      <SectionTitle
        aside={<span className="text-muted-foreground text-xs">Longest silence first</span>}
      >
        Quiet for 90 days or more
      </SectionTitle>
      {quiet.length === 0 ? (
        <EmptyState title="Nothing has gone quiet." />
      ) : (
        <div className="border-border border-t">
          {quiet.map((r) => (
            <Line key={r.account_id} row={r} />
          ))}
        </div>
      )}

      <SectionTitle
        aside={
          <span className="text-muted-foreground text-xs">
            {active.length} {active.length === 1 ? 'account' : 'accounts'}
          </span>
        }
      >
        Active
      </SectionTitle>
      {active.length === 0 ? (
        <EmptyState title="Nothing logged in the last 90 days.">
          <Link href="/activity" className="underline">
            Log something
          </Link>{' '}
          and it appears here.
        </EmptyState>
      ) : (
        <div className="border-border border-t">
          {active.map((r) => (
            <Line key={r.account_id} row={r} />
          ))}
        </div>
      )}

      {unattributed > 0 && (
        <p className="text-muted-foreground/80 mt-6 text-xs">
          {count(unattributed)} of {count(totalLogged)} activities are not attached to an account,
          building, deal or contact, so they count towards nobody above. Almost all of them came
          from the Activity Log import — logging from a{' '}
          <Link href="/accounts" className="underline">
            record
          </Link>{' '}
          rather than from the feed attaches them automatically.
        </p>
      )}
    </div>
  )
}
