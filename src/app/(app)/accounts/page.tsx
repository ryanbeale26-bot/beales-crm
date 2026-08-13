import Link from 'next/link'

import { EmptyState, PageHeader, Row, RowList } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ACCOUNT_STATUS_LABELS, money } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q, status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('accounts')
    .select('id, name, account_type, status, owner:profiles!accounts_owner_id_fkey(full_name)')
    .is('deleted_at', null)
    .order('name')

  if (q) query = query.ilike('name', `%${q}%`)
  if (status) query = query.eq('status', status as 'prospect' | 'active' | 'former')

  const [{ data: accounts, error }, { data: values }] = await Promise.all([
    query,
    supabase.from('v_building_current_value').select('account_id, monthly_value'),
  ])

  const rollup = new Map<string, { buildings: number; mrr: number }>()
  for (const row of values ?? []) {
    if (!row.account_id) continue
    const current = rollup.get(row.account_id) ?? { buildings: 0, mrr: 0 }
    current.buildings += 1
    current.mrr += Number(row.monthly_value ?? 0)
    rollup.set(row.account_id, current)
  }

  const shown = accounts ?? []
  const totalMrr = shown.reduce((sum, a) => sum + (rollup.get(a.id)?.mrr ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={`${shown.length} ${shown.length === 1 ? 'account' : 'accounts'} · ${money(totalMrr)} per month`}
        action={
          <Button asChild>
            <Link href="/accounts/new">New</Link>
          </Button>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search accounts…"
          className="max-w-xs"
          aria-label="Search accounts"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          aria-label="Filter by status"
          className="bg-muted h-8 rounded-[3px] border-0 px-2 text-sm outline-none"
        >
          <option value="">All statuses</option>
          {Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(q || status) && (
          <Button variant="ghost" asChild>
            <Link href="/accounts">Clear</Link>
          </Button>
        )}
      </form>

      {error && <p className="text-destructive text-sm">Could not load accounts: {error.message}</p>}

      {shown.length === 0 ? (
        <EmptyState title={q || status ? 'Nothing matches that.' : 'No accounts yet.'}>
          {q || status ? (
            <Link href="/accounts" className="underline">
              Clear the filters
            </Link>
          ) : (
            <Link href="/accounts/new" className="underline">
              Add your first customer
            </Link>
          )}
        </EmptyState>
      ) : (
        <RowList>
          {shown.map((account) => {
            const roll = rollup.get(account.id)
            return (
              <Row
                key={account.id}
                href={`/accounts/${account.id}`}
                title={account.name}
                meta={[account.account_type, account.owner?.full_name].filter(Boolean).join(' · ')}
                badges={
                  account.status !== 'active' ? (
                    <span className="text-muted-foreground bg-muted rounded-[3px] px-1.5 py-0.5 text-xs">
                      {ACCOUNT_STATUS_LABELS[account.status]}
                    </span>
                  ) : null
                }
                right={
                  <>
                    <div>{roll?.mrr ? `${money(roll.mrr)}/mo` : '—'}</div>
                    <div className="text-muted-foreground text-xs">
                      {roll?.buildings ?? 0} {roll?.buildings === 1 ? 'building' : 'buildings'}
                    </div>
                  </>
                }
              />
            )
          })}
        </RowList>
      )}
    </div>
  )
}
