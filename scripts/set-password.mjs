/**
 * Sets the password on an existing account, without email in the loop.
 *
 *   npm run user:password -- --email ryan@bealesllc.com
 *
 * Why this exists rather than "Send password recovery" in the Supabase
 * dashboard: bealesllc.com is on Exchange Online, and Microsoft Defender Safe
 * Links opens URLs to scan them before a human ever clicks. A Supabase recovery
 * link is a ONE-TIME token, so the scan consumes it and the person clicking
 * gets `otp_expired`. That is not a bug you can retry your way out of, and it
 * will hit every one of the five accounts the same way.
 *
 * The password is never a command-line argument. Arguments land in shell
 * history, in `ps` output, and in any terminal scrollback that gets pasted
 * somewhere — so this prompts for it instead, with the echo suppressed, and
 * asks twice.
 *
 * Like create-user.mjs, this runs on your own machine and is one of only two
 * places the service role key is used. That key bypasses every RLS policy, so
 * it must never be imported by anything under /src.
 */

import { createInterface } from 'node:readline'

import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

/** Supabase's own floor is 6. This asks for more, because these five accounts
 *  can read every contract value and pay rate in the business. */
const MIN_LENGTH = 12

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function fail(message) {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

/** Read a line with the echo suppressed, so the password never appears on
 *  screen, in scrollback, or in a screen share. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    const write = rl._writeToOutput.bind(rl)
    rl._writeToOutput = (chunk) => {
      if (!muted) write(chunk)
    }
    rl.question(question, (value) => {
      rl.close()
      process.stdout.write('\n')
      resolve(value)
    })
    muted = true
  })
}

const email = arg('email')
if (!email) fail('Missing --email. Try: npm run user:password -- --email ryan@bealesllc.com')

if (process.argv.includes('--password')) {
  fail(
    'Do not pass --password on the command line: it would be written to your\n' +
      '  shell history and visible in `ps`. This script prompts for it instead.',
  )
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local')
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Find them first, and say who it is out loud. Resetting the wrong colleague's
// password is a silent mistake otherwise — and there is no rbeale@, only
// ryan@, jbeale@, rmulligan@ and bmulligan@, which is exactly the kind of
// near-miss worth catching before anything is written.
const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 })
if (listError) fail(`Could not list users: ${listError.message}`)

const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  const known = list.users.map((u) => `    ${u.email}`).join('\n')
  fail(`No account with the email ${email}. The accounts that exist are:\n\n${known}`)
}

const { data: profile } = await supabase
  .from('profiles')
  .select('full_name, role, is_active, is_service')
  .eq('id', user.id)
  .maybeSingle()

console.log(`\n  Setting the password for:`)
console.log(`    ${profile?.full_name ?? '(no profile row)'} <${user.email}>`)
console.log(`    Role: ${profile?.role ?? '?'}${profile?.is_service ? ' — machine account' : ''}`)
console.log(`    Last signed in: ${user.last_sign_in_at ?? 'never'}`)

if (profile && !profile.is_active) {
  console.log(`\n  NOTE: this profile is INACTIVE. Setting a password will not let them in —`)
  console.log(`  RLS hides every row from an inactive profile. Reactivate them first.`)
}

const first = await askHidden('\n  New password (not shown): ')
if (first.length < MIN_LENGTH) {
  fail(`That is ${first.length} characters. Use at least ${MIN_LENGTH}.`)
}

const second = await askHidden('  Type it again: ')
if (first !== second) fail('Those did not match. Nothing was changed.')

const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
  password: first,
})

if (updateError) fail(`Could not set the password: ${updateError.message}`)

console.log(`\n  Done. ${user.email} can sign in at the app with the new password.`)
console.log(`  Nothing was emailed, so there is no link to expire.\n`)
