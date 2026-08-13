import Link from 'next/link'

import { EmptyState, PageHeader, Row, RowList } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fullName } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('contacts')
    // Name the FK: accounts.primary_contact_id also joins these two tables.
    .select(
      'id, first_name, last_name, title, email, phone, contact_role, account:accounts!contacts_account_id_fkey(id, name)',
    )
    .is('deleted_at', null)
    .order('last_name')

  if (q) {
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,title.ilike.%${q}%`,
    )
  }

  const { data: contacts, error } = await query

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={
          contacts ? `${contacts.length} ${contacts.length === 1 ? 'person' : 'people'}` : undefined
        }
        action={
          <Button asChild>
            <Link href="/contacts/new">New contact</Link>
          </Button>
        }
      />

      <form className="mb-5 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name, email or title…"
          className="max-w-xs"
          aria-label="Search contacts"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q && (
          <Button variant="ghost" asChild>
            <Link href="/contacts">Clear</Link>
          </Button>
        )}
      </form>

      {error && <p className="text-destructive text-sm">Could not load contacts: {error.message}</p>}

      {contacts && contacts.length === 0 ? (
        <EmptyState title={q ? 'Nobody matches that.' : 'No contacts yet.'}>
          {q ? (
            <Link href="/contacts" className="underline">
              Clear the search
            </Link>
          ) : (
            <Link href="/contacts/new" className="underline">
              Add the first one
            </Link>
          )}
        </EmptyState>
      ) : (
        <RowList>
          {contacts?.map((c) => (
            <Row
              key={c.id}
              href={`/contacts/${c.id}`}
              title={fullName(c)}
              meta={[c.title, c.account?.name, c.contact_role].filter(Boolean).join(' · ')}
              right={<span className="text-muted-foreground">{c.email ?? c.phone ?? ''}</span>}
            />
          ))}
        </RowList>
      )}
    </div>
  )
}
