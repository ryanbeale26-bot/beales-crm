import 'server-only'

import type { Mailbox } from '@/lib/ingest/mailboxes'
import type {
  CalendarWindow,
  Participant,
  ParticipantRole,
  RawItem,
  SourceFetch,
} from '@/lib/ingest'

/**
 * Microsoft Graph — mail and calendar.
 *
 * Every shape below was measured with `npm run graph:probe` against the real
 * tenant on 2026-08-19, and the recurrence rules again on 2026-08-20, not taken
 * from documentation. Several are not what the docs imply, and each is commented
 * where it bites.
 *
 * What this deliberately does NOT do:
 *
 *   - It never asks for a message body. `bodyPreview` is all it selects, which
 *     Graph caps at 255 characters. That makes "no full bodies, ever" a fact
 *     about the network traffic rather than a promise about our storage — there
 *     is no copy to leak because there is no copy.
 *   - It holds no cursor or delta token. Idempotency is `ingested_items`, which
 *     is one fact rather than two that can disagree, and a two-day lookback is
 *     enough slack for a nightly job that missed a night.
 *   - It does not try to reconcile a meeting against a Granola note. Measured:
 *     1 of 17 notes carried a calendar event at all, and that one matched no
 *     Outlook meeting. The collision that a join would prevent has no real
 *     example, so it is written down rather than built. If a meeting ever does
 *     show up twice in /review, build it then, against a case to test with.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0'
const LOGIN = 'https://login.microsoftonline.com'

/** Nothing here should take twenty seconds; reaching it means broken, not slow. */
const TIMEOUT_MS = 20_000

/** Graph pages at whatever it likes; this bounds a runaway follow-the-link loop. */
const MAX_PAGES = 20
const PAGE_SIZE = 50

/** How far ahead to read the calendar. Future events become next steps, which is
 *  what fills the dashboard's Today strip.
 *
 *  Thirty days is a long way for a book of standing meetings, and deliberately
 *  so: it is what makes a recurring series VISIBLE. What stops it being noisy is
 *  collapseRecurringSeries below, which keeps only the next occurrence of each. */
const FORWARD_DAYS = 30

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type GraphCredentials = { tenantId: string; clientId: string; clientSecret: string }

/** Cached for the life of the process. A token lasts about an hour and a run
 *  lasts seconds, so this is one fetch per invocation rather than one per call. */
let cached: { token: string; expiresAt: number } | null = null

async function accessToken(creds: GraphCredentials): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const response = await fetch(`${LOGIN}/${creds.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })

  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }

  if (!response.ok || !body.access_token) {
    // The description names the actual problem — AADSTS7000215 is a wrong
    // secret, AADSTS700016 a wrong client id, AADSTS90002 a wrong tenant. A
    // bare status code in a cron log is a wasted night.
    throw new Error(
      `Graph token request failed (${response.status}): ${body.error ?? 'unknown'} ${body.error_description ?? ''}`.trim(),
    )
  }

  cached = {
    token: body.access_token,
    // A minute of margin, so a long run cannot expire mid-flight.
    expiresAt: Date.now() + Math.max((body.expires_in ?? 3600) - 60, 60) * 1000,
  }
  return cached.token
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

type Page = { value?: unknown[]; '@odata.nextLink'?: string }
type Fetched = { items: Record<string, unknown>[]; status: number; truncated: boolean }

async function getPages(token: string, url: string, deadline: number): Promise<Fetched> {
  const items: Record<string, unknown>[] = []
  let next: string | null = url
  let truncated = false

  for (let page = 0; next; page += 1) {
    if (page >= MAX_PAGES || Date.now() > deadline) {
      truncated = true
      break
    }

    let response: Response
    try {
      response = await fetch(next, {
        headers: {
          authorization: `Bearer ${token}`,
          // Ask for UTC explicitly. Without it Graph answers in the mailbox's
          // own zone and the dateTime field carries no marker to say which.
          Prefer: 'outlook.timezone="UTC"',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (caught) {
      const why = caught instanceof Error ? caught.message : String(caught)
      throw new Error(`Graph did not answer within ${TIMEOUT_MS / 1000}s (${why})`)
    }

    // Throttled. Graph says when to come back; obey it rather than guessing.
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'))
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000
      if (Date.now() + wait > deadline) return { items, status: 429, truncated: true }
      await new Promise((resolve) => setTimeout(resolve, wait))
      continue
    }

    if (!response.ok) return { items, status: response.status, truncated }

    const body = (await response.json()) as Page
    items.push(...((body.value ?? []) as Record<string, unknown>[]))
    next = body['@odata.nextLink'] ?? null
  }

  return { items, status: 200, truncated }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

type Address = { emailAddress?: { address?: string | null; name?: string | null } | null }

function participant(entry: Address | null | undefined, role: ParticipantRole): Participant | null {
  const address = entry?.emailAddress?.address?.trim()
  if (!address) return null
  return { address, name: entry?.emailAddress?.name?.trim() || null, role }
}

function participants(
  entries: unknown,
  role: ParticipantRole,
): Participant[] {
  if (!Array.isArray(entries)) return []
  return entries
    .map((entry) => participant(entry as Address, role))
    .filter((p): p is Participant => p !== null)
}

/**
 * Graph returns a calendar time as `"2026-08-06T15:00:00.0000000"` with the zone
 * in a SIBLING field and no marker on the string itself — so `new Date()` reads
 * it as LOCAL time. In Boston that is every meeting four or five hours out,
 * silently, for ever. This is the single most dangerous line in the file.
 *
 * Mail is not affected: receivedDateTime already ends in Z.
 */
export function graphTime(value: string, timeZone?: string | null): string {
  // JavaScript accepts at most three fractional digits; Graph sends seven.
  const trimmed = value.replace(/\.(\d{3})\d*$/, '.$1')
  const zoned = /(Z|[+-]\d{2}:\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`

  const zone = (timeZone ?? 'UTC').trim().toUpperCase()
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(trimmed) && zone !== 'UTC') {
    // We asked for UTC with a Prefer header. Getting something else means an
    // assumption broke, and guessing an offset would be worse than stopping.
    throw new Error(`Graph returned a time in ${timeZone}, not UTC — refusing to guess`)
  }

  const parsed = new Date(zoned)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Unparseable Graph time: ${value}`)
  return parsed.toISOString()
}

const MESSAGE_SELECT = [
  'internetMessageId',
  'conversationId',
  'subject',
  'bodyPreview',
  'receivedDateTime',
  'from',
  'toRecipients',
  'ccRecipients',
  'isDraft',
].join(',')

const EVENT_SELECT = [
  'iCalUId',
  'subject',
  'bodyPreview',
  'start',
  'isAllDay',
  'isCancelled',
  'organizer',
  'attendees',
  'type',
  'originalStart',
  'seriesMasterId',
].join(',')

function messageToItem(raw: Record<string, unknown>, mailbox: Mailbox): RawItem | null {
  // Graph's own `id` changes when a message is filed into another folder, which
  // would re-ingest it as new. internetMessageId is stable for the message's
  // whole life and is what the mirror is keyed on.
  const externalId = typeof raw.internetMessageId === 'string' ? raw.internetMessageId : ''
  const received = typeof raw.receivedDateTime === 'string' ? raw.receivedDateTime : ''
  if (!externalId || !received) return null
  if (raw.isDraft === true) return null // Not sent is not communication.

  return {
    source: 'outlook',
    externalId,
    mailboxEmail: mailbox.address,
    occurredAt: graphTime(received),
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    text: typeof raw.bodyPreview === 'string' ? raw.bodyPreview : null,
    participants: [
      ...[participant(raw.from as Address, 'from')].filter((p): p is Participant => p !== null),
      ...participants(raw.toRecipients, 'to'),
      ...participants(raw.ccRecipients, 'cc'),
    ],
    threadKey: typeof raw.conversationId === 'string' ? raw.conversationId : null,
  }
}

/**
 * What identifies one meeting, for ever.
 *
 * MEASURED against the real tenant on 2026-08-20, replacing a note that said
 * this path had never met real data. It has now, and recurrence is not the edge
 * case that note assumed: of 48 events in one nightly window, 40 were
 * occurrences, across 11 distinct series. The earlier reading of "every event is
 * a singleInstance" came from a probe capped at $top=5.
 *
 * Two things the documentation gets wrong, neither of them harmful:
 *   - originalStart IS populated on an occurrence, so the schema's rule holds.
 *   - occurrences do NOT share the series master's iCalUId. Graph gives each its
 *     own — 40 ids for 40 occurrences — so the suffix below was already belt and
 *     braces rather than the thing keeping them apart. It stays, because a
 *     tenant that behaves the documented way would need it.
 *
 * The suffix is the ORIGINAL start, never the current one, which is what lets a
 * rescheduled occurrence still be recognised as itself after it moves.
 *
 * Lifted out of `eventToItem` so the absence sweep can build its seen-set with
 * exactly this rule rather than a second copy of it. Two spellings of "which
 * meeting is this" would eventually disagree, and here the disagreement would
 * read as every occurrence of a series being cancelled at once.
 */
export function calendarExternalId(raw: Record<string, unknown>): string | null {
  const iCalUId = typeof raw.iCalUId === 'string' ? raw.iCalUId : ''
  if (!iCalUId) return null

  const occurrence =
    (raw.type === 'occurrence' || raw.type === 'exception') &&
    typeof raw.originalStart === 'string'
      ? `/${raw.originalStart}`
      : ''

  return `${iCalUId}${occurrence}`
}

/** Graph's own word for "this meeting is off". Its own function because the
 *  mailbox loop needs the same test BEFORE collapsing, and `eventToItem` keeps
 *  its own copy as belt and braces. */
export function isCancelledEvent(raw: Record<string, unknown>): boolean {
  return raw.isCancelled === true
}

function eventToItem(raw: Record<string, unknown>, mailbox: Mailbox): RawItem | null {
  const externalId = calendarExternalId(raw)
  const start = raw.start as { dateTime?: string; timeZone?: string } | undefined
  if (!externalId || !start?.dateTime) return null
  // Belt and braces: the mailbox loop now filters these out before collapsing,
  // so nothing cancelled should reach here at all. Kept because this function is
  // not private to that loop, and a cancelled meeting must never become an
  // activity by some other route.
  if (isCancelledEvent(raw)) return null

  const startsAt = graphTime(start.dateTime, start.timeZone)

  return {
    source: 'outlook_calendar',
    externalId,
    mailboxEmail: mailbox.address,
    occurredAt: startsAt,
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    text: typeof raw.bodyPreview === 'string' ? raw.bodyPreview : null,
    participants: [
      ...[participant(raw.organizer as Address, 'organizer')].filter(
        (p): p is Participant => p !== null,
      ),
      ...participants(raw.attendees, 'attendee'),
    ],
    // The bare iCalUId, NOT the occurrence-suffixed external id: the thread key
    // is what ties every occurrence of a series together, so suffixing it would
    // make each occurrence a thread of its own.
    threadKey: typeof raw.iCalUId === 'string' ? raw.iCalUId : null,
    // run.ts decides from this: still ahead of us is a next step, already past
    // is an activity.
    scheduled: { startsAt, allDay: raw.isAllDay === true },
  }
}

/**
 * One row per recurring series that is still ahead of us, not one per occurrence.
 *
 * `calendarView` expands a series across the whole window, which is what makes
 * a standing meeting visible at all — and, left alone, what would make it
 * deafening. Measured on 2026-08-20: Ryan's next thirty days hold 35 future
 * occurrences belonging to 11 series, so the first night matching worked, one
 * weekly site meeting would have written five next steps and the Today strip
 * would have opened full of the same title five times over.
 *
 * The rule:
 *
 *   - Everything that has ALREADY STARTED is kept, every one of it. Each of
 *     those meetings really did happen separately and deserves its own activity.
 *     The two-day lookback means there is rarely more than one per series.
 *   - Of what is still ahead, only the EARLIEST of each series survives. One
 *     standing meeting, one live next step.
 *   - A single instance has no series and is never touched.
 *
 * It is stable across runs rather than merely smaller: the earliest future
 * occurrence is still the earliest two hours later, so the second nightly pass
 * sees the same external_id and touches a timestamp. Once it has passed, the one
 * after it becomes earliest and gets a next step of its own — the series rolls
 * forward a meeting at a time instead of arriving all at once.
 */
export function collapseRecurringSeries(
  events: Record<string, unknown>[],
  now: number,
): Record<string, unknown>[] {
  const earliestAhead = new Map<string, { at: number; event: Record<string, unknown> }>()
  const kept: Record<string, unknown>[] = []

  for (const event of events) {
    const series = typeof event.seriesMasterId === 'string' ? event.seriesMasterId : null
    const start = (event.start as { dateTime?: string; timeZone?: string } | undefined) ?? undefined

    // No series, or nothing to compare on: not this function's business.
    if (!series || !start?.dateTime) {
      kept.push(event)
      continue
    }

    let at: number
    try {
      at = new Date(graphTime(start.dateTime, start.timeZone)).getTime()
    } catch {
      // graphTime refuses rather than guesses on a non-UTC answer. Keep the
      // event and let eventToItem raise for real, rather than silently dropping
      // a meeting because we could not read its clock.
      kept.push(event)
      continue
    }

    if (at <= now) {
      kept.push(event)
      continue
    }

    const best = earliestAhead.get(series)
    if (!best || at < best.at) earliestAhead.set(series, { at, event })
  }

  for (const { event } of earliestAhead.values()) kept.push(event)
  return kept
}

// ---------------------------------------------------------------------------

/**
 * One source across every mailbox the access policy will allow.
 *
 * The mailbox list says who we ASK for; the ApplicationAccessPolicy in Exchange
 * decides who we get. A 403 is the expected, correct answer for anybody outside
 * the ingest group, so it is counted rather than raised — but if NOTHING is
 * readable the job can never do anything, and that is worth failing loudly.
 */
export function makeGraphSource(creds: GraphCredentials, mailboxes: Mailbox[]): SourceFetch {
  return async ({ since, deadline }) => {
    const token = await accessToken(creds)
    const items: RawItem[] = []
    const calendar: CalendarWindow[] = []
    const denied: string[] = []
    const failures: string[] = []
    let reachable = 0
    let truncated = false

    const until = new Date(Date.now() + FORWARD_DAYS * 86_400_000).toISOString()

    for (const mailbox of mailboxes) {
      if (Date.now() > deadline) {
        truncated = true
        break
      }

      const who = encodeURIComponent(mailbox.address)

      // Inbox and Sent Items by name rather than /messages across everything,
      // which would also sweep in Junk and Deleted Items. A spoofed message from
      // a known contact's address sitting in Junk should not become an activity.
      const mailUrls = ['inbox', 'sentitems'].map(
        (folder) =>
          `${GRAPH}/users/${who}/mailFolders/${folder}/messages` +
          `?$select=${MESSAGE_SELECT}&$top=${PAGE_SIZE}` +
          `&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`,
      )

      const calendarUrl =
        `${GRAPH}/users/${who}/calendarView` +
        `?startDateTime=${encodeURIComponent(since)}&endDateTime=${encodeURIComponent(until)}` +
        `&$select=${EVENT_SELECT}&$top=${PAGE_SIZE}`

      let allowed = false

      for (const url of mailUrls) {
        const page = await getPages(token, url, deadline)
        if (page.status === 403) {
          denied.push(mailbox.address)
          break
        }
        if (page.status !== 200) {
          failures.push(`${mailbox.address}: HTTP ${page.status}`)
          break
        }
        allowed = true
        if (page.truncated) truncated = true
        for (const raw of page.items) {
          const item = messageToItem(raw, mailbox)
          if (item) items.push(item)
        }
      }

      if (allowed) {
        const page = await getPages(token, calendarUrl, deadline)
        if (page.status === 200) {
          if (page.truncated) truncated = true

          // Cancelled events are separated FIRST, before the collapse, and that
          // order is load-bearing. `eventToItem` has always dropped them, but it
          // runs afterwards — so cancelling the next occurrence of a weekly
          // series meant the collapse elected that occurrence, it was then
          // discarded, and the occurrence AFTER it got no next step that night.
          // The series went quiet and nothing anywhere said why.
          const live: Record<string, unknown>[] = []
          const cancelled: string[] = []
          const present: string[] = []

          for (const raw of page.items) {
            const externalId = calendarExternalId(raw)
            if (externalId) present.push(externalId)
            if (isCancelledEvent(raw)) {
              if (externalId) cancelled.push(externalId)
              continue
            }
            live.push(raw)
          }

          // Collapse BEFORE mapping. One `now` for the whole mailbox, so a slow
          // page cannot make two occurrences of one series both look earliest.
          for (const raw of collapseRecurringSeries(live, Date.now())) {
            const item = eventToItem(raw, mailbox)
            if (item) items.push(item)
          }

          // Vouch for this window only if we genuinely saw all of it. A
          // truncated page holds real events and looks complete, so inferring
          // absence from one would flag meetings that are merely on page two —
          // the most dangerous thing this file could get wrong.
          //
          // `present` is built from the PRE-collapse list on purpose: the
          // collapse keeps one occurrence per series, so a sweep against what
          // survives it would report every other occurrence as cancelled.
          if (!page.truncated) {
            calendar.push({
              mailboxEmail: mailbox.address,
              from: since,
              to: until,
              present,
              cancelled,
            })
          }
        } else if (page.status !== 403) {
          failures.push(`${mailbox.address} calendar: HTTP ${page.status}`)
        }
        reachable += 1
      }
    }

    if (reachable === 0) {
      // Either the policy allows nobody, or something is wrong with the app
      // registration. Both mean tonight achieved nothing and tomorrow will too.
      throw new Error(
        `No mailbox was readable. Denied: ${denied.join(', ') || 'none'}.` +
          (failures.length ? ` Errors: ${failures.join('; ')}` : '') +
          ' Check the ApplicationAccessPolicy.',
      )
    }

    // Anything that went wrong for SOME mailbox, when others worked, is worth
    // recording without losing the mailboxes that did work.
    if (failures.length > 0) console.error(`Graph: ${failures.join('; ')}`)

    return { items, cursor: truncated ? 'truncated' : null, calendar }
  }
}
