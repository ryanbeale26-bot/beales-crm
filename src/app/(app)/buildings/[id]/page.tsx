import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BUILDING_STATUS_LABELS,
  ENTITY_LABELS,
  HEALTH_LABELS,
  date,
  fullName,
  money,
  squareFeet,
} from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: building, error } = await supabase
    .from('buildings')
    .select(
      `*,
       account:accounts(id, name),
       property_type:property_types(name),
       owner:profiles!buildings_owner_id_fkey(full_name, is_active),
       secondary_owner:profiles!buildings_secondary_owner_id_fkey(full_name)`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  // A failed query is not a missing record — don't hide bugs behind a 404.
  if (error) throw new Error(`Could not load this building: ${error.message}`)
  if (!building) notFound()

  const [{ data: periods }, { data: links }] = await Promise.all([
    supabase
      .from('building_contract_periods')
      .select('id, effective_date, end_date, monthly_value, annual_value, change_reason')
      .eq('building_id', id)
      .order('effective_date', { ascending: false }),
    supabase
      .from('contact_buildings')
      .select('contact:contacts(id, first_name, last_name, title, email, phone)')
      .eq('building_id', id),
  ])

  const current = periods?.find((p) => p.end_date === null)

  return (
    <div>
      <PageHeader
        title={building.name}
        backHref={`/accounts/${building.account?.id}?tab=Buildings`}
        backLabel={building.account?.name ?? 'Account'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={building.status === 'active' ? 'default' : 'secondary'}>
              {BUILDING_STATUS_LABELS[building.status]}
            </Badge>
            {building.health_score && (
              <Badge variant={building.health_score === 'at_risk' ? 'destructive' : 'outline'}>
                {HEALTH_LABELS[building.health_score]}
              </Badge>
            )}
            <span>
              {current ? `${money(current.monthly_value)}/mo · ${money(current.annual_value)}/yr` : 'No contract value'}
              {building.square_footage ? ` · ${squareFeet(building.square_footage)}` : ''}
            </span>
          </span>
        }
        action={
          <Button variant="outline" asChild>
            <Link href={`/buildings/${id}/edit`}>Edit</Link>
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium">Details</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Address">
              {[building.address_line1, building.city, building.state, building.postal_code]
                .filter(Boolean)
                .join(', ') || '—'}
            </Row>
            <Row label="Property type">{building.property_type?.name ?? '—'}</Row>
            <Row label="Entity">{ENTITY_LABELS[building.entity]}</Row>
            <Row label="Contract">
              {date(building.contract_start_date)} → {date(building.contract_end_date)}
            </Row>
            <Row label="Service">
              {[building.service_days && 'Days', building.service_nights && 'Nights']
                .filter(Boolean)
                .join(' & ') || '—'}
            </Row>
            <Row label="Owner">
              {building.owner?.full_name ?? '—'}
              {building.owner && !building.owner.is_active && (
                <span className="text-muted-foreground"> (no longer here)</span>
              )}
            </Row>
            <Row label="Second owner">{building.secondary_owner?.full_name ?? '—'}</Row>
            {building.status === 'lost' && <Row label="Lost on">{date(building.lost_date)}</Row>}
          </dl>

          {building.scope_notes && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-medium">Scope of work</h2>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {building.scope_notes}
              </p>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">Contract value history</h2>
          {periods && periods.length > 0 ? (
            <ul className="divide-border overflow-hidden rounded-xl border text-sm">
              {periods.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0">
                  <div>
                    <div className="font-medium">{money(p.monthly_value)}/mo</div>
                    <div className="text-muted-foreground text-xs">
                      {date(p.effective_date)} → {p.end_date ? date(p.end_date) : 'now'} ·{' '}
                      {p.change_reason.replace(/_/g, ' ')}
                    </div>
                  </div>
                  {p.end_date === null && <Badge variant="outline">Current</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No contract value recorded.">
              <Link href={`/buildings/${id}/edit`} className="underline">
                Add one
              </Link>{' '}
              — the revenue reports read this history.
            </EmptyState>
          )}

          <h2 className="mt-6 mb-3 text-sm font-medium">Contacts at this building</h2>
          {links && links.length > 0 ? (
            <ul className="divide-border overflow-hidden rounded-xl border text-sm">
              {links.map(
                ({ contact }) =>
                  contact && (
                    <li key={contact.id} className="border-b p-3 last:border-b-0">
                      <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline">
                        {fullName(contact)}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {[contact.title, contact.email, contact.phone].filter(Boolean).join(' · ')}
                      </div>
                    </li>
                  ),
              )}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              None linked yet. Link them from a contact&rsquo;s page.
            </p>
          )}
        </section>
      </div>
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
