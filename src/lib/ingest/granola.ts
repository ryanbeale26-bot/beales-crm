import 'server-only'

import type { Participant, RawItem, SourceFetch } from '@/lib/ingest'

/**
 * Granola, the first real source.
 *
 * READ-ONLY, always. Nothing in this file writes to Granola, and there is no
 * code path that could — the only verbs used are GET.
 *
 * WHAT THE API ACTUALLY DOES, measured against the real account rather than
 * taken from the docs, because two of the documented facts are wrong:
 *
 *   GET /v1/notes
 *     -> { notes: [...], hasMore: boolean, cursor: string | null }
 *     `limit` IS IGNORED. Every page is 10 notes regardless of what you ask
 *     for; CLAUDE.md recorded a maximum page size of 30, which this account
 *     does not honour. 231 notes is therefore ~24 requests, not ~8. Both
 *     `updated_after` and `created_after` work and correctly return
 *     hasMore: false with a null cursor when the filtered set fits on one page.
 *
 *   GET /v1/notes/{id}
 *     -> the note plus `summary_text`, `summary_markdown`, `attendees`,
 *        `calendar_event`, `transcript`.
 *     `summary_text` is already plain text, so no markup stripping is needed.
 *     `transcript` is null unless asked for, and this file never asks.
 *
 * A LIST ROW HAS NO ATTENDEES AND NO CALENDAR EVENT. That is what makes the
 * lazy `fetchText` on RawItem worth its keep: the title is enough to match on,
 * so a note that matches nothing never has its body fetched. Given that the
 * notes which match nothing are, by construction, the private ones — the
 * sampled summaries name staff members' medical appointments — that is a
 * meaningful difference rather than a saved request.
 *
 * The join to Phase 7b's calendar is `calendar_event.calendar_event_id`, NOT
 * `iCalUId`: this account is on Google Calendar and reports a Google event id.
 * CLAUDE.md predicted iCalUId. Recorded here so 7b matches on the right field.
 */

const BASE_URL = 'https://public-api.granola.ai/v1'

/**
 * 5 requests per second sustained, 25 per 5 seconds in burst. One in-flight
 * request at a time with a 200ms floor between them stays inside both without
 * needing to model the bucket — and a nightly run sees one or two notes, so the
 * only caller this costs anything is the backfill, which is a local script with
 * no deadline worth defending.
 */
const MIN_INTERVAL_MS = 200

let nextAllowedAt = 0

async function throttled(url: string, apiKey: string): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const wait = Math.max(0, nextAllowedAt - Date.now())
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    nextAllowedAt = Date.now() + MIN_INTERVAL_MS

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      // Never cached: a nightly job asking for "what changed" must not be
      // served last night's answer.
      cache: 'no-store',
    })

    if (response.status !== 429 || attempt >= 3) return response

    // Honour Retry-After when it is offered, and back off when it is not.
    const retryAfter = Number(response.headers.get('retry-after'))
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 1000
    nextAllowedAt = Date.now() + backoff
  }
}

async function getJson<T>(path: string, apiKey: string): Promise<T> {
  const response = await throttled(`${BASE_URL}${path}`, apiKey)
  if (!response.ok) {
    // The body often says something useful ("invalid api key"), and a bare
    // status code in a cron log is a wasted night.
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Granola ${path.split('?')[0]} returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }
  return (await response.json()) as T
}

type GranolaPerson = { name?: string | null; email?: string | null }

export type GranolaNote = {
  id: string
  title?: string | null
  owner?: GranolaPerson | null
  created_at: string
  updated_at?: string | null
}

type GranolaNoteDetail = GranolaNote & {
  summary_text?: string | null
  summary_markdown?: string | null
  attendees?: GranolaPerson[] | null
  calendar_event?: {
    event_title?: string | null
    organiser?: string | null
    invitees?: GranolaPerson[] | null
    calendar_event_id?: string | null
    scheduled_start_time?: string | null
    scheduled_end_time?: string | null
  } | null
}

type NoteListPage = { notes?: GranolaNote[]; hasMore?: boolean; cursor?: string | null }

export type ListOptions = {
  apiKey: string
  /** ISO. Notes touched since then — the nightly filter. */
  updatedAfter?: string | null
  /** ISO. Notes created since then — what a backfill bounds itself by. */
  createdAfter?: string | null
  /** Epoch ms. Stop asking for more pages once past it. A deadline is a pause:
   *  the mirror makes the next run resume where this one stopped. */
  deadline?: number
  /** A ceiling on pages, so a bug in the cursor cannot walk forever. */
  maxPages?: number
}

/**
 * Every note matching the filter, oldest page first as the API returns them.
 *
 * Returns `truncated` rather than throwing when it stops early, so a caller can
 * say so out loud. A page that silently stops short is the silent-cap mistake
 * this app has a rule against.
 */
export async function listGranolaNotes(
  options: ListOptions,
): Promise<{ notes: GranolaNote[]; truncated: boolean }> {
  const notes: GranolaNote[] = []
  const maxPages = options.maxPages ?? 200
  let cursor: string | null = null
  let truncated = false

  for (let page = 0; page < maxPages; page += 1) {
    if (options.deadline && Date.now() > options.deadline) {
      truncated = true
      break
    }

    const query = new URLSearchParams()
    if (options.updatedAfter) query.set('updated_after', options.updatedAfter)
    if (options.createdAfter) query.set('created_after', options.createdAfter)
    if (cursor) query.set('cursor', cursor)

    const body = await getJson<NoteListPage>(`/notes?${query.toString()}`, options.apiKey)
    notes.push(...(body.notes ?? []))

    if (!body.hasMore || !body.cursor) return { notes, truncated }
    cursor = body.cursor
    if (page === maxPages - 1) truncated = true
  }

  return { notes, truncated }
}

/** One note, in full. Called only for a note that has already matched. */
export async function fetchGranolaNote(id: string, apiKey: string): Promise<GranolaNoteDetail> {
  return getJson<GranolaNoteDetail>(`/notes/${encodeURIComponent(id)}`, apiKey)
}

function participantsOf(note: GranolaNote, detail: GranolaNoteDetail | null): Participant[] {
  const seen = new Set<string>()
  const out: Participant[] = []

  const add = (person: GranolaPerson | null | undefined, role: Participant['role']) => {
    const address = person?.email?.trim().toLowerCase()
    if (!address || seen.has(address)) return
    seen.add(address)
    out.push({ address, name: person?.name?.trim() || null, role })
  }

  // The note's owner is whoever captured it, which is whose work it was — so
  // 'organizer', the role creditTo() ranks first after 'from'. For Granola that
  // is a personal Gmail address, which is exactly why profile_email_aliases
  // exists: without it this credits nobody and the activity reads "logged by
  // Nightly ingest".
  add(note.owner, 'organizer')
  for (const attendee of detail?.attendees ?? []) add(attendee, 'attendee')
  for (const invitee of detail?.calendar_event?.invitees ?? []) add(invitee, 'attendee')

  return out
}

/**
 * When the note is about.
 *
 * The calendar event's start time is the real answer when there is one — a note
 * captured at 08:25 for an 08:30 site walk should sit at 08:30. `created_at` is
 * the fallback, and it also acts as the guard: a start time in the future would
 * put a future-dated row at the top of every timeline and make the account read
 * as touched today, which is the whole reason `next_steps` is a separate table.
 *
 * Nothing here reads a date out of the TITLE, ever. One real note is called
 * "Wound center inspection 8-5-2027" and was captured in 2026.
 */
function occurredAtOf(note: GranolaNote, detail: GranolaNoteDetail | null): string {
  const scheduled = detail?.calendar_event?.scheduled_start_time
  if (scheduled) {
    const at = new Date(scheduled)
    if (!Number.isNaN(at.valueOf()) && at.valueOf() <= Date.now()) return at.toISOString()
  }
  return new Date(note.created_at).toISOString()
}

/**
 * A list row, as the matcher wants it.
 *
 * `text` is left null and `fetchText` is set instead. Calling it fetches the
 * detail, which is where the summary, the attendees and the calendar event all
 * live — so a matched note gains its participants and its thread key at the
 * same moment it gains its snippet, and an unmatched note gains none of them.
 */
export function granolaListItem(note: GranolaNote, apiKey: string): RawItem {
  const item: RawItem = {
    source: 'granola',
    externalId: note.id,
    // Granola is not a mailbox. `unique nulls not distinct` on the mirror is
    // what stops a null here re-inserting the same note on every single run.
    mailboxEmail: null,
    occurredAt: occurredAtOf(note, null),
    subject: (note.title ?? '').trim(),
    text: null,
    participants: participantsOf(note, null),
    threadKey: null,
    scheduled: null,
    fetchText: async () => {
      const detail = await fetchGranolaNote(note.id, apiKey)
      // Fill in everything the list row could not know, now that it is worth a
      // request. Mutating the item is deliberate: the caller holds this object
      // and writes the mirror row from it after the text arrives.
      item.occurredAt = occurredAtOf(note, detail)
      item.participants = participantsOf(note, detail)
      item.threadKey = detail.calendar_event?.calendar_event_id ?? null
      // summary_text is already plain. summary_markdown is the same content with
      // list markers, so it is only a fallback.
      return detail.summary_text ?? detail.summary_markdown ?? null
    },
  }

  return item
}

/**
 * The nightly source.
 *
 * `updated_after` rather than `created_after`: a note edited after the night it
 * was captured should be re-seen, and the mirror makes a re-seen note a
 * timestamp touch rather than a second activity.
 */
export function makeGranolaSource(apiKey: string): SourceFetch {
  return async ({ since, deadline }) => {
    const { notes, truncated } = await listGranolaNotes({
      apiKey,
      updatedAfter: since,
      deadline,
    })

    return {
      items: notes.map((note) => granolaListItem(note, apiKey)),
      // No durable cursor yet, and deliberately so: idempotency lives in
      // ingested_items, which is one fact rather than two that can disagree.
      // `truncated` is reported so a short run is visible rather than silent.
      cursor: truncated ? 'truncated' : null,
    }
  }
}
