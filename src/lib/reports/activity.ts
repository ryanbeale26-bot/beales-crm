import type { Column } from '@/lib/csv'
import { date } from '@/lib/format'
import type { Supabase } from '@/lib/reports'

export type AccountActivity = {
  account_id: string
  account_name: string
  monthly_value: number
  total: number
  last_90: number
  last_activity: string | null
  days_quiet: number | null
}

/**
 * Which accounts have gone quiet.
 *
 * This is the one report where the data is genuinely rich — 667 activities
 * against 22 accounts — and it is the one that most directly serves the app's
 * first job: keep people logging. An account nobody has touched in six months
 * is a question worth someone's morning.
 */
export async function fetchActivityCoverage(supabase: Supabase) {
  const [
    { data: accounts, error: accountError },
    { data: activities, error: activityError },
    { data: values },
    { count: loggedTotal },
  ] = await Promise.all([
    supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
    supabase
      .from('activities')
      .select('account_id, occurred_at')
      .not('account_id', 'is', null)
      .order('occurred_at', { ascending: false })
      // The imported log is 667 rows and PostgREST caps a select at 1,000 by
      // default. Raising it explicitly so this page does not silently start
      // reporting a smaller number the week the log passes that mark.
      .limit(20000),
    supabase.from('v_building_current_value').select('account_id, monthly_value'),
    supabase.from('activities').select('*', { count: 'exact', head: true }),
  ])

  const now = Date.now()
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000

  const mrr = new Map<string, number>()
  for (const v of values ?? []) {
    if (!v.account_id || v.monthly_value === null) continue
    mrr.set(v.account_id, (mrr.get(v.account_id) ?? 0) + Number(v.monthly_value))
  }

  // Activities arrive newest-first, so the first one seen for an account is
  // its most recent. One pass, no per-account query.
  const stats = new Map<string, { total: number; recent: number; last: string }>()
  for (const a of activities ?? []) {
    if (!a.account_id) continue
    const row = stats.get(a.account_id) ?? { total: 0, recent: 0, last: a.occurred_at }
    row.total += 1
    if (new Date(a.occurred_at).getTime() >= ninetyDaysAgo) row.recent += 1
    stats.set(a.account_id, row)
  }

  const rows: AccountActivity[] = (accounts ?? []).map((a) => {
    const s = stats.get(a.id)
    const last = s?.last ?? null
    return {
      account_id: a.id,
      account_name: a.name,
      monthly_value: mrr.get(a.id) ?? 0,
      total: s?.total ?? 0,
      last_90: s?.recent ?? 0,
      last_activity: last,
      days_quiet: last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null,
    }
  })

  // Quietest first, and an account with no activity at all is the quietest of
  // the lot rather than being sorted to the bottom as a null.
  rows.sort((a, b) => (b.days_quiet ?? Number.MAX_SAFE_INTEGER) - (a.days_quiet ?? Number.MAX_SAFE_INTEGER))

  const attributed = (activities ?? []).length

  return {
    rows,
    silent: rows.filter((r) => r.total === 0),
    quiet: rows.filter((r) => r.total > 0 && r.last_90 === 0),
    active: rows.filter((r) => r.last_90 > 0),
    attributed,
    // Most of the imported log carries no account, building, deal or contact,
    // so it cannot be attributed to anyone. Reporting only the attributed
    // count would understate the team's actual logging by more than half, and
    // this page exists to tell people the truth about their own coverage.
    totalLogged: loggedTotal ?? attributed,
    unattributed: Math.max((loggedTotal ?? attributed) - attributed, 0),
    error: accountError ?? activityError,
  }
}

export const activityColumns: Column<AccountActivity>[] = [
  { header: 'Account', value: (r) => r.account_name },
  { header: 'MRR', value: (r) => r.monthly_value },
  { header: 'Activities logged', value: (r) => r.total },
  { header: 'In the last 90 days', value: (r) => r.last_90 },
  { header: 'Last activity', value: (r) => (r.last_activity ? date(r.last_activity) : '') },
  { header: 'Days since', value: (r) => r.days_quiet },
]
