import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ACCOUNT_STATUS_LABELS,
  BUILDING_STATUS_LABELS,
  ENTITY_LABELS,
  HEALTH_LABELS,
  date,
  fullName,
  money,
  squareFeet,
} from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

const TABS = ['Overview', 'Buildings', 'Contacts', 'Activity', 'Opportunities'] as const
type Tab = (typeof TABS)[number]

export default async function AccountPage({
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

  const { data: account, error } = await supabase
    .from('accounts')
    .select(
      `*,
       owner:profiles!accounts_owner_id_fkey(full_name, is_active),
       secondary_owner:profiles!accounts_secondary_owner_id_fkey(full_name, is_active)`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  // A failed query is not a missing record — don't hide bugs behind a 404.
  if (error) throw new Error(`Could not load this account: ${error.message}`)
  if (!account) notFound()

  const [{ data: buildings }, { data: values }, { data: contacts }] = await Promise.all([
    supabase
      .from('buildings')
      .select('id, name, city, state, status, entity, square_footage, health_score, contract_start_date')
      .eq('account_id', id)
      .is('deleted_at', null)
      .order('name'),
    supabase.from('v_building_current_value').select('building_id, monthly_value').eq('account_id', id),
    supabase
      .from('contacts')
      .select('id, first_name, last_name, title, email, phone, contact_role')
      .eq('account_id', id)
      .is('deleted_at', null)
      .order('last_name'),
  ])

  const valueByBuilding = new Map(
    (values ?? []).map((v) => [v.building_id, Number(v.monthly_value ?? 0)]),
  )
  const mrr = [...valueByBuilding.values()].reduce((a, b) => a + b, 0)
  const totalSf = (buildings ?? []).reduce((sum, b) => sum + (b.square_footage ?? 0), 0)
  const withoutValue = (buildings ?? []).filter((b) => !valueByBuilding.get(b.id)).length

  return (
    <div>
      <PageHeader
        title={account.name}
        backHref="/accounts"
        backLabel="Accounts"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={account.status === 'active' ? 'default' : 'secondary'}>
              {ACCOUNT_STATUS_LABELS[account.status]}
            </Badge>
            <span>
              {money(mrr)}/mo · {money(mrr * 12)}/yr · {buildings?.length ?? 0} buildings
              {totalSf > 0 && ` · ${squareFeet(totalSf)}`}
            </span>
          </span>
        }
        action={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/accounts/${id}/edit`}>Edit</Link>
            </Button>
            <Button asChild>
              <Link href={`/buildings/new?account=${id}`}>Add building</Link>
            </Button>
          </div>
        }
      />

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/accounts/${id}?tab=${t}`}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap',
              t === tab
                ? 'border-primary text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t}
            {t === 'Buildings' && buildings?.length ? ` (${buildings.length})` : ''}
            {t === 'Contacts' && contacts?.length ? ` (${contacts.length})` : ''}
          </Link>
        ))}
      </nav>

      {tab === 'Overview' && (
        <div className="grid gap-6 sm:grid-cols-2">
          <dl className="space-y-3 text-sm">
            <Row label="Type">{account.account_type ?? '—'}</Row>
            <Row label="Owner">
              {account.owner?.full_name ?? '—'}
              {account.owner && !account.owner.is_active && (
                <span className="text-muted-foreground"> (no longer here)</span>
              )}
            </Row>
            <Row label="Second owner">{account.secondary_owner?.full_name ?? '—'}</Row>
            <Row label="Head office">
              {[account.hq_address_line1, account.hq_city, account.hq_state, account.hq_postal_code]
                .filter(Boolean)
                .join(', ') || '—'}
            </Row>
            <Row label="Added">{date(account.created_at)}</Row>
          </dl>

          <div>
            <h2 className="mb-2 text-sm font-medium">Notes</h2>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {account.notes || 'None yet.'}
            </p>
            {withoutValue > 0 && (
              <p className="bg-muted mt-4 rounded-lg p-3 text-sm">
                {withoutValue} of {buildings?.length} buildings have no monthly value, so this
                account&rsquo;s revenue is understated.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'Buildings' &&
        (buildings && buildings.length > 0 ? (
          <div className="divide-border overflow-hidden rounded-xl border">
            {buildings.map((b) => (
              <Link
                key={b.id}
                href={`/buildings/${b.id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b p-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{b.name}</span>
                    <Badge variant={b.status === 'active' ? 'default' : 'secondary'}>
                      {BUILDING_STATUS_LABELS[b.status]}
                    </Badge>
                    {b.health_score && (
                      <Badge variant={b.health_score === 'at_risk' ? 'destructive' : 'outline'}>
                        {HEALTH_LABELS[b.health_score]}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {[b.city, b.state].filter(Boolean).join(', ') || 'No address'} ·{' '}
                    {ENTITY_LABELS[b.entity]}
                    {b.square_footage ? ` · ${squareFeet(b.square_footage)}` : ''}
                  </p>
                </div>
                <div className="text-right text-sm font-medium">
                  {valueByBuilding.get(b.id)
                    ? `${money(valueByBuilding.get(b.id))}/mo`
                    : <span className="text-muted-foreground font-normal">No value set</span>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No buildings on this account yet.">
            <Link href={`/buildings/new?account=${id}`} className="underline">
              Add the first one
            </Link>
          </EmptyState>
        ))}

      {tab === 'Contacts' &&
        (contacts && contacts.length > 0 ? (
          <div className="divide-border overflow-hidden rounded-xl border">
            {contacts.map((c) => (
              <Link
                key={c.id}
                href={`/contacts/${c.id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b p-4 last:border-b-0"
              >
                <div>
                  <div className="font-medium">{fullName(c)}</div>
                  <p className="text-muted-foreground text-sm">
                    {[c.title, c.contact_role].filter(Boolean).join(' · ') || 'No title'}
                  </p>
                </div>
                <div className="text-muted-foreground text-sm">{c.email ?? c.phone ?? ''}</div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No contacts on this account yet.">
            <Link href={`/contacts/new?account=${id}`} className="underline">
              Add a contact
            </Link>
          </EmptyState>
        ))}

      {tab === 'Activity' && (
        <EmptyState title="Activity logging arrives in Phase 2.">
          Calls, site visits and complaints will appear here, newest first — including anything
          logged against this account&rsquo;s buildings.
        </EmptyState>
      )}

      {tab === 'Opportunities' && (
        <EmptyState title="The pipeline arrives in Phase 3.">
          Deals for this account will show here, with the stage they&rsquo;re in.
        </EmptyState>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="text-muted-foreground w-32 shrink-0">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
