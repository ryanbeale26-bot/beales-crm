import Link from 'next/link'
import { notFound } from 'next/navigation'

import { linkContactToBuilding, unlinkContactFromBuilding } from '@/app/(app)/actions'
import { Select } from '@/components/form-field'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { date, fullName } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: contact, error } = await supabase
    .from('contacts')
    // The FK must be named: accounts.primary_contact_id points back at contacts,
    // so "accounts" alone is ambiguous and PostgREST refuses to guess.
    .select('*, account:accounts!contacts_account_id_fkey(id, name)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  // A failed query is not the same as a missing record. Showing 404 for both
  // hides real bugs, so surface the error instead.
  if (error) throw new Error(`Could not load this contact: ${error.message}`)
  if (!contact) notFound()

  const [{ data: links }, { data: allBuildings }] = await Promise.all([
    supabase
      .from('contact_buildings')
      .select('building:buildings(id, name, city, state, account:accounts(name))')
      .eq('contact_id', id),
    supabase
      .from('buildings')
      .select('id, name, city, account:accounts(name)')
      .is('deleted_at', null)
      .order('name'),
  ])

  const linkedIds = new Set((links ?? []).map((l) => l.building?.id).filter(Boolean))
  const linkable = (allBuildings ?? []).filter((b) => !linkedIds.has(b.id))

  return (
    <div>
      <PageHeader
        title={fullName(contact)}
        backHref="/contacts"
        backLabel="Contacts"
        subtitle={[contact.title, contact.account?.name].filter(Boolean).join(' · ') || undefined}
        action={
          <Button variant="outline" asChild>
            <Link href={`/contacts/${id}/edit`}>Edit</Link>
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium">Details</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Email">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="underline">
                  {contact.email}
                </a>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Phone">
              {contact.phone ? (
                <a href={`tel:${contact.phone}`} className="underline">
                  {contact.phone}
                </a>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Mobile">
              {contact.mobile ? (
                <a href={`tel:${contact.mobile}`} className="underline">
                  {contact.mobile}
                </a>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Account">
              {contact.account ? (
                <Link href={`/accounts/${contact.account.id}`} className="underline">
                  {contact.account.name}
                </Link>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Role">{contact.contact_role ?? '—'}</Row>
            <Row label="Added">{date(contact.created_at)}</Row>
          </dl>

          {contact.notes && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-medium">Notes</h2>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{contact.notes}</p>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-sm font-medium">Buildings</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            A portfolio manager can cover several sites.
          </p>

          {links && links.length > 0 ? (
            <ul className="divide-border mb-4 overflow-hidden rounded-xl border text-sm">
              {links.map(
                ({ building }) =>
                  building && (
                    <li
                      key={building.id}
                      className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0"
                    >
                      <div>
                        <Link href={`/buildings/${building.id}`} className="font-medium hover:underline">
                          {building.name}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          {[building.account?.name, building.city, building.state]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <form action={unlinkContactFromBuilding}>
                        <input type="hidden" name="contact_id" value={id} />
                        <input type="hidden" name="building_id" value={building.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Remove
                        </Button>
                      </form>
                    </li>
                  ),
              )}
            </ul>
          ) : (
            <p className="text-muted-foreground mb-4 text-sm">Not linked to any building yet.</p>
          )}

          {linkable.length > 0 && (
            <form action={linkContactToBuilding} className="flex gap-2">
              <input type="hidden" name="contact_id" value={id} />
              <Select name="building_id" aria-label="Building to link" className="max-w-xs" required>
                <option value="">Link to a building…</option>
                {linkable.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.account?.name ? ` — ${b.account.name}` : ''}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Link
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="text-muted-foreground w-24 shrink-0">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
