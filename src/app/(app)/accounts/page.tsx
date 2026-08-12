import Link from 'next/link'

import { PageHeader, EmptyState } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
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

  const { data: accounts, error } = await query

  // Buildings and current value, to roll up per account without N queries.
  const { data: values } = await supabase
    .from('v_building_current_value')
    .select('account_id, monthly_value')

  const rollup = new Map<string, { buildings: number; mrr: number }>()
  for (const row of values ?? []) {
    if (!row.account_id) continue
    const current = rollup.get(row.account_id) ?? { buildings: 0, mrr: 0 }
    current.buildings += 1
    current.mrr += Number(row.monthly_value ?? 0)
    rollup.set(row.account_id, current)
  }

  const totalMrr = [...rollup.values()].reduce((sum, r) => sum + r.mrr, 0)

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={
          accounts
            ? `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} · ${money(totalMrr)} per month`
            : undefined
        }
        action={
          <Button asChild>
            <Link href="/accounts/new">New account</Link>
          </Button>
        }
      />

      <form className="mb-5 flex flex-wrap gap-2">
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
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
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

      {error && (
        <p className="text-destructive text-sm">Could not load accounts: {error.message}</p>
      )}

      {accounts && accounts.length === 0 && (
        <EmptyState title={q || status ? 'Nothing matches that.' : 'No accounts yet.'}>
          {q || status ? (
            <Link href="/accounts" className="underline">
              Clear the filters
            </Link>
          ) : (
            <>
              Add your first customer, then put its buildings underneath it.{' '}
              <Link href="/accounts/new" className="underline">
                New account
              </Link>
            </>
          )}
        </EmptyState>
      )}

      {accounts && accounts.length > 0 && (
        <div className="divide-border overflow-hidden rounded-xl border">
          {accounts.map((account) => {
            const roll = rollup.get(account.id)
            return (
              <Link
                key={account.id}
                href={`/accounts/${account.id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b p-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{account.name}</span>
                    <Badge variant={account.status === 'active' ? 'default' : 'secondary'}>
                      {ACCOUNT_STATUS_LABELS[account.status]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {account.account_type ?? 'No type'}
                    {account.owner?.full_name && ` · ${account.owner.full_name}`}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">{money(roll?.mrr ?? 0)}/mo</div>
                  <div className="text-muted-foreground">
                    {roll?.buildings ?? 0} {roll?.buildings === 1 ? 'building' : 'buildings'}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
