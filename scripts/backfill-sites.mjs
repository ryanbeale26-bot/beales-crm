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

const COMMIT = process.argv.includes('--commit')

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url).pathname, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** Street suffixes collapse to one token: "Rd" and "Road" are the same street,
 *  and "90 Libbey Pkwy" must not be a different place from "90 Libbey Pkwy.". */
const SUFFIX = {
  st: 'st', street: 'st', rd: 'rd', road: 'rd', dr: 'dr', drive: 'dr',
  ave: 'ave', avenue: 'ave', blvd: 'blvd', boulevard: 'blvd',
  pkwy: 'pkwy', parkway: 'pkwy', cir: 'cir', circle: 'cir',
  ln: 'ln', lane: 'ln', ct: 'ct', court: 'ct', pl: 'pl', place: 'pl',
  tpke: 'tpke', turnpike: 'tpke', way: 'way',
}

function addressKey(building) {
  const line = (building.address_line1 ?? '').trim()
  // "-" is what the importer left where the sheet said nothing.
  if (line === '' || line === '-') return null
  const city = (building.city ?? '').trim().toLowerCase()
  const words = line
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIX[w] ?? w)
  if (words.length === 0) return null
  return `${words.join(' ')}|${city}`
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
  const rest = (path, init) => fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: H })

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
  const groups = new Map()
  for (const b of todo) {
    const key = addressKey(b) ?? `nosite:${b.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(b)
  }

  const shared = [...groups.values()].filter((g) => g.length > 1)
  const noAddress = todo.filter((b) => addressKey(b) === null)

  console.log(`\n${todo.length} buildings -> ${groups.size} sites`)
  console.log(`  ${shared.length} site(s) carry more than one contract`)
  console.log(`  ${noAddress.length} building(s) have no address, so each gets its own site\n`)

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

  for (const [, group] of groups) {
    // The richest row wins for each field: several contracts at one address
    // often means one of them was filled in and the others never were.
    const pick = (field) => group.map((b) => b[field]).find((v) => v !== null && v !== '' && v !== '-') ?? null
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

    const created = await rest('sites', {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    }).then((r) => r.json())

    if (!Array.isArray(created) || !created[0]?.id) {
      console.error(`  FAILED to create site for "${payload.name}":`,
        JSON.stringify(created).slice(0, 200))
      continue
    }
    sitesMade += 1

    for (const b of group) {
      const res = await rest(`buildings?id=eq.${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ site_id: created[0].id }),
      })
      if (res.ok) linked += 1
      else console.error(`  FAILED to link "${b.name}":`, (await res.text()).slice(0, 160))
    }
  }

  console.log(`Created ${sitesMade} sites and linked ${linked} of ${todo.length} buildings.`)
  console.log('\nAudit rows are attributed to the ingest service profile, because that is')
  console.log('the account this script signs in as. Nothing else was changed: no contract')
  console.log('period moved, no value changed, no building was deleted.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
