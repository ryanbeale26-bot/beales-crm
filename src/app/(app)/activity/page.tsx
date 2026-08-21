import Link from 'next/link'

import { ActivityBody } from '@/components/activity-body'
import { EmptyState, PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/server'

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

const selectClass = 'bg-muted h-8 rounded-[3px] border-0 px-2 text-sm outline-none'

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string; type?: string; account?: string; from?: string; to?: string; q?: string }>
}) {
  const { who, type, account, from, to, q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('activities')
    .select(
      `id, subject, body, occurred_at, source,
       type:activity_types(id, name),
       logged_by_profile:profiles(id, full_name),
       account:accounts(id, name),
       building:buildings(id, name)`,
    )
    .order('occurred_at', { ascending: false })
    .limit(200)

  if (who) query = query.eq('logged_by', who)
  if (type) query = query.eq('activity_type_id', type)
  if (account) query = query.eq('account_id', account)
  if (from) query = query.gte('occurred_at', new Date(from).toISOString())
  if (to) {
    // Inclusive of the end day, which is what a person means by "to".
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    query = query.lte('occurred_at', end.toISOString())
  }
  if (q) query = query.or(`subject.ilike.%${q}%,body.ilike.%${q}%`)

  const [{ data: activities, error }, { data: people }, { data: types }, { data: accounts }] =
    await Promise.all([
      query,
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('activity_types').select('id, name').eq('is_active', true).order('sort_order'),
      supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
    ])

  const filtered = Boolean(who || type || account || from || to || q)

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle={
          activities
            ? `${activities.length}${activities.length === 200 ? '+' : ''} ${activities.length === 1 ? 'entry' : 'entries'}`
            : undefined
        }
      />

      <form className="mb-5 flex flex-wrap items-end gap-2">
        <Input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search what happened…"
          className="max-w-56"
          aria-label="Search activity"
        />
        <select name="who" defaultValue={who ?? ''} aria-label="Filter by person" className={selectClass}>
          <option value="">Anyone</option>
          {people?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type ?? ''} aria-label="Filter by type" className={selectClass}>
          <option value="">Any type</option>
          {types?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="account" defaultValue={account ?? ''} aria-label="Filter by account" className={selectClass}>
          <option value="">Any account</option>
          {accounts?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div>
          <label htmlFor="from" className="text-muted-foreground mb-1 block text-xs">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={from ?? ''} className="w-36" />
        </div>
        <div>
          <label htmlFor="to" className="text-muted-foreground mb-1 block text-xs">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={to ?? ''} className="w-36" />
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <Button variant="ghost" asChild>
            <Link href="/activity">Clear</Link>
          </Button>
        )}
      </form>

      {error && <p className="text-destructive text-sm">Could not load activity: {error.message}</p>}

      {activities && activities.length === 0 ? (
        <EmptyState title={filtered ? 'Nothing matches those filters.' : 'Nothing logged yet.'}>
          {filtered ? (
            <Link href="/activity" className="underline">
              Clear the filters
            </Link>
          ) : (
            'Use the Log button in the bottom corner.'
          )}
        </EmptyState>
      ) : (
        <ol className="border-border border-t">
          {activities?.map((a) => (
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
                {a.account && (
                  <>
                    {' · '}
                    <Link href={`/accounts/${a.account.id}`} className="hover:underline">
                      {a.account.name}
                    </Link>
                  </>
                )}
                {a.building && (
                  <>
                    {' · '}
                    <Link href={`/buildings/${a.building.id}`} className="hover:underline">
                      {a.building.name}
                    </Link>
                  </>
                )}
                {a.source !== 'manual' && ` · via ${a.source}`}
              </div>
              <ActivityBody body={a.body} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
