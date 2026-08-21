/**
 * Email addresses, and the two lists that decide what an address is allowed to
 * mean.
 *
 * Nothing here talks to the database. That is deliberate — every rule in this
 * file is testable by reading it, and the matcher above it stays about matching.
 */

/**
 * Domains that identify a person rather than a company.
 *
 * This list is duplicated in SQL as is_public_email_domain(), because
 * v_domain_candidates has to apply it too and a view cannot call TypeScript.
 * Two copies of a list is a real cost; the alternative was fetching the rules
 * over the wire to decide whether to fetch, which is worse. If one is edited,
 * edit both — there is a db:verify check that they agree.
 */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'yahoo.co.uk',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'msn.com',
  'comcast.net',
  'verizon.net',
  'sbcglobal.net',
  'att.net',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'zoho.com',
  // Beale's own domain. Internal mail is not client activity, and mapping it
  // would file every message between colleagues against a client account.
  'bealesllc.com',
])

/**
 * Local parts that are a function, not a person.
 *
 * Without this the CRM acquires contacts called "Do Not Reply", "Accounts
 * Payable" and "Front Desk" at every client — and 63 of 97 existing contacts
 * already have no account, so adding unreviewed ones makes the number this
 * phase exists to improve worse rather than better.
 */
const ROLE_LOCAL_PARTS = [
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'notifications',
  'notification',
  'alerts',
  'alert',
  'info',
  'hello',
  'contact',
  'support',
  'help',
  'helpdesk',
  'billing',
  'invoices',
  'invoice',
  'accounts',
  'accountspayable',
  'ap',
  'ar',
  'payroll',
  'hr',
  'careers',
  'jobs',
  'recruiting',
  'marketing',
  'news',
  'newsletter',
  'mailer',
  'mailer-daemon',
  'postmaster',
  'abuse',
  'admin',
  'webmaster',
  'sales',
  'service',
  'customerservice',
  'bounce',
  'bounces',
  'calendar-notification',
  'unsubscribe',
]

/** Lower-cased and trimmed, or null if it is not an address at all. */
export function normaliseAddress(raw: string | null | undefined): string | null {
  if (!raw) return null
  // "Jane Smith <jane@example.com>" as well as a bare address.
  const angled = raw.match(/<([^>]+)>/)
  const candidate = (angled ? angled[1] : raw).trim().toLowerCase()
  if (candidate === '' || !candidate.includes('@')) return null
  // One @ and something either side. Deliberately not a full RFC 5322 parser:
  // this only has to be good enough to compare against contacts.email, which
  // came out of a spreadsheet and is not RFC-anything either.
  const parts = candidate.split('@')
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return null
  if (!parts[1].includes('.')) return null
  return candidate
}

export function domainOf(address: string | null | undefined): string | null {
  const normalised = normaliseAddress(address)
  return normalised ? normalised.split('@')[1] : null
}

export function isPublicEmailDomain(domain: string | null | undefined): boolean {
  return domain ? PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase()) : false
}

/**
 * True when the address is a mailbox nobody sits behind.
 *
 * Matches a bare role name and the common `name+tag` and `name-noreply`
 * variants, but not a real name that merely starts with one — `information@`
 * is a role address, `info.tanaka@` is a person, and `sales.director@` is
 * somebody's job title rather than a shared inbox.
 */
export function isRoleAddress(address: string | null | undefined): boolean {
  const normalised = normaliseAddress(address)
  if (!normalised) return false
  const local = normalised.split('@')[0].split('+')[0]
  const bare = local.replace(/[._-]/g, '')
  return ROLE_LOCAL_PARTS.some((role) => bare === role.replace(/[._-]/g, ''))
}

/** A display name worth putting on a contact, or null. Rejects the case where
 *  the "name" is just the address again, which Graph does constantly. */
export function usableDisplayName(name: string | null, address: string): string | null {
  if (!name) return null
  const trimmed = name.trim().replace(/^["']|["']$/g, '')
  if (trimmed === '') return null
  if (trimmed.toLowerCase() === address.toLowerCase()) return null
  if (!trimmed.includes(' ') && trimmed.includes('@')) return null
  return trimmed
}

/**
 * Drop the trailing site or delegate a shared mailbox carries on its name.
 *
 * Exchange writes a shared or delegated mailbox as the person plus a suffix,
 * and both real examples came through the nightly ingest as contact
 * suggestions: "Eley, Thelma @ Charlotte" split on the comma and produced a
 * FIRST NAME of "Thelma @ Charlotte", and "Nick Deletsky / Anthony" has no
 * comma at all, so the last word won and it came out first "Nick Deletsky /",
 * last "Anthony". In both the person is the part before the separator.
 *
 * The spaces around the separator are required, and that is the whole safety
 * of it: "O'Brien-Smith" and "jane/admin@example.com" are untouched, so only
 * something already formatted as "name SEPARATOR something" is trimmed.
 *
 * It can still keep the wrong half if a mailbox is ever written the other way
 * round — "Reception / Jane Smith" would come out as Reception. That is a name
 * on a suggestion somebody reads and can edit before accepting, so the cost is
 * a correction rather than a bad row, and it is the rarer shape of the two.
 */
function withoutMailboxSuffix(name: string): string {
  const cut = name.replace(/\s+[@/]\s+.*$/, '').trim()
  // Never hand back nothing: a name that is ONLY a suffix is not one this rule
  // understands, so it is left exactly as it arrived.
  return cut === '' ? name : cut
}

/**
 * Split a display name into first and last, the way `contacts` stores it.
 *
 * Handles "Smith, Jane" as well as "Jane Smith", because Outlook global address
 * lists produce the first and mail clients produce the second. A single word
 * becomes a first name with an empty surname — the table's check constraint
 * only requires one of the two to be non-empty.
 */
export function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = withoutMailboxSuffix(full.trim().replace(/\s+/g, ' '))

  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',', 2).map((part) => part.trim())
    if (last && first) return { firstName: first, lastName: last }
  }

  const words = trimmed.split(' ')
  if (words.length === 1) return { firstName: words[0], lastName: '' }
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1] }
}
