import type { Supabase } from '@/lib/ingest'

/**
 * Today's meetings, and which of them belong to a client we know.
 *
 * Rows 18–25 of Ryan's old spreadsheet dashboard had "Meetings Today" and
 * "Client Matches" as two separate tiles, and they were never two things: the
 * second is just how many of the first resolved to an account. One query, one
 * pass — two queries would eventually disagree about the same morning.
 */

export type NextStep = {
  id: string
  title: string
  dueAt: string | null
  allDay: boolean
  accountId: string | null
  accountName: string | null
  contactName: string | null
}

export type TodaysMeetings = {
  meetings: NextStep[]
  /** How many resolved to an account. The old "Client Matches" tile. */
  matched: number
  error?: string
}

/** Everything three readers below need, and nothing more.
 *
 *  One literal rather than three copies: a PostgREST select must be a single
 *  string literal for supabase-js to infer the row type at all, so the only way
 *  to keep the three queries agreeing about their own shape is to name it once.
 */
const MEETING_COLUMNS = `id, title, due_at, all_day, account_id,
       accounts ( name ),
       contacts ( first_name, last_name )`

type RawRow = {
  id: string
  title: string
  due_at: string | null
  all_day: boolean
  account_id: string | null
  accounts: { name: string } | null
  contacts: { first_name: string; last_name: string } | null
}

function toNextStep(row: RawRow): NextStep {
  const account = row.accounts as { name: string } | null
  const contact = row.contacts as { first_name: string; last_name: string } | null
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    allDay: row.all_day,
    accountId: row.account_id,
    accountName: account?.name ?? null,
    contactName: contact ? `${contact.first_name} ${contact.last_name}`.trim() : null,
  }
}

/** Local midnight this morning. The one boundary all three readers share, so
 *  the overdue window and today's window abut with no gap and no overlap. */
function startOfToday(): Date {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start
}

export async function fetchTodaysMeetings(
  supabase: Supabase,
  userId: string,
): Promise<TodaysMeetings> {
  // Local midnight to local midnight. Using UTC here would drop a 7pm meeting
  // off the evening it belongs to for five months of the year.
  const start = startOfToday()
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const { data, error } = await supabase
    .from('next_steps')
    .select(MEETING_COLUMNS)
    .eq('status', 'open')
    .eq('origin', 'calendar')
    .eq('owner_id', userId)
    .gte('due_at', start.toISOString())
    .lt('due_at', end.toISOString())
    .order('due_at')

  if (error) return { meetings: [], matched: 0, error: error.message }

  const meetings = (data ?? []).map(toNextStep)

  return { meetings, matched: meetings.filter((m) => m.accountId !== null).length }
}

export type OverdueNextSteps = {
  meetings: NextStep[]
  /** How many there are in total, not how many came back. The strip caps what
   *  it renders and has to be able to say so. */
  total: number
  error?: string
}

/**
 * Still open, still yours, and the day it was due has been and gone.
 *
 * Until there was a way to close a next step this had no reason to exist, and
 * the absence was a real hole: `fetchTodaysMeetings` is a midnight-to-midnight
 * window and `fetchUpcomingNextSteps` starts at now, so a meeting nobody marked
 * done became invisible the following morning and stayed that way for ever.
 *
 * Deliberately NOT filtered to `origin = 'calendar'`. Today is about meetings;
 * this is about everything still open and owned by you, which is where 7d's
 * written commitments will land.
 *
 * Most recent first, which is the opposite of the other two. Oldest-first would
 * fill the cap with the five stalest rows and hide yesterday's meeting behind
 * "and N more" — and yesterday's is the one you can still answer.
 */
export async function fetchOverdueNextSteps(
  supabase: Supabase,
  userId: string,
  limit = 5,
): Promise<OverdueNextSteps> {
  const { data, error, count } = await supabase
    .from('next_steps')
    // The total comes off this same query rather than a second count(): two
    // queries counting one number is how the two eventually disagree.
    .select(MEETING_COLUMNS, { count: 'exact' })
    .eq('status', 'open')
    .eq('owner_id', userId)
    .lt('due_at', startOfToday().toISOString())
    .order('due_at', { ascending: false })
    .limit(limit)

  if (error) return { meetings: [], total: 0, error: error.message }

  return { meetings: (data ?? []).map(toNextStep), total: count ?? 0 }
}

export type UpcomingNextSteps = {
  meetings: NextStep[]
  error?: string
}

/** Everything still open and owned by this person, soonest first. Used by the
 *  dashboard when there is nothing on today.
 *
 *  It used to destructure a bare `const { data }` while both readers above
 *  returned an error, so a query that FAILED rendered as a section with nothing
 *  in it — indistinguishable from a quiet week, and silent for as long as
 *  nobody thought to check. */
export async function fetchUpcomingNextSteps(
  supabase: Supabase,
  userId: string,
  limit = 5,
): Promise<UpcomingNextSteps> {
  const { data, error } = await supabase
    .from('next_steps')
    .select(MEETING_COLUMNS)
    .eq('status', 'open')
    .eq('owner_id', userId)
    .gte('due_at', new Date().toISOString())
    .order('due_at')
    .limit(limit)

  if (error) return { meetings: [], error: error.message }

  return { meetings: (data ?? []).map(toNextStep) }
}
