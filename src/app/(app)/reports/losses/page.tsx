import Link from 'next/link'

import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { BarRow, ExportLink, rank, Stat } from '@/components/report'
import { date, money } from '@/lib/format'
import { fetchLosses } from '@/lib/reports/losses'
import { createClient } from '@/lib/supabase/server'

export default async function LossesReportPage() {
  const supabase = await createClient()
  const { rows, lostDeals, lostBuildings, lostAnnual, competitors, error } =
    await fetchLosses(supabase)

  const reasons = rank(lostDeals, (o) => o.loss_reason)
  const noReason = lostDeals.filter((o) => !o.loss_reason).length

  return (
    <div>
      <PageHeader
        title="Losses"
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Losses' }]}
        subtitle="Deals lost and buildings lost, and what took them."
        action={<ExportLink href="/reports/losses/export" />}
      />

      {error && (
        <p className="text-destructive text-sm">Could not load the report: {error.message}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Deals lost"
          value={String(lostDeals.length)}
          note={lostAnnual > 0 ? `${money(lostAnnual)} of annual value` : 'No value recorded'}
        />
        <Stat
          label="Buildings lost"
          value={String(lostBuildings.length)}
          note={
            lostBuildings.length === 0
              ? 'No building has been marked lost'
              : 'Their contracts are closed'
          }
        />
        <Stat
          label="Reasons recorded"
          value={`${lostDeals.length - noReason} of ${lostDeals.length}`}
          note={noReason > 0 ? `${noReason} lost with no reason given` : 'Every loss has a reason'}
        />
      </div>

      {/*
        Five losses is not a pattern. Saying that out loud is the difference
        between a report someone acts on and a report that teaches them to
        distrust the whole app the first time the "top reason" turns out to be
        a single deal.
      */}
      {lostDeals.length > 0 && lostDeals.length < 5 && (
        <p className="text-muted-foreground mt-6 text-sm">
          Only {lostDeals.length} recorded {lostDeals.length === 1 ? 'loss' : 'losses'} — too few to
          read a pattern into. This page becomes useful as losses accumulate.
        </p>
      )}

      <SectionTitle>Why we lose</SectionTitle>
      {reasons.length === 0 ? (
        <EmptyState title={lostDeals.length === 0 ? 'Nothing lost yet.' : 'No reasons recorded.'}>
          {lostDeals.length > 0 && (
            <>
              Add a reason on each lost deal and it ranks here. The list is editable in{' '}
              <Link href="/admin/reference" className="underline">
                Admin
              </Link>
              .
            </>
          )}
        </EmptyState>
      ) : (
        <div className="border-border border-t">
          {reasons.map(([name, n]) => (
            <BarRow key={name} label={name} meta={n} value={n} max={reasons[0][1]} tone="muted" />
          ))}
        </div>
      )}

      <SectionTitle>Competitors</SectionTitle>
      {competitors.length === 0 ? (
        <EmptyState title="No competitor recorded on a closed deal yet." />
      ) : (
        <div className="border-border border-t">
          {competitors.map(([name, row]) => (
            <div
              key={name}
              className="border-border flex items-baseline justify-between gap-4 border-b px-2 py-2.5 text-sm"
            >
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground shrink-0">
                beat them {row.beat} · lost to them {row.lostTo}
              </span>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Everything lost</SectionTitle>
      {rows.length === 0 ? (
        <EmptyState title="Nothing has been lost." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-y text-xs">
                <th className="py-2 pr-3 text-left font-normal">What</th>
                <th className="py-2 pr-3 text-left font-normal">Name</th>
                <th className="py-2 pr-3 text-left font-normal">Reason</th>
                <th className="py-2 pr-3 text-left font-normal">Lost on</th>
                <th className="py-2 text-right font-normal">Annual value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.kind}-${r.name}-${i}`} className="border-border border-b">
                  <td className="text-muted-foreground py-2 pr-3">{r.kind}</td>
                  <td className="py-2 pr-3 font-medium">
                    {r.name}
                    {r.account && (
                      <span className="text-muted-foreground font-normal"> · {r.account}</span>
                    )}
                  </td>
                  <td className="text-muted-foreground py-2 pr-3">{r.reason ?? '—'}</td>
                  <td className="text-muted-foreground py-2 pr-3">
                    {r.lost_on ? date(r.lost_on) : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {r.annual_value === null ? '—' : money(r.annual_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
