import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'

/**
 * Global search.
 *
 * There is one implementation of "find a record" and this is it. Before Phase
 * 6a there were two — a three-way ilike fan-out behind Quick Add, plus a `q`
 * filter on each list page — and a command palette would have made a third.
 * The rule this repo already applies to the win rate and the gap census
 * applies here too: two of anything eventually disagree, and the place that
 * must never happen is the box people use to find a building.
 *
 * The query itself is `search_records()` in Postgres. It is SECURITY INVOKER,
 * so the caller's own RLS policies decide what comes back — the function
 * cannot show anyone a row they could not already read.
 */

export const SEARCH_KINDS = ['building', 'account', 'contact', 'opportunity'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

/** What Quick Add can log an activity against. Not deals — activities have an
 *  opportunity_id, but the quick-add sheet has never offered one and adding it
 *  is a decision about that screen, not a side effect of this one. */
export const PLACE_KINDS = ['building', 'account', 'contact'] as const
export type PlaceKind = (typeof PLACE_KINDS)[number]

export type SearchHit<K extends SearchKind = SearchKind> = {
  kind: K
  id: string
  label: string
  sublabel: string | null
  /** 3 exact, 2 starts with, 1 contains. Kept so the palette can show why. */
  score: number
}

/** One letter matches most of the book, so it is not a search. */
export const MIN_TERM = 2

const PATHS: Record<SearchKind, string> = {
  building: '/buildings',
  account: '/accounts',
  contact: '/contacts',
  opportunity: '/opportunities',
}

export function hrefFor(hit: { kind: SearchKind; id: string }): string {
  return `${PATHS[hit.kind]}/${hit.id}`
}

export const KIND_LABELS: Record<SearchKind, string> = {
  building: 'Building',
  account: 'Account',
  contact: 'Contact',
  opportunity: 'Deal',
}

export async function searchRecords<K extends SearchKind>(
  supabase: SupabaseClient<Database>,
  term: string,
  kinds: readonly K[] = SEARCH_KINDS as readonly SearchKind[] as readonly K[],
  maxRows = 20,
): Promise<SearchHit<K>[]> {
  const t = term.trim()
  if (t.length < MIN_TERM) return []

  const { data, error } = await supabase.rpc('search_records', {
    term: t,
    kinds: kinds as unknown as string[],
    max_rows: maxRows,
  })

  // A search that fails should show nothing rather than throw a dialog away
  // mid-keystroke; the message still reaches the server log.
  if (error) {
    console.error('search_records failed:', error.message)
    return []
  }

  return (data ?? []) as SearchHit<K>[]
}
