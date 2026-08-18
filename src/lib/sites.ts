import 'server-only'

import { normaliseAlias } from '@/lib/ingest/titles'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * Sites: the physical building, as distinct from the contract at it.
 *
 * A `building` is one account's contract at one place. Several of them can share
 * one `site` — Fox Rock owns 90 Libbey Pkwy and buys a day porter, while South
 * Shore Health's Wound Center is a tenant in the same building with its own
 * contract. Two customers, two contracts, two renewal dates, one postcode.
 */

export type SiteOption = {
  id: string
  name: string
  address: string | null
  city: string | null
  /** How many contracts already sit on it, so the picker can say so. */
  contracts: number
}

/**
 * The key two records share when they are the same place.
 *
 * Deliberately `normalise_alias()`'s TypeScript twin rather than a third
 * spelling of the same idea: it already collapses "Pkwy"/"Parkway" and strips
 * the trailing full stop, which is the entire problem here. City is part of the
 * key because "100 Main St" is not one place nationwide.
 */
export function siteKey(addressLine: string | null, city: string | null): string | null {
  const line = normaliseAlias(addressLine)
  // "-" is what the original importer left where the spreadsheet said nothing.
  if (!line || line === '-') return null
  return `${line}|${(city ?? '').trim().toLowerCase()}`
}

export async function fetchSiteOptions(
  supabase: SupabaseClient<Database>,
): Promise<SiteOption[]> {
  const { data } = await supabase
    .from('v_site_contracts')
    .select('site_id, site_name, address_line1, city, contract_count')
    .order('site_name')

  return (data ?? []).flatMap((row) =>
    row.site_id
      ? [
          {
            id: row.site_id,
            name: row.site_name ?? 'Unnamed site',
            address: row.address_line1,
            city: row.city,
            contracts: Number(row.contract_count ?? 0),
          },
        ]
      : [],
  )
}

/**
 * Find the site at this address, or make one.
 *
 * Reuse first, always. Creating a second site at an address that already has one
 * is the failure this function exists to prevent: it would split one physical
 * building across two rows, so `v_site_contracts` would report two sites with
 * one contract each instead of one site with two — which is precisely the
 * double-count that `sites` was added to fix.
 */
export async function findOrCreateSite(
  supabase: SupabaseClient<Database>,
  building: {
    name: string
    address_line1: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    square_footage: number | null
  },
): Promise<{ siteId: string | null; created: boolean; error?: string }> {
  const key = siteKey(building.address_line1, building.city)

  if (key) {
    // Every site, matched in TypeScript rather than filtered in the query: the
    // comparison has to go through the same normalisation the matcher uses, and
    // PostgREST cannot call normalise_alias() in a filter. There are dozens of
    // sites, not thousands.
    const { data: existing, error } = await supabase
      .from('sites')
      .select('id, address_line1, city')
      .is('deleted_at', null)

    if (error) return { siteId: null, created: false, error: error.message }

    const match = (existing ?? []).find((site) => siteKey(site.address_line1, site.city) === key)
    if (match) return { siteId: match.id, created: false }
  }

  const { data, error } = await supabase
    .from('sites')
    .insert({
      // The address is the honest name for a place. Fall back to the building's
      // own name only when there is no address to use.
      name: building.address_line1?.trim() || building.name,
      address_line1: building.address_line1,
      city: building.city,
      state: building.state,
      postal_code: building.postal_code,
      square_footage: building.square_footage,
    })
    .select('id')
    .single()

  if (error) return { siteId: null, created: false, error: error.message }
  return { siteId: data.id, created: true }
}
