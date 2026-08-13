import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DealActions } from '@/app/(app)/opportunities/[id]/deal-actions'
import { ActivityTimeline } from '@/components/activity-timeline'
import { EmptyState, PageHeader, Property } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ENTITY_LABELS, date, money, squareFeet } from '@/lib/format'
import { getCompetitors, getLossReasons, getWinReasons } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

const TABS = ['Overview', 'Stage history', 'Activity'] as const
type Tab = (typeof TABS)[number]

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab: rawTab } = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as Tab)
    : 'Overview'

  const supabase = await createClient()

  const { data: deal, error } = await supabase
    .from('opportunities')
    .select(
      `*,
       stage:pipeline_stages(id, name, probability, is_won, is_lost),
       account:accounts(id, name),
       building:buildings(id, name),
       property_type:property_types(name),
       lead_source:lead_sources(name),
       loss_reason:loss_reasons(name),
       win_reason:win_reasons(name),
       competitor:competitors(name),
       owner:profiles!opportunities_owner_id_fkey(full_name, is_active),
       secondary_owner:profiles!opportunities_secondary_owner_id_fkey(full_name, is_active)`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  // A failed query is not a missing record — don't hide bugs behind a 404.
  if (error) throw new Error(`Could not load this deal: ${error.message}`)
  if (!deal) notFound()

  const closed = Boolean(deal.stage?.is_won || deal.stage?.is_lost)

  const [{ data: history }, lossReasons, competitors, winReasons] = await Promise.all([
    tab === 'Stage history'
      ? supabase
          .from('v_opportunity_stage_durations')
          .select('stage_name, entered_at, left_at, is_current, days_in_stage')
          .eq('opportunity_id', id)
          .order('entered_at')
      : Promise.resolve({ data: null }),
    closed ? getLossReasons('opportunity') : Promise.resolve([]),
    closed ? getCompetitors() : Promise.resolve([]),
    closed ? getWinReasons() : Promise.resolve([]),
  ])

  const monthly = deal.monthly_value === null ? null : Number(deal.monthly_value)
  const weighted =
    monthly === null ? null : (monthly * 12 * (deal.stage?.probability ?? 0)) / 100

  return (
    <div>
      <PageHeader
        title={deal.name}
        breadcrumbs={[{ label: 'Pipeline', href: '/opportunities' }, { label: deal.name }]}
        subtitle={
          <>
            <span
              className={cn(
                'mr-2 rounded-[3px] px-1.5 py-0.5 text-xs',
                deal.stage?.is_lost
                  ? 'text-destructive bg-destructive/10'
                  : deal.stage?.is_won
                    ? 'bg-brand-gold/30 text-foreground'
                    : 'text-muted-foreground bg-muted',
              )}
            >
              {deal.stage?.name}
            </span>
            {monthly !== null
              ? `${money(monthly)}/mo · ${money(monthly * 12)}/yr`
              : 'No value set'}
            {weighted !== null && !closed && ` · ${money(weighted)} weighted`}
          </>
        }
        action={
          <>
            {closed && (
              <DealActions
                opportunityId={deal.id}
                dealName={deal.name}
                mode={deal.stage?.is_won ? 'won' : 'lost'}
                converted={deal.building_id !== null}
                lossReasons={lossReasons}
                competitors={competitors}
                winReasons={winReasons}
              />
            )}
            <Button variant="outline" asChild>
              <Link href={`/opportunities/${id}/edit`}>Edit</Link>
            </Button>
          </>
        }
      />

      <nav className="border-border mb-5 flex gap-4 overflow-x-auto border-b text-sm">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/opportunities/${id}?tab=${t}`}
            className={cn(
              '-mb-px border-b-2 pb-2 whitespace-nowrap',
              t === tab
                ? 'border-foreground text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === 'Overview' && (
        <div className="max-w-2xl">
          <dl>
            <Property label="Account">
              {deal.account ? (
                <Link href={`/accounts/${deal.account.id}`} className="underline">
                  {deal.account.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  New customer — the account is created when it&rsquo;s won
                </span>
              )}
            </Property>
            {deal.building && (
              <Property label="Building">
                <Link href={`/buildings/${deal.building.id}`} className="underline">
                  {deal.building.name}
                </Link>
              </Property>
            )}
            <Property label="Owner">
              {deal.owner?.full_name ?? '—'}
              {deal.owner && !deal.owner.is_active && (
                <span className="text-muted-foreground"> (no longer here)</span>
              )}
            </Property>
            {deal.secondary_owner && (
              <Property label="Second owner">{deal.secondary_owner.full_name}</Property>
            )}
            <Property label="Segment">{deal.property_type?.name ?? '—'}</Property>
            <Property label="Source">{deal.lead_source?.name ?? '—'}</Property>
            <Property label="Entity">{ENTITY_LABELS[deal.entity]}</Property>
            <Property label="Address">
              {[deal.address_line1, deal.city, deal.state, deal.postal_code]
                .filter(Boolean)
                .join(', ') || '—'}
            </Property>
            <Property label="Square footage">
              {deal.square_footage ? squareFeet(deal.square_footage) : '—'}
            </Property>
            <Property label="Who has it now">{deal.incumbent_provider ?? '—'}</Property>
            <Property label="Staff on site now">{deal.current_staff_count ?? '—'}</Property>
            <Property label="Opened">
              {deal.opened_on ? (
                date(deal.opened_on)
              ) : (
                <span className="text-muted-foreground">Not known</span>
              )}
            </Property>
            <Property label="Expected close">{date(deal.expected_close_date)}</Property>
            {deal.actual_close_date && (
              <Property label="Closed">{date(deal.actual_close_date)}</Property>
            )}
          </dl>

          {deal.stage?.is_lost && (
            <div className="border-border mt-6 border-t pt-4">
              <dl>
                <Property label="Why we lost">{deal.loss_reason?.name ?? '—'}</Property>
                <Property label="Who won it">{deal.competitor?.name ?? '—'}</Property>
              </dl>
            </div>
          )}

          {deal.stage?.is_won && (
            <div className="border-border mt-6 border-t pt-4">
              <dl>
                <Property label="What tipped it">{deal.win_reason?.name ?? '—'}</Property>
              </dl>
              {deal.win_notes && (
                <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                  {deal.win_notes}
                </p>
              )}
              {!deal.building_id && (
                <p className="bg-muted text-muted-foreground mt-4 rounded-[3px] p-3 text-sm">
                  This deal is won but has no building yet, so it isn&rsquo;t counted in revenue.
                  Use &ldquo;Add the building&rdquo; above.
                </p>
              )}
            </div>
          )}

          <div className="border-border mt-6 border-t pt-4">
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {deal.scope_notes || 'No notes yet.'}
            </p>
          </div>
        </div>
      )}

      {tab === 'Stage history' &&
        (history && history.length > 0 ? (
          <ol className="border-border max-w-2xl border-t">
            {history.map((h, i) => (
              <li key={i} className="border-border flex items-baseline justify-between gap-4 border-b px-2 py-2.5">
                <div>
                  <span className="font-medium">{h.stage_name}</span>
                  <span className="text-muted-foreground ml-2 text-sm">
                    from {date(h.entered_at)}
                  </span>
                </div>
                <span className="text-muted-foreground shrink-0 text-sm">
                  {h.is_current ? `${h.days_in_stage} days, still here` : `${h.days_in_stage} days`}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No stage history yet." />
        ))}

      {tab === 'Activity' && <ActivityTimeline scope={{ opportunityId: id }} />}
    </div>
  )
}
