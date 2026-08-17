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
  /** Plain text, already stripped of markup by the source. Trimmed to a snippet
   *  before it is stored — the full text never lands in the database. */
  text: string | null
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

export function toSnippet(text: string | null): string | null {
  if (!text) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return null
  return flat.length <= SNIPPET_LENGTH ? flat : `${flat.slice(0, SNIPPET_LENGTH - 1)}…`
}
