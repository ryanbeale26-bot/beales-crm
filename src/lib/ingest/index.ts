import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'

export type Supabase = SupabaseClient<Database>

export type IngestSource = Database['public']['Enums']['activity_source']
export type MatchConfidence = Database['public']['Enums']['match_confidence']
export type SuggestionKind = Database['public']['Enums']['suggestion_kind']
export type IngestItemStatus = Database['public']['Enums']['ingest_item_status']

/** Where an address sat on the message. `from` and `organizer` are the ones
 *  that say who did something; the rest say who was told about it. */
export type ParticipantRole = 'from' | 'to' | 'cc' | 'organizer' | 'attendee'

export type Participant = {
  address: string
  name: string | null
  role: ParticipantRole
}

/**
 * What every source hands back, whatever it actually is underneath.
 *
 * This is the seam that lets Phase 7a run entirely on fixture files and Phase
 * 7b swap in Microsoft Graph without touching the matcher, the suggestion
 * engine or any screen. A source module exports one function returning these;
 * nothing downstream knows or cares which one produced them.
 */
export type RawItem = {
  source: IngestSource
  /**
   * Stable across re-runs, and NOT the provider's object id — see the migration.
   * Mail uses internetMessageId, because Graph's message.id changes when a
   * message is filed. Calendar uses iCalUId.
   */
  externalId: string
  /** Whose mailbox this came from. Null for Granola, which is not a mailbox. */
  mailboxEmail: string | null
  occurredAt: string
  subject: string
  /**
   * Plain text, already stripped of markup by the source.
   *
   * How much of it is stored depends on the source — see `BODY_LIMIT`. This
   * comment used to say "the full text never lands in the database", which was
   * a promise about MAIL and is still kept for mail: graph.ts only ever asks
   * for `bodyPreview`, so there is no full message to store. A Granola note is
   * ours, was fetched whole anyway, and is kept whole.
   */
  text: string | null
  /**
   * Fetch the text on demand, for a source where it costs an extra request.
   *
   * Set INSTEAD of `text`, and the caller only ever calls it AFTER a match. That
   * is not an optimisation, or not only: Granola's list endpoint returns the
   * title but not the summary, and roughly a quarter of the notes in it are
   * Ryan's own medical appointments and family arrangements. Fetching lazily
   * means the body of a note that matched nothing is never downloaded at all,
   * let alone stored — the privacy promise expressed as control flow rather than
   * as a comment somebody could quietly stop honouring.
   *
   * `graph.ts` will not set this: a Graph message arrives with its body already.
   */
  fetchText?: () => Promise<string | null>
  participants: Participant[]
  /** Conversation id or iCalUId: what ties a reply to its thread and a Granola
   *  note to the meeting it came from. */
  threadKey: string | null
  /** Set when this is a future-dated calendar event rather than something that
   *  has already happened. Drives next_steps instead of activities. */
  scheduled?: { startsAt: string; allDay: boolean } | null
}

export type SourceFetch = (options: {
  since: string
  deadline: number
}) => Promise<{ items: RawItem[]; cursor: string | null }>

/** How much of a message body is kept. Enough to review a suggestion against,
 *  and nowhere near enough to be a mail archive. */
export const SNIPPET_LENGTH = 500

/** The ellipsis rule, in one place, so the two callers below cannot come to
 *  disagree about what a cut looks like. */
function cap(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`
}

/**
 * How much of a BODY is kept, per source. Null means all of it.
 *
 * Granola is the only null, and that is a statement about what a Granola note
 * is: a summary somebody dictated about one of our own buildings, downloaded in
 * full by `granola.ts` and then thrown away at 500 characters for no gain. The
 * median summary is about 1,400 characters, so the cap was keeping roughly two
 * thirds of the average note.
 *
 * Mail stays capped, and that is a statement about what a mailbox is: not ours
 * to archive. It costs nothing today either way — `graph.ts` asks only for
 * `bodyPreview`, which Graph caps at 255 — so 500 here is a stated ceiling
 * rather than an active cut.
 *
 * A Record over the enum rather than a switch or a default: adding a value to
 * `activity_source` makes THIS OBJECT fail to compile, naming the source it is
 * missing. Same guarantee an exhaustive switch buys, written as a table.
 *
 * It is keyed on the ITEM's source, never on the source descriptor `runIngest`
 * is handed. That descriptor's `name` is a display string: one connector called
 * `graph` emits both `outlook` and `outlook_calendar` items, and the fixture
 * source emits items marked `outlook` too — so keying off it would cap two rows
 * differently that are identical in every field anyone can see.
 */
export const BODY_LIMIT: Record<IngestSource, number | null> = {
  granola: null,
  manual: SNIPPET_LENGTH,
  gmail: SNIPPET_LENGTH,
  outlook: SNIPPET_LENGTH,
  imessage: SNIPPET_LENGTH,
  google_calendar: SNIPPET_LENGTH,
  outlook_calendar: SNIPPET_LENGTH,
  cowork: SNIPPET_LENGTH,
  phone: SNIPPET_LENGTH,
  system: SNIPPET_LENGTH,
}

/**
 * One line, 500 characters: the review aid.
 *
 * What the mirror row and a suggestion are read against on /review and
 * /admin/ingest, where a screenful of rows has to stay scannable. Deliberately
 * NOT what lands on the activity — see `toBody`. The flattening is the point
 * here and the bug there.
 */
export function toSnippet(text: string | null): string | null {
  if (!text) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return null
  return cap(flat, SNIPPET_LENGTH)
}

/**
 * What lands in `activities.body`: the note as it was written.
 *
 * Keeps the shape, because a Granola summary is not a paragraph — it is a
 * headed, bulleted document of several sections, and flattening it to one line
 * is what makes 1,400 characters unreadable. Multi-line bodies are not new to
 * the column: the workbook importer has always joined an outcome and a next
 * step with a blank line, and both render sites already use
 * `whitespace-pre-wrap`.
 *
 * CRLF is normalised FIRST, and that order is load-bearing: tidy the spaces
 * before that and the stray `\r` is eaten as one of them, so the rule reads as
 * though it never did anything.
 *
 * Leading indentation SURVIVES. It looks like whitespace worth collapsing and
 * is not: once `granola.ts` has taken the list markers off the markdown
 * fallback, a sub-point's indent is the only thing left saying it was a
 * sub-point. Tabs become two spaces so one nesting level is one nesting level
 * however it was typed.
 */
export function toBody(source: IngestSource, text: string | null): string | null {
  if (!text) return null
  const tidy = text
    .replace(/\r\n?/g, '\n') // a lone \r would otherwise render as a blank line
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return '' // truly blank, so the run-collapse below can see it
      const indent = (line.match(/^[^\S\n]*/)?.[0] ?? '').replace(/\t/g, '  ')
      return indent + line.trim().replace(/[^\S\n]+/g, ' ')
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // at most one blank line between blocks
    .trim()
  if (tidy === '') return null
  const limit = BODY_LIMIT[source]
  return limit === null ? tidy : cap(tidy, limit)
}

/**
 * The title a calendar item becomes.
 *
 * One expression, used by the INSERT in run.ts and by `nextStepPatch` below, so
 * the two cannot come to disagree about what an untitled meeting is called —
 * and so neither can ever produce `''`, which `next_steps.title` has a check
 * constraint against.
 */
export function nextStepTitle(item: RawItem): string {
  return item.subject || 'Meeting'
}

/** Just enough of a `next_steps` row to decide whether it still matches its
 *  calendar event. Read through the mirror's embed in run.ts. */
export type ScheduledNextStep = {
  status: string
  title: string
  due_at: string | null
  all_day: boolean
}

export type NextStepPatch = { title?: string; due_at?: string; all_day?: boolean }

/**
 * What a moved or renamed calendar event should change on its next step. Null
 * means there is nothing to do.
 *
 * `20260818090000_ingest.sql` always claimed a moved event "is updated rather
 * than duplicated". The unique key stopped the duplication; nothing performed
 * the update, so a meeting dragged from Tuesday to Thursday read as Tuesday for
 * ever and then sat in "Still open" as though it had been missed.
 *
 * Three rules, and each is load-bearing:
 *
 *   - **Only an OPEN row is touched.** Closing one was a decision, and a nightly
 *     job that quietly reopens it is how somebody stops trusting the strip. It
 *     also protects `collapseRecurringSeries`: a dismissal is *meant* to hold
 *     for as long as that occurrence is the earliest one still ahead, so
 *     reviving it on a move would undo the documented "not this week" behaviour.
 *
 *   - **`due_at` is compared as an INSTANT, never as a string.** This is the
 *     line the whole feature turns on. Postgres hands back
 *     `2026-08-27T14:00:00+00:00`; the item carries `2026-08-27T14:00:00.000Z`.
 *     They are the same moment and different text, so a string comparison would
 *     report a change every single night — an audit row per meeting per run, and
 *     a "rescheduled" count that means nothing.
 *
 *   - **`detail` is deliberately absent.** Nothing in the app renders it, so
 *     keeping it current would be audit-log noise and nothing else. `title`,
 *     `due_at` and `all_day` are exactly what the dashboard strip draws.
 *
 * Pure on purpose: no database, no clock, no network. That is what lets
 * `graph:probe --selftest` pin every one of these rules on a machine with no
 * credentials at all.
 */
export function nextStepPatch(current: ScheduledNextStep, item: RawItem): NextStepPatch | null {
  // Mail and Granola never carry a schedule and never reach this.
  if (!item.scheduled) return null
  if (current.status !== 'open') return null

  const patch: NextStepPatch = {}

  const title = nextStepTitle(item)
  if (current.title !== title) patch.title = title

  if (!sameInstant(current.due_at, item.scheduled.startsAt)) patch.due_at = item.scheduled.startsAt
  if (current.all_day !== item.scheduled.allDay) patch.all_day = item.scheduled.allDay

  return Object.keys(patch).length > 0 ? patch : null
}

/** Same moment, however it happens to be written. A null due_at — which no
 *  calendar row should ever have, but the column allows — counts as different,
 *  so the move is written rather than skipped. */
function sameInstant(a: string | null, b: string): boolean {
  if (a === null) return false
  const left = new Date(a).getTime()
  const right = new Date(b).getTime()
  return Number.isFinite(left) && Number.isFinite(right) && left === right
}
