import type { Supabase } from '@/lib/ingest'

/**
 * Today's meetings, and which of them belong to a client we know.
 *
 * Rows 18–25 of Ryan's old spreadsheet dashboard had "Meetings Today" and
 * "Client Matches" as two separate tiles, and they were never two things: the
 * second is just how many of the first resolved to an account. One query, one
 * pass — two queries would eventually disagree about the same morning.
 */

export type TodayMeeting = {
  id: string
  title: string
  dueAt: string | null
  allDay: boolean
  accountId: string | null
  accountName: string | null
  contactName: string | null
}

export type TodaysMeetings = {
  meetings: TodayMeeting[]
  /** How many resolved to an account. The old "Client Matches" tile. */
  matched: number
  error?: string
}

export async function fetchTodaysMeetings(
  supabase: Supabase,
  userId: string,
): Promise<TodaysMeetings> {
  // Local midnight to local midnight. Using UTC here would drop a 7pm meeting
  // off the evening it belongs to for five months of the year.
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const { data, error } = await supabase
    .from('next_steps')
    .select(
      `id, title, due_at, all_day, account_id,
       accounts ( name ),
       contacts ( first_name, last_name )`,
    )
    .eq('status', 'open')
    .eq('origin', 'calendar')
    .eq('owner_id', userId)
    .gte('due_at', start.toISOString())
    .lt('due_at', end.toISOString())
    .order('due_at')

  if (error) return { meetings: [], matched: 0, error: error.message }

  const meetings: TodayMeeting[] = (data ?? []).map((row) => {
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
  })

  return { meetings, matched: meetings.filter((m) => m.accountId !== null).length }
}

/** Everything still open and owned by this person, soonest first. Used by the
 *  dashboard when there is nothing on today. */
export async function fetchUpcomingNextSteps(
  supabase: Supabase,
  userId: string,
  limit = 5,
): Promise<TodayMeeting[]> {
  const { data } = await supabase
    .from('next_steps')
    .select(
      `id, title, due_at, all_day, account_id,
       accounts ( name ),
       contacts ( first_name, last_name )`,
    )
    .eq('status', 'open')
    .eq('owner_id', userId)
    .gte('due_at', new Date().toISOString())
    .order('due_at')
    .limit(limit)

  return (data ?? []).map((row) => {
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
  })
}
