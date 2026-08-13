import Link from 'next/link'

import { EmptyState } from '@/components/page-header'
import { createClient } from '@/lib/supabase/server'

type Scope =
  | { accountId: string }
  | { buildingId: string }
  | { contactId: string }

/** "3 days ago" reads faster than a date when you are scanning a timeline. */
function ago(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export async function ActivityTimeline({ scope, limit = 30 }: { scope: Scope; limit?: number }) {
  const supabase = await createClient()

  let query = supabase
    .from('activities')
    .select(
      `id, subject, body, occurred_at, source,
       type:activity_types(name),
       logged_by_profile:profiles(full_name),
       building:buildings(id, name)`,
    )
    .order('occurred_at', { ascending: false })
    .limit(limit)

  // An account timeline includes everything logged against its buildings,
  // because the trigger stamps account_id on the way in.
  if ('accountId' in scope) query = query.eq('account_id', scope.accountId)
  else if ('buildingId' in scope) query = query.eq('building_id', scope.buildingId)
  else query = query.eq('contact_id', scope.contactId)

  const { data: activities, error } = await query

  if (error) {
    return <p className="text-destructive text-sm">Could not load the timeline: {error.message}</p>
  }

  if (!activities || activities.length === 0) {
    return (
      <EmptyState title="Nothing logged here yet.">
        Use the Log button in the corner — it takes a few seconds.
      </EmptyState>
    )
  }

  return (
    <ol className="border-border border-t">
      {activities.map((a) => (
        <li key={a.id} className="border-border border-b px-2 py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="bg-muted rounded-[3px] px-1.5 py-0.5 text-xs">
              {a.type?.name ?? 'Note'}
            </span>
            <span className="font-medium">{a.subject}</span>
          </div>
          <div className="text-muted-foreground mt-0.5 text-xs">
            {ago(a.occurred_at)}
            {a.logged_by_profile?.full_name && ` · ${a.logged_by_profile.full_name}`}
            {/* On an account timeline, say which building it came from. */}
            {'accountId' in scope && a.building && (
              <>
                {' · '}
                <Link href={`/buildings/${a.building.id}`} className="hover:underline">
                  {a.building.name}
                </Link>
              </>
            )}
            {a.source !== 'manual' && ` · via ${a.source}`}
          </div>
          {a.body && (
            <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{a.body}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
