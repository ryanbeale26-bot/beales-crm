/**
 * One-off: give every existing building a site.
 *
 * A `building` is one account's contract at one place. A `site` is the place.
 * Until this runs, every building has site_id null and nothing behaves any
 * differently — which is what makes it safe to apply the migration and think
 * about the backfill separately.
 *
 * Buildings are grouped by their normalised street address plus city, so the
 * pairs that are genuinely one place — a landlord contract and a tenant
 * contract at the same address — end up sharing one site. A building with no
 * address gets its own site named after itself; there is nothing to group it
 * by, and inventing a grouping is exactly the guess this project refuses.
 *
 * Runs as the ingest service profile, so RLS applies exactly as it would to a
 * person and every row it writes is attributed in audit_log. It does NOT use
 * the service role key.
 *
 *   node scripts/backfill-sites.mjs            # dry run, writes nothing
 *   node scripts/backfill-sites.mjs --commit   # actually writes
 */

import { readFileSync } from 'node:fs'

import { siteKey } from '@/lib/sites'

const COMMIT = process.argv.includes('--commit')

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url).pathname, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Whether two records are the same place.
 *
 * Imported rather than reimplemented. This script and the building form both
 * have to answer "is there already a site at this address", and two spellings of
 * that rule would eventually disagree — at which point the form would join a
 * site the script would have split, and one physical building would sit in two
 * rows. `siteKey()` collapses "Pkwy"/"Parkway" through the same normaliser the
 * Granola title matcher uses.
 */
type Row = {
  id: string
  name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  square_footage: number | null
  floors: number | null
  site_id: string | null
  account?: { name: string } | null
}

type SiteRow = { id: string; name: string; address_line1: string | null; city: string | null }

function addressKey(building: { address_line1?: string | null; city?: string | null }) {
  return siteKey(building.address_line1 ?? null, building.city ?? null)
}

async function main() {
  const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: env.INGEST_USER_EMAIL,
      password: env.INGEST_USER_PASSWORD,
    }),
  }).then((r) => r.json())

  if (!auth.access_token) {
    console.error('Could not sign in:', auth.error_description ?? JSON.stringify(auth))
    process.exit(1)
  }

  const H = {
    apikey: ANON,
    Authorization: `Bearer ${auth.access_token}`,
    'content-type': 'application/json',
  }
  // Headers are MERGED, not replaced. `{ ...init, headers: H }` looks harmless
  // and silently discards any header the caller passed — which is exactly what
  // happened to `Prefer: return=representation` on the site insert below: without
  // it PostgREST returns an empty body, and .json() died on it with
  // "Unexpected end of JSON input" after the row had already been created.
  const rest = (path: string, init?: RequestInit) =>
    fetch(`${URL_}/rest/v1/${path}`, {
      ...init,
      headers: { ...H, ...((init?.headers as Record<string, string> | undefined) ?? {}) },
    })

  /** Parse a PostgREST reply without assuming there is one. An empty body is a
   *  fact worth reporting, not an exception to be thrown from inside undici. */
  const readJson = async (response: Response) => {
    const body = await response.text()
    if (!response.ok) return { ok: false as const, detail: body.slice(0, 200) || `HTTP ${response.status}` }
    if (body === '') return { ok: false as const, detail: 'the server returned an empty body' }
    try {
      return { ok: true as const, data: JSON.parse(body) }
    } catch {
      return { ok: false as const, detail: `could not read the reply: ${body.slice(0, 120)}` }
    }
  }

  const buildings = await rest(
    'buildings?select=id,name,address_line1,address_line2,city,state,postal_code,' +
      'square_footage,floors,site_id,account:accounts!buildings_account_id_fkey(name)' +
      '&deleted_at=is.null&order=name',
  ).then((r) => r.json())

  if (!Array.isArray(buildings)) {
    console.error('Could not read buildings:', JSON.stringify(buildings).slice(0, 300))
    console.error('\nIf this says site_id does not exist, the migration has not been applied.')
    process.exit(1)
  }

  // Sites that already exist, so a building added AFTER an earlier run joins the
  // site at its address instead of getting a second one of its own. Without this
  // the script is only correct the first time it is ever run — and the workflow
  // it exists for is "add the tenant contracts as you find them", which means it
  // gets run again.
  const existingSites = await rest('sites?select=id,name,address_line1,city&deleted_at=is.null')
    .then((r) => r.json())

  if (!Array.isArray(existingSites)) {
    console.error('Could not read sites:', JSON.stringify(existingSites).slice(0, 200))
    process.exit(1)
  }

  const siteByKey = new Map<string, SiteRow>()
  for (const site of existingSites) {
    const key = addressKey(site)
    if (key && !siteByKey.has(key)) siteByKey.set(key, site)
  }

  const already = buildings.filter((b) => b.site_id)
  if (already.length > 0) {
    console.log(`${already.length} building(s) already have a site. They are left alone.`)
  }

  const todo = buildings.filter((b) => !b.site_id)
  if (todo.length === 0) {
    console.log('Every building already has a site. Nothing to do.')
    return
  }

  // Group. A building with no usable address is its own group, keyed by id.
  const groups = new Map<string, Row[]>()
  for (const b of todo) {
    const key = addressKey(b) ?? `nosite:${b.id}`
    const group = groups.get(key) ?? []
    group.push(b)
    groups.set(key, group)
  }

  const shared = [...groups.values()].filter((g) => g.length > 1)
  const noAddress = todo.filter((b) => addressKey(b) === null)
  const reused = [...groups.keys()].filter((key) => siteByKey.has(key))

  console.log(`\n${todo.length} buildings -> ${groups.size} sites`)
  console.log(`  ${shared.length} site(s) carry more than one contract`)
  console.log(`  ${noAddress.length} building(s) have no address, so each gets its own site`)
  console.log(`  ${reused.length} join a site that already exists\n`)

  if (reused.length > 0) {
    console.log('JOINING AN EXISTING SITE — no new site is created for these:')
    for (const key of reused) {
      const site = siteByKey.get(key)
      console.log(`  ${site?.name ?? key}`)
      for (const b of groups.get(key) ?? []) console.log(`      ${b.name}   (${b.account?.name ?? 'no account'})`)
    }
    console.log('')
  }

  if (shared.length > 0) {
    console.log('SITES WITH SEVERAL CONTRACTS — check these are really one place:')
    for (const g of shared) {
      console.log(`  ${g[0].address_line1}, ${g[0].city ?? '?'}`)
      for (const b of g) console.log(`      ${b.name}   (${b.account?.name ?? 'no account'})`)
    }
    console.log('')
  }

  if (noAddress.length > 0) {
    console.log('NO ADDRESS — each becomes its own site, and cannot be grouped with anything:')
    for (const b of noAddress) console.log(`  ${b.name}   (${b.account?.name ?? 'no account'})`)
    console.log('')
  }

  if (!COMMIT) {
    console.log('Dry run. Nothing was written. Re-run with --commit to apply.')
    return
  }

  let sitesMade = 0
  let linked = 0

  for (const [key, group] of groups) {
    // Already a site at this address: join it rather than making a second one.
    // Two site rows for one building would make v_site_contracts report two
    // sites with one contract each — exactly the double count `sites` exists to
    // remove.
    const existing = siteByKey.get(key)
    if (existing) {
      for (const b of group) {
        const res = await rest(`buildings?id=eq.${b.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ site_id: existing.id }),
        })
        if (res.ok) linked += 1
        else console.error(`  FAILED to link "${b.name}":`, (await res.text()).slice(0, 160))
      }
      continue
    }

    // The richest row wins for each field: several contracts at one address
    // often means one of them was filled in and the others never were.
    const pick = (field: keyof Row) => group.map((b) => b[field]).find((v) => v !== null && v !== '' && v !== '-') ?? null
    const withAddress = group.find((b) => addressKey(b) !== null)

    const payload = {
      name: withAddress ? withAddress.address_line1 : group[0].name,
      address_line1: pick('address_line1'),
      address_line2: pick('address_line2'),
      city: pick('city'),
      state: pick('state'),
      postal_code: pick('postal_code'),
      square_footage: pick('square_footage'),
      floors: pick('floors'),
    }

    const result = await readJson(
      await rest('sites', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      }),
    )

    if (!result.ok || !Array.isArray(result.data) || !result.data[0]?.id) {
      console.error(
        `  FAILED to create site for "${payload.name}": ${result.ok ? 'unexpected reply' : result.detail}`,
      )
      continue
    }
    const createdSite = result.data[0] as SiteRow
    sitesMade += 1
    if (key) siteByKey.set(key, createdSite)

    for (const b of group) {
      const res = await rest(`buildings?id=eq.${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ site_id: createdSite.id }),
      })
      if (res.ok) linked += 1
      else console.error(`  FAILED to link "${b.name}":`, (await res.text()).slice(0, 160))
    }
  }

  console.log(`Created ${sitesMade} sites and linked ${linked} of ${todo.length} buildings.`)
  if (reused.length > 0) {
    console.log(`${reused.length} of those joined a site that already existed.`)
  }
  console.log('\nAudit rows are attributed to the ingest service profile, because that is')
  console.log('the account this script signs in as. Nothing else was changed: no contract')
  console.log('period moved, no value changed, no building was deleted.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
