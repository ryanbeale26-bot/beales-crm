import 'server-only'

import { normaliseAddress, usableDisplayName, isRoleAddress, splitName, domainOf, isPublicEmailDomain } from '@/lib/ingest/addresses'
import {
  creditTo,
  directionOf,
  loadDirectory,
  matchItem,
  usesTitleMatching,
  type Directory,
  type Match,
} from '@/lib/ingest/match'
import { activityTypeForTitle } from '@/lib/ingest/titles'
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
  /** Titles naming two different records. Nothing linked, and one alias fixes
   *  each of them permanently — which is why these are listed on /admin/ingest
   *  rather than left as a count. */
  ambiguous: number
  /** Items naming nothing known. For a title source this is where the private
   *  notes land, so the mirror row keeps no subject and no text at all. */
  unmatched: number
  activitiesCreated: number
  nextStepsCreated: number
  suggestionsWritten: number
  alreadySeen: number
  errors: string[]
  stoppedEarly: boolean
  /** Sources that came back short — the deadline hit mid-page, or a page cap
   *  was reached. Granola has always reported this and nothing read it, so a
   *  run that saw half of Granola looked identical to one that saw all of it. */
  truncated: string[]
}

const EMPTY: RunSummary = {
  seen: 0,
  ingested: 0,
  unknownSenders: 0,
  ambiguous: 0,
  unmatched: 0,
  activitiesCreated: 0,
  nextStepsCreated: 0,
  suggestionsWritten: 0,
  alreadySeen: 0,
  errors: [],
  stoppedEarly: false,
  truncated: [],
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
    /**
     * Stamp everything created with this batch, so it can be undone as one
     * thing from the bottom of /admin/import.
     *
     * Left null by the nightly job: a night's worth of ingest is not a decision
     * anybody took, and an Undo button per night would be a list nobody reads.
     * Set by the historical backfill, which IS one decision — and because
     * `activities` and `next_steps` are already in rollbackImport's table list,
     * setting it is the whole of what makes the backfill reversible. No new undo
     * code exists for this.
     */
    importBatchId?: string | null
  },
): Promise<RunSummary> {
  const summary: RunSummary = { ...EMPTY, errors: [], truncated: [] }
  const dir = await loadDirectory(supabase)
  const types = await loadActivityTypes(supabase)
  const proposals: Proposal[] = []

  for (const source of options.sources) {
    if (Date.now() > options.deadline) {
      summary.stoppedEarly = true
      break
    }

    let batch: { items: RawItem[]; cursor: string | null }
    try {
      batch = await source.fetch({ since: options.since, deadline: options.deadline })
    } catch (caught) {
      summary.errors.push(
        `${source.name}: ${caught instanceof Error ? caught.message : String(caught)}`,
      )
      continue
    }

    // A non-null cursor means the source stopped before the end of what it had.
    // It is not an error and not a reason to retry — the mirror makes a re-seen
    // item a timestamp touch — but a night that read half of Granola must not
    // look like a night that read all of it.
    if (batch.cursor) summary.truncated.push(source.name)

    for (const item of batch.items) {
      if (Date.now() > options.deadline) {
        summary.stoppedEarly = true
        break
      }

      summary.seen += 1
      try {
        await ingestOne(
          supabase,
          item,
          dir,
          types,
          options.actorId,
          summary,
          proposals,
          options.importBatchId ?? null,
        )
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
  importBatchId: string | null,
): Promise<void> {
  const outcome = matchItem(item, dir)

  const mailboxId = item.mailboxEmail
    ? (dir.colleaguesByEmail.get(normaliseAddress(item.mailboxEmail) ?? '')?.id ?? null)
    : null

  // The unique key is (source, external_id, mailbox_id) with NULLS NOT
  // DISTINCT, so the lookup has to distinguish "no mailbox" from "this
  // mailbox" the same way — `.eq(col, null)` would silently match nothing.
  const lookup = supabase
    .from('ingested_items')
    .select('id, status, activity_id, next_step_id')
    .eq('source', item.source)
    .eq('external_id', item.externalId)
  const { data: existing } = await (
    mailboxId === null ? lookup.is('mailbox_id', null) : lookup.eq('mailbox_id', mailboxId)
  ).maybeSingle()

  // Already turned into a record. Touch the timestamp so the admin screen can
  // show the source is alive, and stop — an item becomes a record once.
  //
  // Deliberately keyed on status 'linked' rather than on the row merely
  // existing, which is what it used to be. A note that matched nothing tonight
  // may match next week, because the fix for a miss is adding an alias — and if
  // any existing row short-circuited here, adding that alias would never
  // retro-link the notes it was added for, which is the entire point of adding
  // it. So an unmatched or ambiguous row is re-evaluated on every run.
  // ...and it must still have something to point at. Both activity_id and
  // next_step_id are `on delete set null`, so undoing the historical backfill
  // deletes the activities and leaves these rows claiming 'linked' with nothing
  // behind them. Without this second condition those notes would be skipped for
  // ever and the backfill could never be re-run after an undo — which would make
  // the undo a one-way door, which is the opposite of what an undo is for.
  if (existing && existing.status === 'linked' && (existing.activity_id || existing.next_step_id)) {
    await supabase
      .from('ingested_items')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.id)
    summary.alreadySeen += 1
    return
  }

  // --- nothing known is named ----------------------------------------------
  if (outcome.kind === 'none') {
    if (usesTitleMatching(item.source)) {
      // A note, not a message. There is no stranger to record — the author is
      // one of us — so what is written is the note's id and its date, and
      // NOTHING ELSE. Not the title, because this is exactly the bucket the
      // private notes fall into: two of Ryan's last twenty-four are his own
      // medical appointments, and one of those names a hospital and a street.
      // Their titles belong on his own screen, via `npm run granola:probe`, and
      // nowhere near a table four colleagues can read.
      await writeMirror(supabase, existing?.id ?? null, {
        source: item.source,
        external_id: item.externalId,
        mailbox_id: mailboxId,
        occurred_at: item.occurredAt,
        direction: null,
        subject: '',
        snippet: null,
        participants: [] as never,
        thread_key: null,
        status: 'ignored',
        matched_by: null,
        matched_on: null,
      })
      summary.unmatched += 1
      return
    }

    // Mail. Per the mailbox scope rule the message is left alone entirely, and
    // what is recorded is only who wrote and how often — enough to decide
    // whether their domain is worth mapping to an account.
    await recordUnknownSender(supabase, item, dir)
    summary.unknownSenders += 1
    return
  }

  // --- two different records are named -------------------------------------
  if (outcome.kind === 'ambiguous') {
    // The title IS about the business — it named two records we hold — so the
    // title is kept, and it is listed on /admin/ingest where one alias resolves
    // it and every future note shaped like it. Still no snippet: the body was
    // never fetched, because nothing has been linked.
    await writeMirror(supabase, existing?.id ?? null, {
      source: item.source,
      external_id: item.externalId,
      mailbox_id: mailboxId,
      occurred_at: item.occurredAt,
      direction: null,
      subject: item.subject,
      snippet: null,
      participants: item.participants as never,
      thread_key: item.threadKey,
      status: 'needs_review',
      matched_by: null,
      matched_on: outcome.phrases.join(' · '),
    })
    summary.ambiguous += 1
    return
  }

  const match = outcome.match

  // Somebody on this message may have been filed as an unknown sender before
  // their domain was mapped or their contact created. They are known now, so
  // drop the placeholder — otherwise the "we don't know these people" list
  // keeps naming people we do, and stops being worth reading.
  //
  // This runs on every match, not only on a new one: the message that finally
  // identifies somebody is usually one already in the mirror, so doing it after
  // the already-seen check above would mean it never ran at all.
  await clearUnknownSenders(supabase, item)

  // Only NOW is the body worth fetching. For Granola that is a second HTTP
  // request, and skipping it for everything that matched nothing is what keeps
  // a private note's contents out of this process altogether — see fetchText on
  // RawItem. It also fills in the attendees and the calendar event, which a
  // Granola list row does not carry.
  const text = item.fetchText ? await item.fetchText() : item.text

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
        detail: toSnippet(text),
        due_at: item.scheduled.startsAt,
        all_day: item.scheduled.allDay,
        origin: 'calendar',
        owner_id: credited,
        account_id: match.accountId,
        building_id: match.buildingId ?? null,
        opportunity_id: match.opportunityId ?? null,
        contact_id: match.contactId,
        source: item.source,
        external_id: item.externalId,
        created_by: actorId,
        import_batch_id: importBatchId,
      })
      .select('id')
      .single()

    if (error) throw new Error(`next step: ${error.message}`)
    nextStepId = data.id
    summary.nextStepsCreated += 1
  } else {
    const typeName = activityTypeName(item)
    const typeId = types.get(typeName)
    if (!typeId) throw new Error(`No activity type called "${typeName}"`)

    const { data, error } = await supabase
      .from('activities')
      .insert({
        activity_type_id: typeId,
        subject: item.subject || '(no subject)',
        body: toSnippet(text),
        occurred_at: item.occurredAt,
        logged_by: credited,
        // account_id may be null on a title match to a deal that has no account
        // — 28 of the 30 open deals do not have one. set_activity_account() is a
        // BEFORE trigger and fills it from the building or the deal when it can.
        // Unlike the relink, this insert does NOT go through apply_gap_fill, so
        // letting the trigger do its job here leaves nothing unjournalled.
        account_id: match.accountId,
        building_id: match.buildingId ?? null,
        opportunity_id: match.opportunityId ?? null,
        contact_id: match.contactId,
        source: item.source,
        external_id: item.externalId,
        import_batch_id: importBatchId,
      })
      .select('id')
      .single()

    if (error) throw new Error(`activity: ${error.message}`)
    activityId = data.id
    summary.activitiesCreated += 1
  }

  await writeMirror(supabase, existing?.id ?? null, {
    source: item.source,
    external_id: item.externalId,
    mailbox_id: mailboxId,
    occurred_at: item.occurredAt,
    // Inbound/outbound/internal is a mail concept. A site inspection dictated
    // into a phone has no direction, and 'internal' would be a worse answer
    // than none.
    direction: item.mailboxEmail ? directionOf(item.participants, dir) : null,
    subject: item.subject,
    snippet: toSnippet(text),
    participants: item.participants as never,
    thread_key: item.threadKey,
    status: 'linked',
    matched_by: match.confidence,
    matched_on: match.matchedOn ?? null,
    activity_id: activityId,
    next_step_id: nextStepId,
  })

  summary.ingested += 1

  proposals.push(...proposeNewContacts(item, dir, match))
}

/**
 * Write the mirror row, updating in place when one is already there.
 *
 * An explicit update-or-insert rather than an upsert: the unique key is
 * `nulls not distinct (source, external_id, mailbox_id)`, and PostgREST's
 * on_conflict does not express NULLS NOT DISTINCT — so an upsert keyed on those
 * three columns would insert a duplicate for every Granola note, which has no
 * mailbox, and the mirror would quietly stop being a mirror.
 */
async function writeMirror(
  supabase: Supabase,
  existingId: string | null,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = existingId
    ? await supabase
        .from('ingested_items')
        .update({ ...row, last_seen_at: new Date().toISOString() } as never)
        .eq('id', existingId)
    : await supabase.from('ingested_items').insert(row as never)

  if (error) throw new Error(`mirror: ${error.message}`)
}

/**
 * Which activity type this is. A keyword picks a LABEL and never a link.
 *
 * 20 of Ryan's last 24 note titles say "inspection" or "walk through", so a flat
 * "Meeting" would mislabel the bulk of them — and activity_type_id is NOT NULL,
 * so something has to be chosen.
 */
function activityTypeName(item: RawItem): string {
  if (item.source === 'outlook') return 'Email'
  if (item.source === 'granola') return activityTypeForTitle(item.subject)
  return 'Meeting'
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
