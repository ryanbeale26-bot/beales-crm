import Link from 'next/link'

import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { ExportLink, MonthBars, Stat } from '@/components/report'
import { money, monthLabel } from '@/lib/format'
import { fetchRevenue } from '@/lib/reports/revenue'
import { createClient } from '@/lib/supabase/server'

export default async function RevenueReportPage() {
  const supabase = await createClient()
  const { months, coverage, error, hasMovement } = await fetchRevenue(supabase)

  const latest = months.at(-1)
  const first = months[0]
  const yearAgo = months.at(-13)
  const growth = latest && yearAgo ? latest.mrr - yearAgo.mrr : null

  const buildings = Number(coverage?.buildings_total ?? 0)
  const priced = Number(coverage?.buildings_with_value ?? 0)

  // Only the months where something actually moved. Printing 27 rows of zeros
  // would bury the six that matter.
  const moved = months.filter(
    (m) => m.newBusiness > 0 || m.expansion > 0 || m.contraction > 0 || m.churn > 0,
  )

  return (
    <div>
      <PageHeader
        title="Revenue over time"
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Revenue' }]}
        subtitle="Monthly recurring revenue, and what moved it."
        action={<ExportLink href="/reports/revenue/export" />}
      />

      {error && (
        <p className="text-destructive text-sm">Could not load the report: {error.message}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="MRR today"
          value={money(latest?.mrr ?? 0)}
          note={
            priced < buildings
              ? `${priced} of ${buildings} buildings priced — understated`
              : `All ${buildings} buildings priced`
          }
        />
        <Stat
          label="Growth over 12 months"
          value={growth === null ? '—' : money(growth)}
          note={
            yearAgo
              ? `From ${money(yearAgo.mrr)} in ${monthLabel(yearAgo.month)}`
              : 'Not yet twelve months of history'
          }
        />
        <Stat
          label="Buildings billing"
          value={String(latest?.buildings ?? 0)}
          note={`Across ${latest?.accounts ?? 0} accounts`}
        />
      </div>

      <SectionTitle
        aside={
          first && latest ? (
            <span className="text-muted-foreground text-xs">
              {monthLabel(first.month)} — {monthLabel(latest.month)}
            </span>
          ) : undefined
        }
      >
        MRR month by month
      </SectionTitle>
      {months.length === 0 ? (
        <EmptyState title="No revenue history yet.">
          A building needs a monthly value before it appears here.
        </EmptyState>
      ) : (
        <MonthBars
          points={months.map((m) => ({
            month: m.month,
            label: monthLabel(m.month),
            value: m.mrr,
          }))}
        />
      )}

      <SectionTitle>What moved it</SectionTitle>

      {/*
        Three of these four columns have never been non-zero, and saying so is
        the difference between a report that looks broken and one that is
        honest about how young the data is. Contract history only exists from
        the point the portfolio was imported, and nothing has been repriced or
        ended inside the app yet.
      */}
      {!hasMovement && (
        <p className="text-muted-foreground mb-3 text-sm">
          Every change so far is new business. Nothing has been repriced, reduced or lost since the
          portfolio came across, so expansion, contraction and churn are all still zero — they fill
          in the first time a contract value changes on a{' '}
          <Link href="/buildings" className="underline">
            building
          </Link>
          .
        </p>
      )}

      {moved.length === 0 ? (
        <EmptyState title="Nothing has moved yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-y text-xs">
                <th className="py-2 pr-3 text-left font-normal">Month</th>
                <th className="py-2 pr-3 text-right font-normal">New</th>
                <th className="py-2 pr-3 text-right font-normal">Expansion</th>
                <th className="py-2 pr-3 text-right font-normal">Contraction</th>
                <th className="py-2 pr-3 text-right font-normal">Churn</th>
                <th className="py-2 text-right font-normal">Ending MRR</th>
              </tr>
            </thead>
            <tbody>
              {moved.map((m) => (
                <tr key={m.month} className="border-border border-b">
                  <td className="py-2 pr-3 font-medium">{monthLabel(m.month)}</td>
                  <td className="py-2 pr-3 text-right">
                    {m.newBusiness > 0 ? money(m.newBusiness) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {m.expansion > 0 ? money(m.expansion) : '—'}
                  </td>
                  <td className="text-destructive py-2 pr-3 text-right">
                    {m.contraction > 0 ? `−${money(m.contraction)}` : '—'}
                  </td>
                  <td className="text-destructive py-2 pr-3 text-right">
                    {m.churn > 0 ? `−${money(m.churn)}` : '—'}
                  </td>
                  <td className="py-2 text-right font-medium">{money(m.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {priced < buildings && (
        <p className="text-muted-foreground/80 mt-6 text-xs">
          {buildings - priced} of {buildings} buildings have no contract figure at all, so they are
          absent from every number on this page. Adding a monthly value to a{' '}
          <Link href="/buildings" className="underline">
            building
          </Link>{' '}
          brings it in.
        </p>
      )}
    </div>
  )
}
