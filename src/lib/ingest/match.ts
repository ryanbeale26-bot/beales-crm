import { domainOf, isPublicEmailDomain, normaliseAddress } from '@/lib/ingest/addresses'
import type { MatchConfidence, Participant, Supabase } from '@/lib/ingest'

/**
 * The three confidence tiers, and the rule that makes the whole phase safe:
 * a link is applied automatically only when it is a fact, never when it is a
 * good guess.
 *
 *   exact   — an address equals exactly one live contact's email.
 *   domain  — the address's domain maps to exactly one account. The ACCOUNT is
 *             linked and nothing else: which building, or which deal, is still
 *             a guess even when the company is certain.
 *   inferred— anything read out of text. Never applied here. It becomes a
 *             suggestion, and it lives in the extraction layer, not this file.
 */

export type ContactRef = { id: string; accountId: string | null }

export type Directory = {
  /** Lower-cased address -> every live contact holding it. A list, not a
   *  single value, because contacts_email_idx is deliberately NOT unique and
   *  two people really can share an address. */
  contactsByEmail: Map<string, ContactRef[]>
  accountByDomain: Map<string, string>
  accountNames: Map<string, string>
  /** The five people. Their addresses are never treated as a client match, and
   *  they are who an activity gets credited to. */
  colleaguesByEmail: Map<string, { id: string; fullName: string }>
}

export async function loadDirectory(supabase: Supabase): Promise<Directory> {
  const [contacts, domains, accounts, profiles] = await Promise.all([
    supabase.from('contacts').select('id, email, account_id').is('deleted_at', null),
    supabase.from('account_domains').select('domain, account_id'),
    supabase.from('accounts').select('id, name').is('deleted_at', null),
    supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
  ])

  const firstError = contacts.error ?? domains.error ?? accounts.error ?? profiles.error
  if (firstError) throw new Error(`Could not load the match directory: ${firstError.message}`)

  const contactsByEmail = new Map<string, ContactRef[]>()
  for (const contact of contacts.data ?? []) {
    const address = normaliseAddress(contact.email)
    if (!address) continue
    const existing = contactsByEmail.get(address) ?? []
    existing.push({ id: contact.id, accountId: contact.account_id })
    contactsByEmail.set(address, existing)
  }

  return {
    contactsByEmail,
    accountByDomain: new Map((domains.data ?? []).map((d) => [d.domain, d.account_id])),
    accountNames: new Map((accounts.data ?? []).map((a) => [a.id, a.name])),
    colleaguesByEmail: new Map(
      (profiles.data ?? []).flatMap((p) => {
        const address = normaliseAddress(p.email)
        return address ? [[address, { id: p.id, fullName: p.full_name }] as const] : []
      }),
    ),
  }
}

export type Match = {
  confidence: MatchConfidence
  accountId: string
  accountName: string
  /** Only ever set on an exact match to a single contact. A meeting with three
   *  people from one company links the company, and leaves "which of them" to
   *  a person. */
  contactId: string | null
  rationale: string
}

/**
 * Decide what an item is about.
 *
 * Returning null means two things at once, and they are the same thing: there
 * is no link to apply, and — because the mailbox scope rule is "a known address
 * or a known domain, nothing else" — there is nothing here worth storing
 * either. The caller treats null as "leave this message alone".
 */
export function matchParticipants(participants: Participant[], dir: Directory): Match | null {
  const external = participants
    .map((p) => ({ ...p, address: normaliseAddress(p.address) }))
    .filter((p): p is Participant & { address: string } => p.address !== null)
    .filter((p) => !dir.colleaguesByEmail.has(p.address))

  // --- exact ---------------------------------------------------------------
  const matchedContacts = new Map<string, ContactRef>()
  const matchedAddresses = new Set<string>()

  for (const participant of external) {
    const candidates = dir.contactsByEmail.get(participant.address)
    if (!candidates || candidates.length === 0) continue
    // Two live contacts share this address. That is ambiguous, and the rule is
    // never to pick one — so the address contributes nothing at all.
    if (candidates.length > 1) continue
    matchedContacts.set(candidates[0].id, candidates[0])
    matchedAddresses.add(participant.address)
  }

  const contactAccounts = new Set(
    [...matchedContacts.values()].map((c) => c.accountId).filter((id): id is string => id !== null),
  )

  if (contactAccounts.size === 1) {
    const accountId = [...contactAccounts][0]
    const accountName = dir.accountNames.get(accountId) ?? 'an account'
    const only = matchedContacts.size === 1 ? [...matchedContacts.values()][0] : null

    return {
      confidence: 'exact',
      accountId,
      accountName,
      contactId: only?.id ?? null,
      rationale:
        matchedContacts.size === 1
          ? `${[...matchedAddresses][0]} is a contact at ${accountName}.`
          : `${matchedContacts.size} people on this message are contacts at ${accountName}.`,
    }
  }

  // More than one account among the matched contacts. Genuinely ambiguous —
  // a broker introducing two clients on one thread is exactly this shape — so
  // nothing is linked, and the domain tier is not a tie-breaker for it either.
  if (contactAccounts.size > 1) return null

  // --- domain --------------------------------------------------------------
  const domainAccounts = new Map<string, string>()
  for (const participant of external) {
    const domain = domainOf(participant.address)
    if (!domain || isPublicEmailDomain(domain)) continue
    const accountId = dir.accountByDomain.get(domain)
    if (accountId) domainAccounts.set(domain, accountId)
  }

  const distinctAccounts = new Set(domainAccounts.values())
  if (distinctAccounts.size === 1) {
    const accountId = [...distinctAccounts][0]
    const accountName = dir.accountNames.get(accountId) ?? 'an account'
    const domain = [...domainAccounts.keys()][0]
    return {
      confidence: 'domain',
      accountId,
      accountName,
      contactId: null,
      rationale: `Nobody on this message is a contact yet, but ${domain} is ${accountName}.`,
    }
  }

  return null
}

/**
 * Which colleague an item belongs to.
 *
 * An email that reached three of the five becomes ONE activity, credited to
 * whoever sent it if the sender is one of them — an outbound email is that
 * person's work — and otherwise to the first of them on the message. Without
 * this rule a five-way client thread puts five identical rows on one account
 * timeline and inflates every activity count in the app.
 */
export function creditTo(participants: Participant[], dir: Directory): string | null {
  const ordered: Participant['role'][] = ['from', 'organizer', 'to', 'cc', 'attendee']

  for (const role of ordered) {
    for (const participant of participants) {
      if (participant.role !== role) continue
      const address = normaliseAddress(participant.address)
      const colleague = address ? dir.colleaguesByEmail.get(address) : undefined
      if (colleague) return colleague.id
    }
  }

  return null
}

/** Outbound when one of the five sent it, internal when nobody outside is on
 *  it, inbound otherwise. */
export function directionOf(
  participants: Participant[],
  dir: Directory,
): 'inbound' | 'outbound' | 'internal' {
  const sender = participants.find((p) => p.role === 'from' || p.role === 'organizer')
  const senderAddress = normaliseAddress(sender?.address ?? null)
  const fromColleague = senderAddress ? dir.colleaguesByEmail.has(senderAddress) : false

  const anyExternal = participants.some((p) => {
    const address = normaliseAddress(p.address)
    return address !== null && !dir.colleaguesByEmail.has(address)
  })

  if (!anyExternal) return 'internal'
  return fromColleague ? 'outbound' : 'inbound'
}
