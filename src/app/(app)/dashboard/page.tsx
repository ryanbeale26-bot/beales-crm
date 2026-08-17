import Link from 'next/link'

import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { Bar, HealthDot, Stat } from '@/components/report'
import { count, date, HEALTH_LABELS, money, percent } from '@/lib/format'
import { fetchTodaysMeetings } from '@/lib/ingest/next-steps'
import { fetchMyFocus } from '@/lib/reports/my-focus'
import { createClient } from '@/lib/supabase/server'

/**
 * A mirror of Ryan's `0-Dashboard` tab: six tiles, the pipeline by stage, and
 * the client-health summary. Deliberately the same six numbers in the same
 * order, because the team has read that sheet for years and a CRM that shows
 * them something different on day one is a CRM they argue with.
 *
 * Two departures, both honest ones:
 *
 *  - "Monthly ARR" on the sheet means MRR, so it is labelled MRR here.
 *  - Every tile whose total is understated says so underneath. Most of the
 *    portfolio has no contract figure and almost no open deal has a price;
 *    reporting a small number quietly would be the single fastest way to lose
 *    this team's trust in the thing.
 */
export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const [me, focus, today, review] = await Promise.all([
    user
      ? supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user ? fetchMyFocus(supabase, user.id) : Promise.resolve(null),
    user ? fetchTodaysMeetings(supabase, user.id) : Promise.resolve(null),
    supabase
      .from('ingest_suggestions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open'),
  ])
  const firstName = me.data?.full_name?.split(' ')[0] ?? null
  const waiting = review.count ?? 0

  const [
    { data: coverage, error: coverageError },
    { data: pipeline, error: pipelineError },
    { data: winRate, error: winRateError },
    { data: funnel, error: funnelError },
    { data: health, error: healthError },
    { count: contacts },
  ] = await Promise.all([
    supabase.from('v_mrr_coverage').select('*').single(),
    supabase.from('v_pipeline_coverage').select('*').single(),
    supabase.from('v_opportunity_win_rate').select('*').single(),
    supabase.from('v_pipeline_funnel').select('*').order('stage_sort_order'),
    supabase.from('v_building_health_mrr').select('*'),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).is('deleted_at', null),
  ])

  const error = coverageError ?? pipelineError ?? winRateError ?? funnelError ?? healthError

  const buildings = Number(coverage?.buildings_total ?? 0)
  const priced = Number(coverage?.buildings_with_value ?? 0)
  const mrr = Number(coverage?.mrr ?? 0)

  const openDeals = Number(pipeline?.open_deals ?? 0)
  const openPriced = Number(pipeline?.open_deals_priced ?? 0)
  const openAnnual = Number(pipeline?.open_annual ?? 0)

  const closed = Number(winRate?.closed ?? 0)
  const undated = Number(winRate?.closed_without_date ?? 0)

  const stages = funnel ?? []
  const maxStageCount = Math.max(...stages.map((s) => Number(s.deal_count ?? 0)), 1)

  // Health rows arrive unordered and the null row has to come last — an
  // unscored building is a real state, not a missing one, and it currently
  // holds real revenue.
  const healthOrder = ['healthy', 'needs_attention', 'at_risk'] as const
  const healthRows = [
    ...healthOrder
      .map((key) => (health ?? []).find((r) => r.health_score === key))
      .filter((r) => r !== undefined),
    ...(health ?? []).filter((r) => r.health_score === null),
  ]
  const maxHealthCount = Math.max(...healthRows.map((r) => Number(r.building_count ?? 0)), 1)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="The same six numbers as the spreadsheet, and what each one is still missing."
      />

      {error && (
        <p className="text-destructive text-sm">Could not load the dashboard: {error.message}</p>
      )}

      {/*
        Today. This is the half of Ryan's old spreadsheet dashboard that rows
        18–25 promised and never delivered — "Meetings Today" and "Client
        Matches", which were never two things: the second is how many of the
        first belong to a client we know.

        It renders only when there is something to say. Four of the five people
        have never signed in, and a permanently empty strip at the top of the
        first screen they ever see is worse than no strip.
      */}
      {((today && today.meetings.length > 0) || waiting > 0) && (
        <div className="border-border mb-8 rounded-[3px] border p-3">
          {today && today.meetings.length > 0 && (
            <>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">Today</h2>
                <span className="text-muted-foreground text-xs">
                  {today.matched} of {today.meetings.length} with a client we know
                </span>
              </div>
              <div className="border-border border-t">
                {today.meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="border-border flex items-center justify-between gap-3 border-b px-1 py-1.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <span className="truncate text-sm font-medium">{meeting.title}</span>
                      {(meeting.accountName ?? meeting.contactName) && (
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          {meeting.accountId ? (
                            <Link href={`/accounts/${meeting.accountId}`} className="underline">
                              {meeting.accountName}
                            </Link>
                          ) : (
                            meeting.contactName
                          )}
                        </p>
                      )}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {meeting.allDay || !meeting.dueAt
                        ? 'all day'
                        : new Date(meeting.dueAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {waiting > 0 && (
            <p
              className={
                today && today.meetings.length > 0
                  ? 'text-muted-foreground mt-2.5 text-sm'
                  : 'text-muted-foreground text-sm'
              }
            >
              The nightly job left {waiting} {waiting === 1 ? 'thing' : 'things'} it would not act
              on by itself.{' '}
              <Link href="/review" className="underline">
                Have a look
              </Link>{' '}
              — or don&apos;t; they expire on their own.
            </p>
          )}
        </div>
      )}

      {/*
        The personal half. Everything below this is the company's numbers,
        shared by all five; this part is only yours, derived from what you own.
        Nothing here is typed — five people who have never used a CRM will not
        maintain a to-do list inside one.
      */}
      {focus && (
        <div className="mb-10 grid gap-8 sm:grid-cols-2">
          <div>
            <SectionTitle
              aside={
                focus.deals.length > 0 ? (
                  <span className="text-muted-foreground text-xs">Closest to won first</span>
                ) : undefined
              }
            >
              {firstName ? `${firstName}'s top focus` : 'Your top focus'}
            </SectionTitle>
            {focus.deals.length === 0 ? (
              <EmptyState
                title={
                  focus.dealsOwned === 0
                    ? 'No deals are assigned to you.'
                    : 'None of your deals are still open.'
                }
              >
                {focus.dealsOwned === 0 && (
                  <>
                    Set an owner on a{' '}
                    <Link href="/opportunities" className="underline">
                      deal
                    </Link>{' '}
                    and it appears here.
                  </>
                )}
              </EmptyState>
            ) : (
              <div className="border-border border-t">
                {focus.deals.slice(0, 5).map((d) => (
                  <Link
                    key={d.id}
                    href={`/opportunities/${d.id}`}
                    className="row-hover border-border flex items-center justify-between gap-3 border-b px-2 py-2"
                  >
                    <div className="min-w-0">
                      <span className="truncate text-sm font-medium">{d.name}</span>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {d.stage} · {d.annual_value ? money(d.annual_value) : 'no value'}
                      </p>
                    </div>
                    <span
                      className={
                        d.days_until_close !== null && d.days_until_close < 0
                          ? 'text-destructive shrink-0 text-xs'
                          : 'text-muted-foreground shrink-0 text-xs'
                      }
                    >
                      {d.days_until_close === null
                        ? 'no date'
                        : d.days_until_close < 0
                          ? `${Math.abs(d.days_until_close)}d late`
                          : `${d.days_until_close}d`}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {focus.deals.length > 0 && (
              <p className="text-muted-foreground/80 mt-2 text-xs">
                {focus.deals.length > 5 && (
                  <>
                    {focus.deals.length - 5} more of yours on the{' '}
                    <Link href="/opportunities" className="underline">
                      board
                    </Link>
                    .{' '}
                  </>
                )}
                {focus.overdue.length > 0 && (
                  <>
                    {focus.overdue.length} of {focus.deals.length} have a close date already in the
                    past — worth updating.
                  </>
                )}
              </p>
            )}
          </div>

          <div>
            <SectionTitle>Next follow-up</SectionTitle>
            {focus.followUps.length === 0 ? (
              <EmptyState title="No accounts are assigned to you.">
                Set an owner on an{' '}
                <Link href="/accounts" className="underline">
                  account
                </Link>{' '}
                and it appears here.
              </EmptyState>
            ) : (
              <div className="border-border border-t">
                {focus.followUps.slice(0, 5).map((a) => (
                  <Link
                    key={a.account_id}
                    href={`/accounts/${a.account_id}`}
                    className="row-hover border-border flex items-center justify-between gap-3 border-b px-2 py-2"
                  >
                    <div className="min-w-0">
                      <span className="truncate text-sm font-medium">{a.account_name}</span>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {a.last_activity ? `Last touched ${date(a.last_activity)}` : 'Never touched'}
                        {a.monthly_value > 0 && ` · ${money(a.monthly_value)}/mo`}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {a.days_quiet === null ? 'never' : `${a.days_quiet}d`}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {focus.followUps.length > 5 && (
              <p className="text-muted-foreground/80 mt-2 text-xs">
                {focus.followUps.length - 5} more of yours. Quietest first.
              </p>
            )}
          </div>
        </div>
      )}

      <SectionTitle>Everyone&apos;s numbers</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Active clients"
          value={count(buildings)}
          note={
            <Link href="/buildings" className="underline">
              buildings under {count(coverage?.accounts_total)} accounts
            </Link>
          }
        />
        <Stat
          label="Pipeline deals"
          value={count(openDeals)}
          note={
            <Link href="/opportunities" className="underline">
              open, across every stage
            </Link>
          }
        />
        <Stat
          label="Monthly recurring revenue"
          value={money(mrr)}
          note={
            buildings === 0
              ? 'No buildings yet'
              : priced < buildings
                ? `Only ${priced} of ${buildings} buildings have a contract figure — this is understated`
                : `All ${buildings} buildings priced`
          }
        />
        <Stat
          label="Pipeline value"
          value={money(openAnnual)}
          note={
            openDeals === 0
              ? 'No open deals'
              : openPriced < openDeals
                ? `Only ${openPriced} of ${openDeals} open deals carry a price — this is understated`
                : 'Annual value of every open deal'
          }
        />
        <Stat
          label="Contacts"
          value={count(contacts ?? 0)}
          note={
            <Link href="/contacts" className="underline">
              across every account
            </Link>
          }
        />
        <Stat
          label="Win rate"
          value={percent(winRate?.win_rate)}
          note={
            closed === 0
              ? 'No closed deals yet'
              : `${winRate?.won} won, ${winRate?.lost} lost${undated > 0 ? ` · ${undated} have no close date` : ''}`
          }
        />
      </div>

      <SectionTitle
        aside={
          <Link href="/reports/pipeline" className="text-muted-foreground text-xs underline">
            Pipeline report
          </Link>
        }
      >
        Pipeline by stage
      </SectionTitle>
      {stages.length === 0 ? (
        <EmptyState title="No stages configured." />
      ) : (
        <div className="border-border border-t">
          {stages.map((s) => (
            <div key={s.stage_id} className="border-border border-b px-2 py-2.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium">
                  {s.stage_name}
                  <span className="text-muted-foreground ml-2 font-normal">
                    {percent(s.probability)}
                  </span>
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
                  max={maxStageCount}
                  tone={s.is_won ? 'gold' : s.is_lost ? 'muted' : 'navy'}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionTitle
        aside={
          <Link href="/reports/health" className="text-muted-foreground text-xs underline">
            Health report
          </Link>
        }
      >
        Client health
      </SectionTitle>
      {healthRows.length === 0 ? (
        <EmptyState title="No buildings yet." />
      ) : (
        <div className="border-border border-t">
          {healthRows.map((r) => (
            <div key={r.health_score ?? 'unset'} className="border-border border-b px-2 py-2.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <HealthDot score={r.health_score} />
                  {r.health_score
                    ? HEALTH_LABELS[r.health_score as keyof typeof HEALTH_LABELS]
                    : 'Not scored'}
                </span>
                <span className="text-muted-foreground shrink-0 text-sm">
                  {r.building_count} {Number(r.building_count) === 1 ? 'building' : 'buildings'} ·{' '}
                  {money(r.mrr)}
                </span>
              </div>
              <div className="mt-1.5">
                <Bar
                  value={Number(r.building_count ?? 0)}
                  max={maxHealthCount}
                  tone={r.health_score === 'at_risk' ? 'muted' : 'navy'}
                />
              </div>
              {Number(r.buildings_with_value) < Number(r.building_count) && (
                <p className="text-muted-foreground/80 mt-1 text-xs">
                  {r.buildings_with_value} of {r.building_count} priced
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
