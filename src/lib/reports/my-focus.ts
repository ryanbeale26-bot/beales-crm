import type { Supabase } from '@/lib/reports'

/**
 * The personal half of the dashboard: what is mine, and what needs me next.
 *
 * Everything here is derived, never typed. The spreadsheet's Top Focus was a
 * line Ryan wrote himself each morning; asking five people to maintain their
 * own to-do list inside a CRM they have never used is the fastest way to have
 * a CRM nobody opens. If the data can rank it, the app should rank it.
 *
 * Three constraints shaped the ranking, all found in the real data:
 *
 *  - **No activity is linked to an opportunity** — 0 of 667. So "this deal has
 *    gone quiet" is not answerable at all.
 *  - **Expected close dates are stale.** Only 2 of 30 open deals have one in
 *    the future; 16 cluster in a month five months ago. Ranking by them would
 *    print "165 days late" against almost every row, which is noise, not a
 *    priority. They are shown, and the count of overdue ones is surfaced as a
 *    nudge to fix them — but they do not drive the order.
 *  - **Stage is populated on every deal and genuinely means something.** A
 *    deal at Verbal Commitment is closer to won than one at Targeting, so
 *    furthest-along-first is the one honest ranking available today.
 *
 *  - **Accounts do carry activity** (293 of 667 rows), so the follow-up list
 *    can genuinely rank by silence.
 */

export type FocusDeal = {
  id: string
  name: string
  stage: string
  stage_sort_order: number
  probability: number
  annual_value: number | null
  expected_close_date: string | null
  days_until_close: number | null
}

export type FollowUp = {
  account_id: string
  account_name: string
  monthly_value: number
  last_activity: string | null
  days_quiet: number | null
}

export async function fetchMyFocus(supabase: Supabase, userId: string) {
  const [{ data: deals, error: dealError }, { data: stages }, { data: accounts, error: accountError }] =
    await Promise.all([
      supabase
        .from('opportunities')
        .select('id, name, stage_id, annual_value, expected_close_date, owner_id, secondary_owner_id')
        .is('deleted_at', null)
        .or(`owner_id.eq.${userId},secondary_owner_id.eq.${userId}`),
      supabase
        .from('pipeline_stages')
        .select('id, name, probability, sort_order, is_won, is_lost'),
      supabase.from('accounts').select('id, name, owner_id, secondary_owner_id').is('deleted_at', null),
    ])

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]))
  const mine = (accounts ?? []).filter(
    (a) => a.owner_id === userId || a.secondary_owner_id === userId,
  )

  const [{ data: activities }, { data: values }] = await Promise.all([
    mine.length > 0
      ? supabase
          .from('activities')
          .select('account_id, occurred_at')
          .in(
            'account_id',
            mine.map((a) => a.id),
          )
          .order('occurred_at', { ascending: false })
          .limit(20000)
      : Promise.resolve({ data: [] }),
    supabase.from('v_building_current_value').select('account_id, monthly_value'),
  ])

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  const openDeals: FocusDeal[] = (deals ?? [])
    .filter((d) => {
      const s = stageById.get(d.stage_id)
      return s && !s.is_won && !s.is_lost
    })
    .map((d) => {
      const s = stageById.get(d.stage_id)
      const close = d.expected_close_date ? new Date(`${d.expected_close_date}T12:00:00`) : null
      return {
        id: d.id,
        name: String(d.name),
        stage: s?.name ?? '',
        stage_sort_order: Number(s?.sort_order ?? 0),
        probability: Number(s?.probability ?? 0),
        annual_value: d.annual_value === null ? null : Number(d.annual_value),
        expected_close_date: d.expected_close_date,
        days_until_close: close
          ? Math.round((close.getTime() - today.getTime()) / 86_400_000)
          : null,
      }
    })
    // Furthest along first — a deal at Verbal Commitment needs you more than
    // one at Targeting. Then soonest expected close, then largest value. A
    // deal with no date sorts after one that has a date: an unknown close date
    // is not an urgent one.
    .sort(
      (a, b) =>
        b.stage_sort_order - a.stage_sort_order ||
        (a.days_until_close ?? Number.MAX_SAFE_INTEGER) -
          (b.days_until_close ?? Number.MAX_SAFE_INTEGER) ||
        (b.annual_value ?? 0) - (a.annual_value ?? 0),
    )

  const mrr = new Map<string, number>()
  for (const v of values ?? []) {
    if (!v.account_id || v.monthly_value === null) continue
    mrr.set(v.account_id, (mrr.get(v.account_id) ?? 0) + Number(v.monthly_value))
  }

  const lastSeen = new Map<string, string>()
  for (const a of activities ?? []) {
    if (!a.account_id || lastSeen.has(a.account_id)) continue
    lastSeen.set(a.account_id, a.occurred_at)
  }

  const now = Date.now()
  const followUps: FollowUp[] = mine
    .map((a) => {
      const last = lastSeen.get(a.id) ?? null
      return {
        account_id: a.id,
        account_name: a.name,
        monthly_value: mrr.get(a.id) ?? 0,
        last_activity: last,
        days_quiet: last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null,
      }
    })
    .sort(
      (a, b) =>
        (b.days_quiet ?? Number.MAX_SAFE_INTEGER) - (a.days_quiet ?? Number.MAX_SAFE_INTEGER),
    )

  return {
    deals: openDeals,
    overdue: openDeals.filter((d) => d.days_until_close !== null && d.days_until_close < 0),
    followUps,
    accountsOwned: mine.length,
    dealsOwned: (deals ?? []).length,
    error: dealError ?? accountError,
  }
}
