import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ActivityTimeline } from '@/components/activity-timeline'

import {
  EmptyState,
  PageHeader,
  Property,
  Row,
  RowList,
} from '@/components/page-header'
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

  const [{ data: buildings }, { data: values }, { data: contacts }, { data: deals }] = await Promise.all([
    supabase
      .from('buildings')
      .select('id, name, city, state, status, entity, square_footage, health_score')
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
    supabase
      .from('opportunities')
      .select('id, name, monthly_value, expected_close_date, stage:pipeline_stages(name, is_won, is_lost)')
      .eq('account_id', id)
      .is('deleted_at', null)
      .order('monthly_value', { ascending: false, nullsFirst: false }),
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
        breadcrumbs={[{ label: 'Accounts', href: '/accounts' }, { label: account.name }]}
        subtitle={`${money(mrr)}/mo · ${money(mrr * 12)}/yr · ${buildings?.length ?? 0} ${
          buildings?.length === 1 ? 'building' : 'buildings'
        }${totalSf > 0 ? ` · ${squareFeet(totalSf)}` : ''}`}
        action={
          <>
            <Button variant="outline" asChild>
              <Link href={`/accounts/${id}/edit`}>Edit</Link>
            </Button>
            <Button asChild>
              <Link href={`/buildings/new?account=${id}`}>Add building</Link>
            </Button>
          </>
        }
      />

      <nav className="border-border mb-5 flex gap-4 overflow-x-auto border-b text-sm">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/accounts/${id}?tab=${t}`}
            className={cn(
              '-mb-px border-b-2 pb-2 whitespace-nowrap',
              t === tab
                ? 'border-foreground text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t}
            {t === 'Buildings' && buildings?.length ? (
              <span className="text-muted-foreground ml-1.5 font-normal">{buildings.length}</span>
            ) : null}
            {t === 'Contacts' && contacts?.length ? (
              <span className="text-muted-foreground ml-1.5 font-normal">{contacts.length}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === 'Overview' && (
        <div className="max-w-2xl">
          <dl>
            <Property label="Status">{ACCOUNT_STATUS_LABELS[account.status]}</Property>
            <Property label="Type">{account.account_type ?? '—'}</Property>
            <Property label="Owner">
              {account.owner?.full_name ?? '—'}
              {account.owner && !account.owner.is_active && (
                <span className="text-muted-foreground"> (no longer here)</span>
              )}
            </Property>
            <Property label="Second owner">{account.secondary_owner?.full_name ?? '—'}</Property>
            <Property label="Head office">
              {[account.hq_address_line1, account.hq_city, account.hq_state, account.hq_postal_code]
                .filter(Boolean)
                .join(', ') || '—'}
            </Property>
            <Property label="Added">{date(account.created_at)}</Property>
          </dl>

          <div className="border-border mt-6 border-t pt-4">
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {account.notes || 'No notes yet.'}
            </p>
          </div>

          {withoutValue > 0 && (
            <p className="bg-muted text-muted-foreground mt-6 rounded-[3px] p-3 text-sm">
              {withoutValue} of {buildings?.length} buildings have no monthly value, so this
              account&rsquo;s revenue is understated.
            </p>
          )}
        </div>
      )}

      {tab === 'Buildings' &&
        (buildings && buildings.length > 0 ? (
          <RowList>
            {buildings.map((b) => (
              <Row
                key={b.id}
                href={`/buildings/${b.id}`}
                title={b.name}
                meta={[
                  [b.city, b.state].filter(Boolean).join(', ') || null,
                  ENTITY_LABELS[b.entity],
                  b.square_footage ? squareFeet(b.square_footage) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badges={
                  <>
                    {b.status !== 'active' && (
                      <span className="text-muted-foreground bg-muted rounded-[3px] px-1.5 py-0.5 text-xs">
                        {BUILDING_STATUS_LABELS[b.status]}
                      </span>
                    )}
                    {b.health_score && (
                      <span
                        className={
                          b.health_score === 'at_risk'
                            ? 'text-destructive bg-destructive/10 rounded-[3px] px-1.5 py-0.5 text-xs'
                            : 'text-muted-foreground bg-muted rounded-[3px] px-1.5 py-0.5 text-xs'
                        }
                      >
                        {HEALTH_LABELS[b.health_score]}
                      </span>
                    )}
                  </>
                }
                right={
                  valueByBuilding.get(b.id) ? (
                    `${money(valueByBuilding.get(b.id))}/mo`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
            ))}
          </RowList>
        ) : (
          <EmptyState title="No buildings on this account yet.">
            <Link href={`/buildings/new?account=${id}`} className="underline">
              Add the first one
            </Link>
          </EmptyState>
        ))}

      {tab === 'Contacts' &&
        (contacts && contacts.length > 0 ? (
          <RowList>
            {contacts.map((c) => (
              <Row
                key={c.id}
                href={`/contacts/${c.id}`}
                title={fullName(c)}
                meta={[c.title, c.contact_role].filter(Boolean).join(' · ')}
                right={<span className="text-muted-foreground">{c.email ?? c.phone ?? ''}</span>}
              />
            ))}
          </RowList>
        ) : (
          <EmptyState title="No contacts on this account yet.">
            <Link href={`/contacts/new?account=${id}`} className="underline">
              Add a contact
            </Link>
          </EmptyState>
        ))}

      {tab === 'Activity' && <ActivityTimeline scope={{ accountId: id }} />}

      {tab === 'Opportunities' &&
        (deals && deals.length > 0 ? (
          <RowList>
            {deals.map((d) => (
              <Row
                key={d.id}
                href={`/opportunities/${d.id}`}
                title={d.name}
                meta={d.expected_close_date ? `Expected ${date(d.expected_close_date)}` : undefined}
                badges={
                  <span
                    className={cn(
                      'rounded-[3px] px-1.5 py-0.5 text-xs',
                      d.stage?.is_lost
                        ? 'text-destructive bg-destructive/10'
                        : d.stage?.is_won
                          ? 'bg-brand-gold/30 text-foreground'
                          : 'text-muted-foreground bg-muted',
                    )}
                  >
                    {d.stage?.name}
                  </span>
                }
                right={
                  d.monthly_value ? (
                    `${money(d.monthly_value)}/mo`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )
                }
              />
            ))}
          </RowList>
        ) : (
          <EmptyState title="No deals on this account yet.">
            <Link href={`/opportunities/new?account=${id}`} className="underline">
              Add one
            </Link>
          </EmptyState>
        ))}
    </div>
  )
}
