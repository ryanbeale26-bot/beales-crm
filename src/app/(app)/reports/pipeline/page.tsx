import Link from 'next/link'

import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { Bar, ExportLink, rank, Stat } from '@/components/report'
import { money, percent } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function PipelineReportPage() {
  const supabase = await createClient()

  const [
    { data: funnel, error: funnelError },
    { data: outcomes, error: outcomesError },
    { data: rate, error: rateError },
  ] = await Promise.all([
    supabase.from('v_pipeline_funnel').select('*').order('stage_sort_order'),
    supabase.from('v_opportunity_outcomes').select('*'),
    supabase.from('v_opportunity_win_rate').select('*').single(),
  ])

  const error = funnelError ?? outcomesError ?? rateError
  const stages = funnel ?? []
  const closed = outcomes ?? []

  const open = stages.filter((s) => s.is_open)
  const openCount = open.reduce((n, s) => n + Number(s.deal_count ?? 0), 0)
  const openAnnual = open.reduce((n, s) => n + Number(s.annual_value ?? 0), 0)
  const openWeighted = open.reduce((n, s) => n + Number(s.weighted_annual_value ?? 0), 0)
  const noValue = open.reduce((n, s) => n + Number(s.deals_without_value ?? 0), 0)
  const maxCount = Math.max(...stages.map((s) => Number(s.deal_count ?? 0)), 1)

  const won = closed.filter((o) => o.won)
  const lost = closed.filter((o) => !o.won)

  // Win rate comes from the view, not from counting these rows. The dashboard
  // shows the same number, and one definition in SQL is the only way the two
  // cannot drift apart.
  const wonAnnual = Number(rate?.won_annual ?? 0)
  const undated = Number(rate?.closed_without_date ?? 0)

  // Sales cycle, by segment. Deals with no opened_on are counted separately
  // rather than averaged in as zero — the spreadsheet never recorded a start
  // date, so for now most closed deals genuinely cannot be measured.
  const measurable = closed.filter((o) => o.days_to_close !== null && Number(o.days_to_close) >= 0)
  const unmeasurable = closed.length - measurable.length
  const bySegment = new Map<string, number[]>()
  for (const o of measurable) {
    const key = o.property_type ?? 'No segment'
    bySegment.set(key, [...(bySegment.get(key) ?? []), Number(o.days_to_close)])
  }
  const cycles = [...bySegment.entries()]
    .map(([name, days]) => ({
      name,
      count: days.length,
      average: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    }))
    .sort((a, b) => a.average - b.average)
  const maxCycle = Math.max(...cycles.map((c) => c.average), 1)

  const lossReasons = rank(lost, (o) => o.loss_reason)
  const winReasons = rank(won, (o) => o.win_reason)

  // A competitor named on a win is one we beat; on a loss, one that beat us.
  const competitors = new Map<string, { beat: number; lostTo: number }>()
  for (const o of closed) {
    if (!o.competitor) continue
    const row = competitors.get(o.competitor) ?? { beat: 0, lostTo: 0 }
    if (o.won) row.beat += 1
    else row.lostTo += 1
    competitors.set(o.competitor, row)
  }
  const competitorRows = [...competitors.entries()].sort(
    (a, b) => b[1].beat + b[1].lostTo - (a[1].beat + a[1].lostTo),
  )

  return (
    <div>
      <PageHeader
        title="Pipeline report"
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Pipeline' }]}
        subtitle="Where the work is, where it comes from, and where it goes."
        action={<ExportLink href="/reports/pipeline/export" />}
      />

      {error && (
        <p className="text-destructive text-sm">Could not load the report: {error.message}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Open pipeline"
          value={money(openAnnual)}
          note={`${openCount} ${openCount === 1 ? 'deal' : 'deals'}${noValue > 0 ? ` · ${noValue} with no value` : ''}`}
        />
        <Stat
          label="Weighted"
          value={money(openWeighted)}
          note="Each stage's value at its win probability"
        />
        <Stat
          label="Win rate"
          value={percent(rate?.win_rate)}
          note={
            closed.length === 0
              ? 'No closed deals yet'
              : `${rate?.won} won, ${rate?.lost} lost · ${money(wonAnnual)} won${undated > 0 ? ` · ${undated} have no close date` : ''}`
          }
        />
      </div>

      <SectionTitle>The funnel</SectionTitle>
      {openCount === 0 && closed.length === 0 ? (
        <EmptyState title="No deals yet.">
          <Link href="/admin/import" className="underline">
            Import your Pipeline tab
          </Link>{' '}
          to fill this in.
        </EmptyState>
      ) : (
        <div className="border-border border-t">
          {stages.map((s) => (
            <div key={s.stage_id} className="border-border border-b px-2 py-2.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium">
                  {s.stage_name}
                  <span className="text-muted-foreground ml-2 font-normal">{s.probability}%</span>
                </span>
                <span className="text-muted-foreground shrink-0 text-sm">
                  {s.deal_count} · {money(s.annual_value)}
                  {s.is_open && Number(s.annual_value) > 0 && (
                    <span className="ml-2">{money(s.weighted_annual_value)} weighted</span>
                  )}
                </span>
              </div>
              <div className="mt-1.5">
                <Bar
                  value={Number(s.deal_count ?? 0)}
                  max={maxCount}
                  tone={s.is_won ? 'gold' : s.is_lost ? 'muted' : 'navy'}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle
        aside={
          unmeasurable > 0 ? (
            <span className="text-muted-foreground text-xs">
              {unmeasurable} of {closed.length} closed deals have no start date
            </span>
          ) : undefined
        }
      >
        How long deals take, by segment
      </SectionTitle>
      {cycles.length === 0 ? (
        <EmptyState title="Nothing measurable yet.">
          A deal needs both an opened date and a close date. The spreadsheet only recorded the
          close, so this fills in as deals close from here on.
        </EmptyState>
      ) : (
        <div className="border-border border-t">
          {cycles.map((c) => (
            <div key={c.name} className="border-border border-b px-2 py-2.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-muted-foreground shrink-0 text-sm">
                  {c.average} days · {c.count} {c.count === 1 ? 'deal' : 'deals'}
                </span>
              </div>
              <div className="mt-1.5">
                <Bar value={c.average} max={maxCycle} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <SectionTitle>Why we lose</SectionTitle>
          {lossReasons.length === 0 ? (
            <EmptyState title={lost.length === 0 ? 'Nothing lost yet.' : 'No reasons recorded.'}>
              {lost.length > 0 && 'Add a reason on each lost deal and it will rank here.'}
            </EmptyState>
          ) : (
            <>
              <div className="border-border border-t">
                {lossReasons.map(([name, count]) => (
                  <div key={name} className="border-border border-b px-2 py-2">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{name}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="mt-1.5">
                      <Bar value={count} max={lossReasons[0][1]} tone="muted" />
                    </div>
                  </div>
                ))}
              </div>
              {lost.length < 5 && (
                <p className="text-muted-foreground/80 mt-2 text-xs">
                  Only {lost.length} recorded {lost.length === 1 ? 'loss' : 'losses'} — not enough
                  to read a pattern into.
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <SectionTitle>Why we win</SectionTitle>
          {winReasons.length === 0 ? (
            <EmptyState title="No win reasons recorded.">
              Set them up in{' '}
              <Link href="/admin/reference" className="underline">
                Admin
              </Link>{' '}
              and tag your won deals.
            </EmptyState>
          ) : (
            <div className="border-border border-t">
              {winReasons.map(([name, count]) => (
                <div key={name} className="border-border border-b px-2 py-2">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{name}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1.5">
                    <Bar value={count} max={winReasons[0][1]} tone="gold" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SectionTitle>Competitors</SectionTitle>
      {competitorRows.length === 0 ? (
        <EmptyState title="No competitors recorded on a closed deal yet." />
      ) : (
        <div className="border-border border-t">
          {competitorRows.map(([name, row]) => (
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
    </div>
  )
}
