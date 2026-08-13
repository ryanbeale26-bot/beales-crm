import Link from 'next/link'

import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { Bar, ExportLink, Stat } from '@/components/report'
import { money } from '@/lib/format'
import { fetchHealth, healthLabel } from '@/lib/reports/health'
import { createClient } from '@/lib/supabase/server'

export default async function HealthReportPage() {
  const supabase = await createClient()
  const { rows, buildings, error } = await fetchHealth(supabase)

  const totalBuildings = rows.reduce((n, r) => n + Number(r.building_count ?? 0), 0)
  const totalMrr = rows.reduce((n, r) => n + Number(r.mrr ?? 0), 0)
  const atRisk = rows.find((r) => r.health_score === 'at_risk')
  const unscored = rows.find((r) => r.health_score === null)
  const maxCount = Math.max(...rows.map((r) => Number(r.building_count ?? 0)), 1)

  return (
    <div>
      <PageHeader
        title="Client health"
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Client health' }]}
        subtitle="How the portfolio is doing, and how much revenue sits behind each answer."
        action={<ExportLink href="/reports/health/export" />}
      />

      {error && (
        <p className="text-destructive text-sm">Could not load the report: {error.message}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Buildings"
          value={String(totalBuildings)}
          note={`${money(totalMrr)} of MRR between them`}
        />
        <Stat
          label="At risk"
          value={String(atRisk?.building_count ?? 0)}
          note={
            atRisk ? `${money(atRisk.mrr)} of MRR at risk` : 'No building is currently at risk'
          }
        />
        <Stat
          label="Not scored"
          value={String(unscored?.building_count ?? 0)}
          note={
            unscored
              ? `${money(unscored.mrr)} of MRR nobody has assessed`
              : 'Every building has a score'
          }
        />
      </div>

      <SectionTitle>The portfolio</SectionTitle>
      {rows.length === 0 ? (
        <EmptyState title="No buildings yet." />
      ) : (
        <div className="border-border border-t">
          {rows.map((r) => (
            <div key={r.health_score ?? 'unset'} className="border-border border-b px-2 py-2.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium">{healthLabel(r.health_score)}</span>
                <span className="text-muted-foreground shrink-0 text-sm">
                  {r.building_count} across {r.account_count}{' '}
                  {Number(r.account_count) === 1 ? 'account' : 'accounts'} · {money(r.mrr)}
                </span>
              </div>
              <div className="mt-1.5">
                <Bar
                  value={Number(r.building_count ?? 0)}
                  max={maxCount}
                  tone={r.health_score === 'at_risk' ? 'muted' : 'navy'}
                />
              </div>
              {Number(r.buildings_with_value) < Number(r.building_count) && (
                <p className="text-muted-foreground/80 mt-1 text-xs">
                  Only {r.buildings_with_value} of {r.building_count} have a contract figure, so
                  that revenue is understated
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <SectionTitle
        aside={
          <span className="text-muted-foreground text-xs">
            Worst health first, then largest contract
          </span>
        }
      >
        Every building
      </SectionTitle>
      {buildings.length === 0 ? (
        <EmptyState title="No buildings yet.">
          <Link href="/admin/import" className="underline">
            Import your Active Clients tab
          </Link>{' '}
          to fill this in.
        </EmptyState>
      ) : (
        <div className="border-border border-t">
          {buildings.map((b) => (
            <Link
              key={b.building_id}
              href={`/buildings/${b.building_id}`}
              className="row-hover border-border flex items-center justify-between gap-4 border-b px-2 py-2.5"
            >
              <div className="min-w-0">
                <span className="truncate text-sm font-medium">{b.name}</span>
                <p className="text-muted-foreground mt-0.5 truncate text-sm">
                  {[b.account, b.city].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <div className="shrink-0 text-right text-sm">
                <div>{healthLabel(b.health_score)}</div>
                <div className="text-muted-foreground">
                  {b.monthly_value === null ? 'no value' : `${money(b.monthly_value)}/mo`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
