import type { MatchConfidence, SuggestionKind, Supabase } from '@/lib/ingest'

/**
 * What the review screen shows, fetched once and used by both the full page and
 * the dashboard panel — the same rule as `src/lib/reports/*`, and the only
 * reliable way to stop two screens disagreeing about the same number.
 */

export type OpenSuggestion = {
  id: string
  kind: SuggestionKind
  confidence: MatchConfidence
  subjectTable: string
  subjectId: string | null
  payload: Record<string, unknown>
  rationale: string
  quote: string | null
  createdAt: string
  expiresAt: string | null
  /** What the suggestion is about, in words, resolved for display. */
  label: string
  href: string | null
}

export type ReviewData = {
  suggestions: OpenSuggestion[]
  total: number
  error?: string
}

const KIND_LABEL: Record<SuggestionKind, string> = {
  link_activity: 'Link an activity',
  create_contact: 'Add a contact',
  field_value: 'Fill in a field',
  next_step: 'Add a next step',
}

export function kindLabel(kind: SuggestionKind): string {
  return KIND_LABEL[kind]
}

/**
 * Confidence, said in words a person can act on rather than as a score.
 *
 * A number invites the question "is 0.8 enough?", which nobody can answer. What
 * actually matters is *what* matched, so that is what it says.
 */
export function confidenceLabel(confidence: MatchConfidence): string {
  switch (confidence) {
    // Deliberately does not name *what* matched — an address, a deal name —
    // because the rationale beside it already says, and saying "matched on an
    // email address" above a rationale about a deal name was wrong on every
    // relink row.
    case 'exact':
      return 'An exact match, not a guess'
    case 'domain':
      return 'Matched on the company domain'
    case 'inferred':
      return 'Read out of the text — check it'
  }
}

export async function fetchReview(supabase: Supabase, limit = 100): Promise<ReviewData> {
  const { data, error, count } = await supabase
    .from('ingest_suggestions')
    .select('*', { count: 'exact' })
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { suggestions: [], total: 0, error: error.message }

  const rows = data ?? []

  // Resolve the records the patches point at, so a row reads "Link the call
  // with Dana Whitfield" rather than a uuid. One query per table, not per row.
  const activityIds = rows
    .filter((r) => r.subject_table === 'activities' && r.subject_id)
    .map((r) => r.subject_id as string)

  const activities = new Map<string, string>()
  if (activityIds.length > 0) {
    const { data: acts } = await supabase
      .from('activities')
      .select('id, subject, occurred_at')
      .in('id', activityIds)
    for (const a of acts ?? []) activities.set(a.id, a.subject)
  }

  const suggestions: OpenSuggestion[] = rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>

    let label = KIND_LABEL[row.kind]
    let href: string | null = null

    if (row.subject_table === 'activities' && row.subject_id) {
      label = activities.get(row.subject_id) ?? 'An activity'
      href = '/activity'
    } else if (row.kind === 'create_contact') {
      const name = [payload.first_name, payload.last_name].filter(Boolean).join(' ')
      label = name || String(payload.email ?? 'A new contact')
    } else if (row.kind === 'next_step') {
      label = String(payload.title ?? 'A next step')
    }

    return {
      id: row.id,
      kind: row.kind,
      confidence: row.confidence,
      subjectTable: row.subject_table,
      subjectId: row.subject_id,
      payload,
      rationale: row.rationale,
      quote: row.quote,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      label,
      href,
    }
  })

  return { suggestions, total: count ?? suggestions.length }
}

/**
 * Addresses that have written more than once and belong to nobody we know.
 *
 * These are the rows the ingest deliberately refused to read: an empty subject,
 * no snippet, nothing but who wrote and when. Mapping one of their domains to
 * an account is what lets the next message from them be logged properly.
 */
export type UnknownSender = {
  address: string
  domain: string
  lastSeen: string
}

export async function fetchUnknownSenders(supabase: Supabase, limit = 25): Promise<UnknownSender[]> {
  const { data } = await supabase
    .from('ingested_items')
    .select('participants, last_seen_at')
    .eq('status', 'ignored')
    .order('last_seen_at', { ascending: false })
    .limit(limit)

  return (data ?? []).flatMap((row) => {
    const participants = (row.participants ?? []) as { address?: string }[]
    const address = participants[0]?.address
    if (!address) return []
    return [{ address, domain: address.split('@')[1] ?? '', lastSeen: row.last_seen_at }]
  })
}
