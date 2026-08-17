import type { Column } from '@/lib/csv'
import { fullName } from '@/lib/format'
import type { Supabase } from '@/lib/gaps'

export type ContactGapRow = {
  id: string
  name: string
  account: string
  title: string
  email: string
}

/**
 * Every live contact. 63 of 97 belong to no account, which is why the activity
 * timeline on two thirds of the portfolio is thinner than it should be.
 *
 * Email is writable here, not context: 21 contacts have none, and an account's
 * primary contact is identified by email on the accounts sheet. Filling these
 * in is what makes that sheet usable.
 */
export async function fetchContactGaps(supabase: Supabase) {
  const [{ data: contacts, error }, { data: accounts }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, account_id, title, email')
      .is('deleted_at', null),
    supabase.from('accounts').select('id, name').is('deleted_at', null),
  ])

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))

  const rows: ContactGapRow[] = (contacts ?? [])
    .map((c) => ({
      id: c.id,
      name: fullName(c) === '—' ? '' : fullName(c),
      account: c.account_id ? (accountName.get(c.account_id) ?? '') : '',
      title: c.title ?? '',
      email: c.email ?? '',
    }))
    .sort((a, b) => emptiness(b) - emptiness(a) || a.name.localeCompare(b.name))

  return { rows, error }
}

function emptiness(r: ContactGapRow): number {
  return [r.account === '', r.title === '', r.email === ''].filter(Boolean).length
}

export const contactGapColumns: Column<ContactGapRow>[] = [
  { header: 'Contact ID', value: (r) => r.id },
  { header: 'Name', value: (r) => r.name },
  { header: 'Account', value: (r) => r.account },
  { header: 'Title', value: (r) => r.title },
  { header: 'Email', value: (r) => r.email },
]
