import Link from 'next/link'

import { PipelineBoard, type BoardDeal } from '@/app/(app)/opportunities/board'
import { EmptyState, PageHeader, Row, RowList } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { date, money } from '@/lib/format'
import { getCompetitors, getLossReasons, getWinReasons } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

const VIEWS = ['Board', 'Table'] as const
type View = (typeof VIEWS)[number]

const selectClass = 'bg-muted h-8 rounded-[3px] border-0 px-2 text-sm outline-none'

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; owner?: string; stage?: string; q?: string }>
}) {
  const { view: rawView, owner, stage, q } = await searchParams
  const view: View = (VIEWS as readonly string[]).includes(rawView ?? '')
    ? (rawView as View)
    : 'Board'

  const supabase = await createClient()

  let query = supabase
    .from('opportunities')
    .select(
      `id, name, stage_id, monthly_value, annual_value, expected_close_date,
       account:accounts(id, name),
       owner:profiles!opportunities_owner_id_fkey(id, full_name)`,
    )
    .is('deleted_at', null)
    .order('monthly_value', { ascending: false, nullsFirst: false })

  if (owner) query = query.eq('owner_id', owner)
  if (stage) query = query.eq('stage_id', stage)
  if (q) query = query.ilike('name', `%${q}%`)

  const [
    { data: rows, error },
    { data: stages },
    { data: people },
    { data: funnel },
    lossReasons,
    competitors,
    winReasons,
  ] = await Promise.all([
    query,
    supabase
      .from('pipeline_stages')
      .select('id, name, probability, sort_order, is_won, is_lost')
      .eq('is_active', true)
      .order('sort_order'),
    // Active people only, and never the nightly ingest — it owns nothing.
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .eq('is_service', false)
      .order('full_name'),
    supabase.from('v_pipeline_funnel').select('*').order('stage_sort_order'),
    getLossReasons('opportunity'),
    getCompetitors(),
    getWinReasons(),
  ])

  const deals: BoardDeal[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    stage_id: r.stage_id,
    monthly_value: r.monthly_value === null ? null : Number(r.monthly_value),
    annual_value: r.annual_value === null ? null : Number(r.annual_value),
    expected_close_date: r.expected_close_date,
    account_name: r.account?.name ?? null,
    owner_name: r.owner?.full_name ?? null,
  }))

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]))

  // Open deals only. Closed Won weights at 100%, so summing every stage would
  // report a pipeline that includes work already delivered.
  const open = (funnel ?? []).filter((f) => f.is_open)
  const weighted = open.reduce((sum, f) => sum + Number(f.weighted_annual_value ?? 0), 0)
  const total = open.reduce((sum, f) => sum + Number(f.annual_value ?? 0), 0)
  const openCount = open.reduce((sum, f) => sum + Number(f.deal_count ?? 0), 0)
  const withoutValue = open.reduce((sum, f) => sum + Number(f.deals_without_value ?? 0), 0)

  const filtered = Boolean(owner || stage || q)
  const keep = (next: Partial<Record<string, string>>) => {
    const params = new URLSearchParams()
    if (owner) params.set('owner', owner)
    if (stage) params.set('stage', stage)
    if (q) params.set('q', q)
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v)
    const s = params.toString()
    return s ? `/opportunities?${s}` : '/opportunities'
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={
          <>
            {openCount} open {openCount === 1 ? 'deal' : 'deals'} · {money(total)}/yr ·{' '}
            {money(weighted)} weighted
            {withoutValue > 0 && (
              <span className="block">
                {withoutValue} of them carry no value, so these totals are understated.
              </span>
            )}
          </>
        }
        action={
          <Button asChild>
            <Link href="/opportunities/new">New deal</Link>
          </Button>
        }
      />

      <nav className="border-border mb-5 flex gap-4 border-b text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={keep({ view: v })}
            className={cn(
              '-mb-px border-b-2 pb-2',
              v === view
                ? 'border-foreground text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {v}
          </Link>
        ))}
      </nav>

      <form className="mb-5 flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value={view} />
        <Input name="q" defaultValue={q ?? ''} placeholder="Search deals" className="h-8 w-48" />
        <select name="owner" defaultValue={owner ?? ''} className={selectClass}>
          <option value="">Anyone</option>
          {(people ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={stage ?? ''} className={selectClass}>
          <option value="">Every stage</option>
          {(stages ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
        {filtered && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/opportunities?view=${view}`}>Clear</Link>
          </Button>
        )}
        <span className="grow" />
        <Link href="/reports/pipeline" className="text-muted-foreground hover:text-foreground text-sm underline">
          Pipeline report
        </Link>
      </form>

      {error && (
        <p className="text-destructive text-sm">Could not load the pipeline: {error.message}</p>
      )}

      {deals.length === 0 ? (
        <EmptyState title={filtered ? 'No deals match that.' : 'No deals yet.'}>
          {!filtered && (
            <>
              <Link href="/opportunities/new" className="underline">
                Add the first one
              </Link>
              , or{' '}
              <Link href="/admin/import" className="underline">
                import your Pipeline tab
              </Link>
              .
            </>
          )}
        </EmptyState>
      ) : view === 'Board' ? (
        <PipelineBoard
          stages={stages ?? []}
          deals={deals}
          lossReasons={lossReasons}
          competitors={competitors}
          winReasons={winReasons}
        />
      ) : (
        <RowList>
          {deals.map((d) => {
            const s = stageById.get(d.stage_id)
            return (
              <Row
                key={d.id}
                href={`/opportunities/${d.id}`}
                title={d.name}
                meta={[d.account_name, d.owner_name, d.expected_close_date ? `closes ${date(d.expected_close_date)}` : null]
                  .filter(Boolean)
                  .join(' · ')}
                badges={
                  s && (
                    <span
                      className={cn(
                        'rounded-[3px] px-1.5 py-0.5 text-xs',
                        s.is_lost
                          ? 'text-destructive bg-destructive/10'
                          : s.is_won
                            ? 'bg-brand-gold/30 text-foreground'
                            : 'text-muted-foreground bg-muted',
                      )}
                    >
                      {s.name}
                    </span>
                  )
                }
                right={
                  d.monthly_value ? (
                    `${money(d.monthly_value)}/mo`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
            )
          })}
        </RowList>
      )}
    </div>
  )
}
