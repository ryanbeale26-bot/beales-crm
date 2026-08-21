import { domainOf, isPublicEmailDomain, normaliseAddress } from '@/lib/ingest/addresses'
import {
  addressPhrases,
  isSpecificEnough,
  matchTitle,
  normaliseAlias,
  targetKey,
  type Phrase,
} from '@/lib/ingest/titles'
import type { IngestSource, MatchConfidence, Participant, RawItem, Supabase } from '@/lib/ingest'

/**
 * The three confidence tiers, and the rule that makes the whole phase safe:
 * a link is applied automatically only when it is a fact, never when it is a
 * good guess.
 *
 *   exact   — an address equals exactly one live contact's email. Their account
 *             comes with them when they have one; when they do not, the CONTACT
 *             is linked and the account is left null, because a half-filled
 *             contact record is a reason to say less, not a reason to say
 *             nothing. 63 of 99 live contacts have no account.
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
   *  they are who an activity gets credited to. Includes profile_email_aliases,
   *  which is what stops Granola's personal Gmail address being read as a
   *  stranger and credited to the machine account. */
  colleaguesByEmail: Map<string, { id: string; fullName: string }>
  /** Every phrase a note title could carry: curated aliases first, then street
   *  addresses and record names derived from what is already held. */
  phrases: Phrase[]
  /** targetKey() -> the account the record rolls up to, and what to call it. */
  targets: Map<string, ResolvedTarget>
}

export type ResolvedTarget = {
  accountId: string | null
  accountName: string
  label: string
  kind: 'account' | 'building' | 'deal'
}

export async function loadDirectory(supabase: Supabase): Promise<Directory> {
  const [contacts, domains, accounts, profiles, profileAliases, aliases, buildings, deals, stages] =
    await Promise.all([
      supabase.from('contacts').select('id, email, account_id').is('deleted_at', null),
      supabase.from('account_domains').select('domain, account_id'),
      supabase.from('accounts').select('id, name').is('deleted_at', null),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      supabase.from('profile_email_aliases').select('profile_id, email'),
      supabase
        .from('match_aliases')
        .select('alias, account_id, building_id, opportunity_id'),
      supabase
        .from('buildings')
        .select('id, name, address_line1, account_id')
        .is('deleted_at', null),
      supabase
        .from('opportunities')
        .select('id, name, account_id, stage_id')
        .is('deleted_at', null),
      supabase.from('pipeline_stages').select('id, is_won, is_lost'),
    ])

  const firstError =
    contacts.error ??
    domains.error ??
    accounts.error ??
    profiles.error ??
    profileAliases.error ??
    aliases.error ??
    buildings.error ??
    deals.error ??
    stages.error
  if (firstError) throw new Error(`Could not load the match directory: ${firstError.message}`)

  const contactsByEmail = new Map<string, ContactRef[]>()
  for (const contact of contacts.data ?? []) {
    const address = normaliseAddress(contact.email)
    if (!address) continue
    const existing = contactsByEmail.get(address) ?? []
    existing.push({ id: contact.id, accountId: contact.account_id })
    contactsByEmail.set(address, existing)
  }

  const accountNames = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))

  // Colleagues, plus their other addresses. Granola signs in as a personal
  // Gmail address, so without profile_email_aliases every note it produces is
  // credited to the machine account and Ryan's own address is filed as a
  // stranger.
  const colleaguesByEmail = new Map<string, { id: string; fullName: string }>()
  const profileNames = new Map<string, string>()
  for (const profile of profiles.data ?? []) {
    profileNames.set(profile.id, profile.full_name)
    const address = normaliseAddress(profile.email)
    if (address) colleaguesByEmail.set(address, { id: profile.id, fullName: profile.full_name })
  }
  for (const alias of profileAliases.data ?? []) {
    const address = normaliseAddress(alias.email)
    const fullName = profileNames.get(alias.profile_id)
    // Only for an ACTIVE profile. An alias pointing at a deactivated person
    // must not resurrect them as somebody who can be credited with work.
    if (address && fullName) colleaguesByEmail.set(address, { id: alias.profile_id, fullName })
  }

  // --- the phrase book ------------------------------------------------------
  // Deliberately NOT filtered for ambiguity here. v_alias_candidates refuses to
  // OFFER a phrase two records would claim; the matcher has to SEE it, or it
  // cannot tell an ambiguity from a miss and "851 middle st" would silently
  // resolve to whichever building was loaded first.
  const targets = new Map<string, ResolvedTarget>()
  const phrases: Phrase[] = []

  const remember = (
    alias: string | null,
    source: Phrase['source'],
    target: Phrase['target'],
    resolved: ResolvedTarget,
  ) => {
    if (!alias) return
    if (source !== 'curated' && !isSpecificEnough(alias)) return
    targets.set(targetKey(target), resolved)
    phrases.push({ alias, source, target, label: resolved.label })
  }

  const openStages = new Set(
    (stages.data ?? []).filter((s) => !s.is_won && !s.is_lost).map((s) => s.id),
  )

  for (const account of accounts.data ?? []) {
    const target = { accountId: account.id, buildingId: null, opportunityId: null }
    remember(normaliseAlias(account.name), 'name', target, {
      accountId: account.id,
      accountName: account.name,
      label: account.name,
      kind: 'account',
    })
  }

  for (const building of buildings.data ?? []) {
    const target = { accountId: null, buildingId: building.id, opportunityId: null }
    const resolved: ResolvedTarget = {
      accountId: building.account_id,
      accountName: accountNames.get(building.account_id) ?? 'an account',
      label: building.name,
      kind: 'building',
    }
    // A street address is the strongest derived phrase there is, and it is what
    // most real titles actually carry.
    for (const phrase of addressPhrases(building.address_line1)) {
      remember(phrase, 'address', target, resolved)
    }
    remember(normaliseAlias(building.name), 'name', target, resolved)
  }

  for (const deal of deals.data ?? []) {
    // Open deals only. A phrase from a deal closed two years ago would file
    // tonight's note against history.
    if (!openStages.has(deal.stage_id)) continue
    const target = { accountId: null, buildingId: null, opportunityId: deal.id }
    remember(normaliseAlias(deal.name), 'name', target, {
      accountId: deal.account_id,
      accountName: deal.account_id ? (accountNames.get(deal.account_id) ?? 'an account') : 'no account yet',
      label: deal.name,
      kind: 'deal',
    })
  }

  // Curated last, so a person's own words are the final say and overwrite any
  // resolved label derived from the same record.
  for (const alias of aliases.data ?? []) {
    const target = {
      accountId: alias.account_id,
      buildingId: alias.building_id,
      opportunityId: alias.opportunity_id,
    }
    const key = targetKey(target)
    const resolved = targets.get(key)
    if (resolved) {
      remember(alias.alias, 'curated', target, resolved)
      continue
    }
    // The alias points at a record the queries above did not return — an
    // archived building, or a deal that has since closed. Keep the phrase, and
    // say plainly that the record is no longer live rather than dropping it
    // silently.
    const accountId = alias.account_id ?? null
    remember(alias.alias, 'curated', target, {
      accountId,
      accountName: accountId ? (accountNames.get(accountId) ?? 'an account') : 'no account',
      label: alias.alias,
      kind: alias.opportunity_id ? 'deal' : alias.building_id ? 'building' : 'account',
    })
  }

  return {
    contactsByEmail,
    accountByDomain: new Map((domains.data ?? []).map((d) => [d.domain, d.account_id])),
    accountNames,
    colleaguesByEmail,
    phrases,
    targets,
  }
}

export type Match = {
  confidence: MatchConfidence
  /**
   * Nullable, which it was not before Phase 7c.
   *
   * A participant match always knows the account. A TITLE match may know only a
   * deal — and 28 of the 30 open deals are not linked to an account — so
   * insisting on one here would mean either refusing those matches or inventing
   * an account for them. Null is honest, and `set_activity_account()` fills it
   * from the building or the deal when there is one to fill it from.
   */
  accountId: string | null
  accountName: string
  /** What the matched record is called, for a screen or a log line. Equal to
   *  accountName on a participant match, where the account IS the record. */
  label?: string
  /** Set when EXACTLY ONE contact was matched by address, on either tier — a
   *  meeting with three people from one company links the company and leaves
   *  "which of them" to a person. On the domain tier it used to be hardcoded
   *  null, which threw away a person we had already identified. */
  contactId: string | null
  /** Set by a title match. A participant match never guesses which building or
   *  which deal, even when the company is certain. */
  buildingId?: string | null
  opportunityId?: string | null
  /** The phrase that matched, verbatim. Stored on the mirror so a screen can say
   *  WHY rather than asking anyone to take the tier on faith. */
  matchedOn?: string | null
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

  // Everything still matched is a contact with NO account, and until 2026-08-20
  // that meant nothing at all: `contactAccounts` filters the nulls out, so an
  // accountless contact contributed nothing to it, and a message from somebody
  // we demonstrably hold fell straight past the domain tier into the strangers
  // tray. 63 of the 99 live contacts have no account and 47 of those have an
  // address, so this was most of the contact book. It was doing it to
  // meghan.szafran@cancer.org — a contact since the August import — every night,
  // in production, with the tray on /admin/ingest calling her a stranger.
  //
  // Held rather than returned, because an ACCOUNT is worth more than a person:
  // the domain tier below keeps first refusal, and now carries this contact with
  // it rather than always answering null.
  const soleContact = matchedContacts.size === 1 ? [...matchedContacts.values()][0] : null

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
      contactId: soleContact?.id ?? null,
      rationale: soleContact
        ? `${[...matchedAddresses][0]} is a contact with no account, and ${domain} is ${accountName}.`
        : `Nobody on this message is a contact yet, but ${domain} is ${accountName}.`,
    }
  }

  // --- a known person, at a company we do not hold --------------------------
  // An address is a fact about a person even when their contact record is
  // half-filled, so this is `exact` and not a guess. What is genuinely unknown
  // is the company, and null says so rather than inventing one: accountId has
  // been nullable since 7c, and set_activity_account() fills it the day that
  // contact gains an account.
  //
  // TWO accountless contacts is still nothing, deliberately. Picking one of them
  // is exactly the guess this tier exists to refuse — and it is why the monthly
  // BBM inspection stayed unmatched, with Brittany Hampton on it alongside
  // Brendan Mulligan, a former colleague who drops out of colleaguesByEmail the
  // moment his profile is deactivated and reads as a second client from then on.
  if (soleContact) {
    return {
      confidence: 'exact',
      accountId: null,
      accountName: 'no account yet',
      contactId: soleContact.id,
      rationale: `${[...matchedAddresses][0]} is a contact, but is not linked to an account.`,
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

/**
 * Which sources are matched on their TITLE rather than on who was on them.
 *
 * Granola, and only Granola. Measured against all 231 real notes: not one
 * carries an external attendee address, because most are solo site inspections
 * dictated into a phone, so `matchParticipants` resolves nothing on any of them.
 * Mail and calendar keep the participant rule, which is stronger — an address is
 * a fact about a person, where a title is a fact about words.
 */
export function usesTitleMatching(source: IngestSource): boolean {
  return source === 'granola'
}

export type MatchOutcome =
  /** One record. A fact, so the link is applied. */
  | { kind: 'matched'; match: Match }
  /**
   * Two or more DIFFERENT records are named, at different places in the title.
   * "Quincy Ambulatory and Plymouth Cordage Park kick off meeting" is both,
   * truthfully, and picking one would be a guess dressed as a fact.
   *
   * Nothing is linked and nothing is proposed. An activity has one account_id,
   * so two competing suggestions on one activity would let a reviewer accept
   * both and have the second silently overwrite the first. What resolves this is
   * one alias, which fixes this note AND every future note shaped like it.
   */
  | { kind: 'ambiguous'; candidates: ResolvedTarget[]; phrases: string[] }
  /** Nothing known is named. Where the private notes land, by construction. */
  | { kind: 'none' }

/**
 * What an item is about: participants first, then the title.
 *
 * Participants are tried even for Granola. They resolve nothing today, and that
 * is a measurement rather than a guarantee — the day a client is actually on a
 * note, an address match is a better answer than a phrase match and should win.
 */
export function matchItem(item: RawItem, dir: Directory): MatchOutcome {
  const byParticipants = matchParticipants(item.participants, dir)
  if (byParticipants) return { kind: 'matched', match: byParticipants }

  if (!usesTitleMatching(item.source) || !item.subject.trim()) return { kind: 'none' }

  const verdict = matchTitle(item.subject, dir.phrases)

  if (verdict.kind === 'none') return { kind: 'none' }

  if (verdict.kind === 'ambiguous') {
    // One entry per distinct record, keeping the phrase that reached it.
    const seen = new Set<string>()
    const distinct: { phrase: Phrase; resolved: ResolvedTarget }[] = []
    for (const match of verdict.matches) {
      const key = targetKey(match.phrase.target)
      if (seen.has(key)) continue
      seen.add(key)
      const resolved = dir.targets.get(key)
      if (resolved) distinct.push({ phrase: match.phrase, resolved })
    }

    // A BUILDING AND ITS OWN ACCOUNT ARE ONE PLACE, NOT TWO CANDIDATES.
    //
    // Two real records are shaped exactly like this: the building "Braintree
    // Hill Office Park" sits under the account "Braintree Hill Office Park", as
    // does "Dermatology of Cape Cod". A title naming either produced two
    // candidates printing the same words, which reads as a bug and is certainly
    // not a decision anybody can make. The building is the more specific of the
    // two and rolls up to that same account anyway, so nothing is being guessed
    // — whichever were chosen, the account is identical.
    const specific = distinct.filter((d) => d.resolved.kind !== 'account')
    const accounts = distinct.filter((d) => d.resolved.kind === 'account')
    if (
      specific.length === 1 &&
      accounts.length === distinct.length - 1 &&
      accounts.length > 0 &&
      accounts.every((a) => a.resolved.accountId === specific[0].resolved.accountId)
    ) {
      return {
        kind: 'matched',
        match: toMatch(specific[0].phrase, specific[0].resolved, verdict.matches
          .filter((m) => targetKey(m.phrase.target) === targetKey(specific[0].phrase.target))
          .reduce((a, b) => (b.phrase.alias.length > a.phrase.alias.length ? b : a)).phrase.alias),
      }
    }

    return {
      kind: 'ambiguous',
      candidates: distinct.map((d) => d.resolved),
      phrases: [...new Set(verdict.matches.map((m) => m.phrase.alias))],
    }
  }

  const resolved = dir.targets.get(targetKey(verdict.phrase.target))
  if (!resolved) return { kind: 'none' }

  return { kind: 'matched', match: toMatch(verdict.phrase, resolved, verdict.matchedOn) }
}

function toMatch(phrase: Phrase, resolved: ResolvedTarget, matchedOn: string): Match {
  return {
    // Named 'exact' rather than a fourth tier. What the tier means in this app
    // is "this is a fact, not a guess", and both kinds of title match qualify:
    // a curated alias is a person's own statement about what a phrase means,
    // and a street address carrying its NUMBER that resolves to exactly one
    // live record is a fact about that address. `matched_on` records the
    // phrase, so the claim is auditable rather than asserted.
    confidence: 'exact',
    accountId: resolved.accountId,
    accountName: resolved.accountName,
    label: resolved.label,
    contactId: null,
    buildingId: phrase.target.buildingId,
    opportunityId: phrase.target.opportunityId,
    matchedOn,
    rationale: rationaleFor(phrase.source, matchedOn, resolved),
  }
}

function rationaleFor(
  source: Phrase['source'],
  matchedOn: string,
  resolved: ResolvedTarget,
): string {
  const noun = resolved.kind === 'deal' ? 'the deal' : resolved.kind === 'building' ? '' : 'the account'
  const what = noun ? `${noun} ${resolved.label}` : resolved.label

  switch (source) {
    case 'curated':
      return `The title says “${matchedOn}”, which somebody here mapped to ${what}.`
    case 'address':
      return `The title carries the address “${matchedOn}”, which is ${what}.`
    case 'name':
      return `The title names “${matchedOn}”, which is ${what}.`
  }
}
