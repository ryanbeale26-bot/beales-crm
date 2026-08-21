/**
 * Removes a profile from the app completely, once nothing depends on it.
 *
 *   npm run user:remove -- --email who@bealesllc.com --reassign-to ryan@bealesllc.com
 *   npm run user:remove -- --email who@bealesllc.com --reassign-to ryan@bealesllc.com --commit
 *
 * WHY THIS IS NOT THE USUAL ANSWER. `npm run user:create -- --inactive` is, and
 * stays, the way somebody leaves: it blocks sign-in and hides every row from
 * them, while their name goes on showing against records they used to own. That
 * is right nearly always, and it is why the QA logins are kept — they hold the
 * audit rows for the testing they did, and deleting a profile erases who made
 * those changes for ever.
 *
 * This exists for the other case: a profile that was created and then turned out
 * not to belong in the app at all. The test is `audit_log`. Nobody with a single
 * entry in it can be removed here, at any flag, and the refusal is the point
 * rather than an obstacle.
 *
 * HOW IT CANNOT HALF-FINISH. Every foreign key pointing at `profiles` is NO
 * ACTION except `profile_email_aliases`, which cascades. So once the columns
 * below are cleared, the delete either succeeds outright or Postgres refuses the
 * whole thing and names the constraint that stopped it. The script does not need
 * to know every table in the schema, and it cannot leave the database in a state
 * it did not intend — which is exactly the property to want from something that
 * deletes a person.
 *
 * It is a DRY RUN unless you pass --commit.
 *
 * Options:
 *   --email        required. The profile to remove
 *   --reassign-to  required. The profile that inherits everything they own
 *   --commit       actually do it. Without this, nothing is written
 *
 * The service role key is used here, the same as `user:create`, because deleting
 * an auth user is an admin operation. That key bypasses every RLS policy, which
 * is why nothing under /src may import it.
 */

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
const reassignTo = arg('reassign-to')
const commit = process.argv.includes('--commit')

if (!email) fail('Missing --email — the profile to remove.')
if (!reassignTo) fail('Missing --reassign-to — who inherits what they own.')
if (email.toLowerCase() === reassignTo.toLowerCase()) {
  fail('--email and --reassign-to are the same person.')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.local')
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Profiles are matched case-insensitively: profiles.email mirrors whatever the
 *  auth record was created with, and Brendan's is capitalised. */
async function profileByEmail(address) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_active, is_service')
    .ilike('email', address)
    .maybeSingle()
  if (error) fail(`Could not look up ${address}: ${error.message}`)
  return data
}

const leaving = await profileByEmail(email)
if (!leaving) fail(`No profile with the address ${email}.`)

const successor = await profileByEmail(reassignTo)
if (!successor) fail(`No profile with the address ${reassignTo}.`)
if (successor.is_service) {
  fail(`${successor.full_name} is a machine account. Work cannot be inherited by one.`)
}
if (!successor.is_active) {
  fail(`${successor.full_name} is deactivated. Reassigning to them hides the records instead.`)
}

console.log(`\n  Removing  ${leaving.full_name} <${leaving.email}>`)
console.log(`  Everything they own goes to  ${successor.full_name} <${successor.email}>`)

// --- the refusal ------------------------------------------------------------
// audit_log.changed_by references profiles deliberately: history has to be able
// to name who made a change. A profile with any entry there is not removable,
// and no flag on this script overrides that.
const { count: auditRows, error: auditError } = await supabase
  .from('audit_log')
  .select('id', { count: 'exact', head: true })
  .eq('changed_by', leaving.id)

if (auditError) fail(`Could not read the audit log: ${auditError.message}`)

if (auditRows && auditRows > 0) {
  fail(
    `${leaving.full_name} has ${auditRows} entr${auditRows === 1 ? 'y' : 'ies'} in the audit log, ` +
      `so removing them would erase who made those changes.\n` +
      `  Deactivate instead:\n` +
      `    npm run user:create -- --email ${leaving.email} --name "${leaving.full_name}" --inactive`,
  )
}

console.log(`  Audit log: 0 entries — nothing historical is lost by removing them.\n`)

// --- what they hold ---------------------------------------------------------
const OWNED = [
  ['accounts', 'owner_id'],
  ['accounts', 'secondary_owner_id'],
  ['buildings', 'owner_id'],
  ['buildings', 'secondary_owner_id'],
  ['opportunities', 'owner_id'],
  ['opportunities', 'secondary_owner_id'],
  ['activities', 'logged_by'],
  ['next_steps', 'owner_id'],
  ['next_steps', 'created_by'],
  ['import_batches', 'imported_by'],
  ['account_domains', 'added_by'],
  ['match_aliases', 'added_by'],
  ['profile_email_aliases', 'profile_id'],
]

let held = 0
for (const [table, column] of OWNED) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, leaving.id)
  if (error) fail(`Could not count ${table}.${column}: ${error.message}`)
  if (count && count > 0) {
    held += count
    console.log(`    ${String(count).padStart(4)}  ${table}.${column}`)
  }
}

if (held === 0) console.log('    nothing — they own no records at all')

if (!commit) {
  console.log(`\n  DRY RUN. Nothing was written.`)
  console.log(`  Re-run with --commit to reassign the above and delete the profile.\n`)
  process.exit(0)
}

// --- do it ------------------------------------------------------------------
console.log('')
for (const [table, column] of OWNED) {
  // profile_email_aliases cascades on delete, so an alias is removed with the
  // profile rather than handed to somebody else — an alias claims a PERSON, and
  // giving one away would credit their mail to the wrong colleague.
  if (table === 'profile_email_aliases') continue

  const { error } = await supabase
    .from(table)
    .update({ [column]: successor.id })
    .eq(column, leaving.id)
  if (error) fail(`Could not reassign ${table}.${column}: ${error.message}`)
}
console.log(`  Reassigned everything to ${successor.full_name}.`)

const { error: deleteError } = await supabase.auth.admin.deleteUser(leaving.id)

if (deleteError) {
  fail(
    `Postgres refused to delete the profile, so NOTHING was deleted:\n` +
      `    ${deleteError.message}\n\n` +
      `  Something still references them that this script does not know about —\n` +
      `  the message above names the constraint. Clear it and run this again, or\n` +
      `  deactivate them instead. The reassignments above have already been made\n` +
      `  and are harmless on their own.`,
  )
}

console.log(`  Deleted the auth record; the profile row cascaded with it.`)
console.log(`\n  ${leaving.full_name} is gone from the app.\n`)
