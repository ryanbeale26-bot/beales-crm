'use server'

import {
  PLACE_KINDS,
  type PlaceKind,
  type SearchHit,
  searchRecords,
} from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

/**
 * The two callers of global search, both going through the same Postgres
 * function so the palette and Quick Add can never rank the same records
 * differently.
 *
 * This file sits at the route-group root and exports only actions, so it
 * creates no route.
 */

export async function search(term: string): Promise<SearchHit[]> {
  const supabase = await createClient()
  return searchRecords(supabase, term)
}

/** Quick Add: the three things an activity can be logged against. */
export async function searchPlaces(term: string): Promise<SearchHit<PlaceKind>[]> {
  const supabase = await createClient()
  return searchRecords(supabase, term, PLACE_KINDS)
}
