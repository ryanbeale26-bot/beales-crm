import 'server-only'

import { normaliseAddress, usableDisplayName, isRoleAddress, splitName, domainOf, isPublicEmailDomain } from '@/lib/ingest/addresses'
import { creditTo, directionOf, loadDirectory, matchParticipants, type Directory, type Match } from '@/lib/ingest/match'
import { propose, type Proposal } from '@/lib/ingest/suggestions'
import { toSnippet, type RawItem, type SourceFetch, type Supabase } from '@/lib/ingest'

/**
 * The nightly run: fetch, match, write.
 *
 * State lives per item in the database rather than in an in-memory list, which
 * is what makes a timeout a pause rather than a failure — the next invocation
 * picks up whatever is still unprocessed and nothing is lost or duplicated. The
 * deadline is checked between items, never inside one.
 */

export type RunSummary = {
  seen: number
  ingested: number
  unknownSenders: number
  activitiesCreated: number
  nextStepsCreated: number
  suggestionsWritten: number
  alreadySeen: number
  errors: string[]
  stoppedEarly: boolean
}

const EMPTY: RunSummary = {
  seen: 0,
  ingested: 0,
  unknownSenders: 0,
  activitiesCreated: 0,
  nextStepsCreated: 0,
  suggestionsWritten: 0,
  alreadySeen: 0,
  errors: [],
  stoppedEarly: false,
}

/** How long a suggestion waits before it stops asking. Ignoring the review
 *  screen has to cost nothing, or it becomes the chore that kills adoption. */
const SUGGESTION_TTL_DAYS = 21

export async function runIngest(
  supabase: Supabase,
  options: {
    sources: { name: string; fetch: SourceFetch }[]
    since: string
    /** Epoch ms. Finish the current item and stop cleanly once past it. */
    deadline: number
    actorId: string
  },
): Promise<RunSummary> {
  const summary: RunSummary = { ...EMPTY, errors: [] }
  const dir = await loadDirectory(supabase)
  const types = await loadActivityTypes(supabase)
  const proposals: Proposal[] = []

  for (const source of options.sources) {
    if (Date.now() > options.deadline) {
      summary.stoppedEarly = true
      break
    }

    let batch: { items: RawItem[] }
    try {
      batch = await source.fetch({ since: options.since, deadline: options.deadline })
    } catch (caught) {
      summary.errors.push(
        `${source.name}: ${caught instanceof Error ? caught.message : String(caught)}`,
      )
      continue
    }

    for (const item of batch.items) {
      if (Date.now() > options.deadline) {
        summary.stoppedEarly = true
        break
      }

      summary.seen += 1
      try {
        await ingestOne(supabase, item, dir, types, options.actorId, summary, proposals)
      } catch (caught) {
        summary.errors.push(
          `${item.externalId}: ${caught instanceof Error ? caught.message : String(caught)}`,
        )
      }
    }
  }

  if (proposals.length > 0) {
    const { written, error } = await propose(supabase, proposals)
    summary.suggestionsWritten = written
    if (error) summary.errors.push(`Suggestions: ${error}`)
  }

  return summary
}

async function ingestOne(
  supabase: Supabase,
  item: RawItem,
  dir: Directory,
  types: Map<string, string>,
  actorId: string,
  summary: RunSummary,
  proposals: Proposal[],
): Promise<void> {
  const match = matchParticipants(item.participants, dir)

  // Nothing here belongs to a client we know. Per the mailbox scope rule, the
  // message itself is left alone entirely — no subject, no body, nothing. What
  // is recorded is only who wrote and how often, which is exactly enough to
  // decide whether their domain is worth mapping to an account.
  if (!match) {
    await recordUnknownSender(supabase, item, dir)
    summary.unknownSenders += 1
    return
  }

  // Somebody on this message may have been filed as an unknown sender before
  // their domain was mapped or their contact created. They are known now, so
  // drop the placeholder — otherwise the "we don't know these people" list
  // keeps naming people we do, and stops being worth reading.
  //
  // This runs on every match, not only on a new one: the message that finally
  // identifies somebody is usually one already in the mirror, so doing it after
  // the already-seen check below would mean it never ran at all.
  await clearUnknownSenders(supabase, item)

  const mailboxId = item.mailboxEmail
    ? (dir.colleaguesByEmail.get(normaliseAddress(item.mailboxEmail) ?? '')?.id ?? null)
    : null

  // The unique key is (source, external_id, mailbox_id) with NULLS NOT
  // DISTINCT, so the lookup has to distinguish "no mailbox" from "this
  // mailbox" the same way — `.eq(col, null)` would silently match nothing.
  const lookup = supabase
    .from('ingested_items')
    .select('id, activity_id, next_step_id')
    .eq('source', item.source)
    .eq('external_id', item.externalId)
  const { data: existing } = await (
    mailboxId === null ? lookup.is('mailbox_id', null) : lookup.eq('mailbox_id', mailboxId)
  ).maybeSingle()

  // Re-seen. Touch the timestamp so the admin screen can show the source is
  // alive, and stop — an item is only ever turned into a record once.
  if (existing) {
    await supabase
      .from('ingested_items')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.id)
    summary.alreadySeen += 1
    return
  }

  const isFuture = Boolean(item.scheduled && new Date(item.scheduled.startsAt) > new Date())
  const credited = creditTo(item.participants, dir) ?? actorId

  let activityId: string | null = null
  let nextStepId: string | null = null

  if (isFuture && item.scheduled) {
    // A booked meeting has not happened. It is a next step until it does —
    // putting it in activities would sit it at the top of every timeline and
    // make the account read as touched today.
    const { data, error } = await supabase
      .from('next_steps')
      .insert({
        title: item.subject || 'Meeting',
        detail: toSnippet(item.text),
        due_at: item.scheduled.startsAt,
        all_day: item.scheduled.allDay,
        origin: 'calendar',
        owner_id: credited,
        account_id: match.accountId,
        contact_id: match.contactId,
        source: item.source,
        external_id: item.externalId,
        created_by: actorId,
      })
      .select('id')
      .single()

    if (error) throw new Error(`next step: ${error.message}`)
    nextStepId = data.id
    summary.nextStepsCreated += 1
  } else {
    const typeName = item.source === 'outlook' ? 'Email' : 'Meeting'
    const typeId = types.get(typeName)
    if (!typeId) throw new Error(`No activity type called "${typeName}"`)

    const { data, error } = await supabase
      .from('activities')
      .insert({
        activity_type_id: typeId,
        subject: item.subject || '(no subject)',
        body: toSnippet(item.text),
        occurred_at: item.occurredAt,
        logged_by: credited,
        account_id: match.accountId,
        contact_id: match.contactId,
        source: item.source,
        external_id: item.externalId,
      })
      .select('id')
      .single()

    if (error) throw new Error(`activity: ${error.message}`)
    activityId = data.id
    summary.activitiesCreated += 1
  }

  const { error: mirrorError } = await supabase.from('ingested_items').insert({
    source: item.source,
    external_id: item.externalId,
    mailbox_id: mailboxId,
    occurred_at: item.occurredAt,
    direction: directionOf(item.participants, dir),
    subject: item.subject,
    snippet: toSnippet(item.text),
    participants: item.participants as never,
    thread_key: item.threadKey,
    status: 'linked',
    matched_by: match.confidence,
    activity_id: activityId,
    next_step_id: nextStepId,
  })

  if (mirrorError) throw new Error(`mirror: ${mirrorError.message}`)
  summary.ingested += 1

  proposals.push(...proposeNewContacts(item, dir, match))
}

/**
 * People writing from a company we know, who are not in Contacts yet.
 *
 * Deterministic on the address — they demonstrably sent the message — and as
 * good as account_domains on the account. The weakest part is the *name*, which
 * is why role addresses are dropped and a display name that is merely the
 * address repeated is not used. Always a suggestion, never automatic: 63 of 97
 * existing contacts already have no account, and adding unreviewed ones makes
 * the number this phase exists to improve worse.
 */
function proposeNewContacts(item: RawItem, dir: Directory, match: Match): Proposal[] {
  const out: Proposal[] = []
  const expiresAt = new Date(Date.now() + SUGGESTION_TTL_DAYS * 86_400_000).toISOString()

  for (const participant of item.participants) {
    const address = normaliseAddress(participant.address)
    if (!address) continue
    if (dir.colleaguesByEmail.has(address)) continue
    if (dir.contactsByEmail.has(address)) continue
    if (isRoleAddress(address)) continue

    const domain = domainOf(address)
    if (!domain || isPublicEmailDomain(domain)) continue
    // Only propose someone whose own domain is the one we matched on. A client
    // cc'ing their lawyer should not create a contact at the client.
    if (dir.accountByDomain.get(domain) !== match.accountId) continue

    const display = usableDisplayName(participant.name, address)
    if (!display) continue

    const { firstName, lastName } = splitName(display)

    out.push({
      kind: 'create_contact',
      confidence: 'domain',
      subjectTable: 'contacts',
      subjectId: null,
      payload: {
        first_name: firstName,
        last_name: lastName,
        email: address,
        account_id: match.accountId,
      },
      rationale: `${display} <${address}> wrote from ${domain}, which is ${match.accountName}, and is not in Contacts.`,
      ingestedItemId: null,
      expiresAt,
    })
  }

  return out
}

/**
 * The unknown-sender tray.
 *
 * Deliberately a row in the mirror with `status = 'ignored'`, an empty subject
 * and no snippet, rather than a table of its own: the promise made about
 * scope was address, domain, count and last-seen — no subject, no body — and
 * this is that promise expressed as data rather than as a comment. Seeing the
 * same address four times is what makes its domain worth mapping.
 */
async function recordUnknownSender(supabase: Supabase, item: RawItem, dir: Directory): Promise<void> {
  const sender = item.participants.find((p) => p.role === 'from' || p.role === 'organizer')
  const address = normaliseAddress(sender?.address ?? null)
  if (!address) return
  if (dir.colleaguesByEmail.has(address)) return

  const key = `unknown:${address}`

  const { data: existing } = await supabase
    .from('ingested_items')
    .select('id')
    .eq('source', item.source)
    .eq('external_id', key)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('ingested_items')
      .update({ last_seen_at: new Date().toISOString(), occurred_at: item.occurredAt })
      .eq('id', existing.id)
    return
  }

  await supabase.from('ingested_items').insert({
    source: item.source,
    external_id: key,
    mailbox_id: null,
    occurred_at: item.occurredAt,
    subject: '',
    snippet: null,
    participants: [{ address, name: null, role: 'from' }] as never,
    status: 'ignored',
  })
}

async function clearUnknownSenders(supabase: Supabase, item: RawItem): Promise<void> {
  const keys = item.participants
    .map((p) => normaliseAddress(p.address))
    .filter((address): address is string => address !== null)
    .map((address) => `unknown:${address}`)

  if (keys.length === 0) return

  await supabase.from('ingested_items').delete().eq('status', 'ignored').in('external_id', keys)
}

async function loadActivityTypes(supabase: Supabase): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('activity_types').select('id, name')
  if (error) throw new Error(`Could not read activity types: ${error.message}`)
  return new Map((data ?? []).map((t) => [t.name, t.id]))
}
