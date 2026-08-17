import type { Column } from '@/lib/csv'
import { fullName } from '@/lib/format'
import type { Supabase } from '@/lib/gaps'

export type AccountGapRow = {
  id: string
  name: string
  primary_contact: string
  primary_contact_name: string
  owner: string
  secondary_owner: string
}

/**
 * Every live account. All 22 have no primary contact, which is why an account
 * page cannot yet tell you who to ring.
 *
 * The primary contact is exported as an email where the person has one and as
 * their contact id where they do not — 21 contacts have no email, and
 * contacts.email carries no unique constraint, so neither alone would round
 * trip. The importer accepts either.
 */
export async function fetchAccountGaps(supabase: Supabase) {
  const [{ data: accounts, error }, { data: contacts }, { data: profiles }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, primary_contact_id, owner_id, secondary_owner_id')
      .is('deleted_at', null),
    supabase.from('contacts').select('id, first_name, last_name, email').is('deleted_at', null),
    supabase.from('profiles').select('id, full_name'),
  ])

  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]))
  const ownerName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  const rows: AccountGapRow[] = (accounts ?? [])
    .map((a) => {
      const contact = a.primary_contact_id ? contactById.get(a.primary_contact_id) : undefined
      return {
        id: a.id,
        name: a.name,
        primary_contact: contact ? (contact.email || contact.id) : '',
        primary_contact_name: contact ? (fullName(contact) === '—' ? '' : fullName(contact)) : '',
        owner: a.owner_id ? (ownerName.get(a.owner_id) ?? '') : '',
        secondary_owner: a.secondary_owner_id ? (ownerName.get(a.secondary_owner_id) ?? '') : '',
      }
    })
    .sort((a, b) => emptiness(b) - emptiness(a) || a.name.localeCompare(b.name))

  return { rows, error }
}

function emptiness(r: AccountGapRow): number {
  return [r.primary_contact === '', r.owner === ''].filter(Boolean).length
}

export const accountGapColumns: Column<AccountGapRow>[] = [
  { header: 'Account ID', value: (r) => r.id },
  { header: 'Account', value: (r) => r.name },
  { header: 'Primary contact', value: (r) => r.primary_contact },
  { header: 'Owner', value: (r) => r.owner },
  { header: 'Secondary owner', value: (r) => r.secondary_owner },
]
