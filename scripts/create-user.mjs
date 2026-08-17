/**
 * Creates one of the five user accounts. Invite-only: there is no public signup,
 * so every account is made here.
 *
 *   npm run user:create -- --email jon@example.com --name "Jon Beale" --role leadership
 *   npm run user:create -- --email ryan@example.com --name "Ryan Beale" --role admin --rates
 *
 * Options:
 *   --email     required
 *   --name      required, the name shown in the app
 *   --role      admin | leadership | field        (default: leadership)
 *   --rates     give this person access to pay rates, bill rates and margin
 *   --inactive  create the profile but block sign-in. Use for people who have
 *               left: their name still displays on records they used to own,
 *               instead of the app showing a blank owner
 *   --password  set one explicitly; otherwise a strong one is generated and printed
 *   --service   a machine account, not a person — currently the nightly ingest.
 *               It stays ACTIVE, because RLS refuses every write from an
 *               inactive profile, so it cannot be hidden the way a departed
 *               colleague is. This flag hides it instead: it is never offered
 *               as an owner anywhere in the app
 *
 * This is the ONLY place the service role key is used. That key bypasses all
 * security, so it must never be imported by anything under /src.
 */

import { randomBytes } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

const email = arg('email')
const name = arg('name')
const role = arg('role') ?? 'leadership'
const seesRates = process.argv.includes('--rates')
const inactive = process.argv.includes('--inactive')
const service = process.argv.includes('--service')
const password = arg('password') ?? randomBytes(12).toString('base64url')

if (!email) fail('Missing --email')
if (!name) fail('Missing --name')
if (!['admin', 'leadership', 'field'].includes(role)) {
  fail(`--role must be admin, leadership or field (got "${role}")`)
}
if (service && inactive) {
  fail('--service and --inactive contradict: RLS refuses every write from an inactive profile.')
}
if (service && seesRates) {
  fail('--service and --rates contradict: a machine account has no business reading pay rates.')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  fail(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local',
  )
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // these five are known people; no confirmation email needed
  user_metadata: { full_name: name },
})

let userId = data?.user?.id
let created = true

if (error) {
  if (!/already/i.test(error.message)) fail(`Could not create the account: ${error.message}`)

  // Already there — find them and update instead of failing.
  created = false
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (listError) fail(`Could not look up the existing account: ${listError.message}`)

  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!existing) fail(`Supabase says ${email} exists, but it was not in the user list.`)
  userId = existing.id
}

// The profile row is created by a database trigger. Set role and rate access.
const { error: profileError } = await supabase
  .from('profiles')
  .update({
    full_name: name,
    email,
    role,
    sees_rates: seesRates,
    is_active: !inactive,
    is_service: service,
  })
  .eq('id', userId)

if (profileError) {
  fail(
    `The account exists but its profile could not be updated: ${profileError.message}\n` +
      `  Have the migrations been applied? Run: npx supabase db push`,
  )
}

console.log(`\n  ${created ? 'Created' : 'Updated'} ${name} <${email}>`)
console.log(`  Role: ${role}${seesRates ? ' — can see pay rates and margin' : ''}`)

if (inactive) {
  console.log(`  Inactive: cannot sign in, and sees no data even with a session.`)
  console.log(`  Their name still shows on records they own.\n`)
  process.exit(0)
}

if (service) {
  console.log(`  Machine account: active (RLS needs it), never offered as an owner.`)
  if (created) {
    console.log(`\n  Password: ${password}`)
    console.log(`  Put this in Vercel as INGEST_USER_PASSWORD, and in .env.local`)
    console.log(`  alongside INGEST_USER_EMAIL=${email}\n`)
  } else {
    console.log(`  Password unchanged.\n`)
  }
  process.exit(0)
}

if (created) {
  console.log(`  Temporary password: ${password}`)
  console.log(`\n  Send this to them privately. They can also use the`)
  console.log(`  "email me a sign-in link" option instead of a password.\n`)
} else {
  console.log(`  Password unchanged.\n`)
}
