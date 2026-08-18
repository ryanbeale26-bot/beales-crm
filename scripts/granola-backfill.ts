/**
 * Log the whole Granola history, once, as ONE undoable batch.
 *
 *   npm run granola:backfill              # dry run. Writes nothing
 *   npm run granola:backfill -- --commit  # writes
 *
 * WHY A LOCAL SCRIPT AND NOT THE CRON. The nightly job runs on Vercel's Hobby
 * plan, which caps a function at 300 seconds. Draining a year of notes across
 * several invocations would need new state to carry one batch id between them —
 * or it would produce eight separate batches and eight Undo buttons for one
 * decision. Run from a laptop there is no cap at all, so the whole history is one
 * batch with one button, and the nightly job stays forward-only and simple.
 *
 * WHAT MAKES IT REVERSIBLE. Every activity it creates carries import_batch_id,
 * and `activities` and `next_steps` are already in rollbackImport's table list.
 * So Undo at the bottom of /admin/import takes the entire year back, and not one
 * line of undo code was written for this.
 *
 * Signs in as the ingest service profile, exactly as the nightly job does — RLS
 * applies identically and every row is attributed in audit_log. The service role
 * key is not used.
 */

import { granolaListItem, listGranolaNotes } from '@/lib/ingest/granola'
import { loadDirectory, matchItem } from '@/lib/ingest/match'
import { runIngest } from '@/lib/ingest/run'
import { activityTypeForTitle } from '@/lib/ingest/titles'

import { readEnvLocal, requireEnv, signInAsAdmin, signInAsIngest } from './granola-env'

const COMMIT = process.argv.includes('--commit')

/** Everything. Granola's updated_after happily takes a date before the account
 *  existed, and the mirror is what stops a re-run duplicating anything. */
const SINCE = '2020-01-01T00:00:00.000Z'

/** Generous, because there is no platform limit here — but not unbounded, so a
 *  hung connection stops rather than runs all night. */
const BUDGET_MS = 30 * 60 * 1000

async function main() {
  const env = readEnvLocal()
  const apiKey = requireEnv(env, 'GRANOLA_API_KEY')

  // A dry run only reads, so the machine account is the right identity for it —
  // and it means you can see what a backfill would do without typing a password.
  // Committing opens an import batch, which is admin-only.
  const dryRunClient = COMMIT ? null : await signInAsIngest(env)
  const admin = COMMIT ? await signInAsAdmin(env) : null
  const supabase = admin?.supabase ?? dryRunClient!

  const dir = await loadDirectory(supabase)
  const curated = dir.phrases.filter((p) => p.source === 'curated').length
  console.log(
    `\n${dir.phrases.length} phrases in the book — ${curated} curated, ` +
      `${dir.phrases.length - curated} derived.\n`,
  )

  if (curated === 0) {
    console.log(
      'NOTE: no curated aliases yet. Phrases like "wound center" and "cancer center"\n' +
        'cannot be derived from any record, so those notes will be left alone. Run\n' +
        '`npm run granola:probe` and add a few aliases at /admin/ingest first — you will\n' +
        'log a great deal more, and the batch is undoable either way.\n',
    )
  }

  console.log('Reading notes from Granola (read-only)…')
  const { notes, truncated } = await listGranolaNotes({ apiKey, updatedAfter: SINCE })
  console.log(`${notes.length} notes${truncated ? ' (stopped early — there are more)' : ''}.`)

  // What would happen, decided by the SAME function the job calls.
  let willLog = 0
  let willAmbiguous = 0
  let willLeaveAlone = 0
  const byType = new Map<string, number>()

  for (const note of notes) {
    const outcome = matchItem(granolaListItem(note, apiKey), dir)
    if (outcome.kind === 'matched') {
      willLog += 1
      const type = activityTypeForTitle(note.title ?? '')
      byType.set(type, (byType.get(type) ?? 0) + 1)
    } else if (outcome.kind === 'ambiguous') {
      willAmbiguous += 1
    } else {
      willLeaveAlone += 1
    }
  }

  console.log(`\n  ${String(willLog).padStart(4)} would be logged as activities`)
  for (const [type, count] of byType) console.log(`         ${String(count).padStart(4)} ${type}`)
  console.log(`  ${String(willAmbiguous).padStart(4)} name more than one record — nothing linked`)
  console.log(
    `  ${String(willLeaveAlone).padStart(4)} match nothing — note id and date stored, no title, no summary\n`,
  )

  if (!COMMIT) {
    console.log('Dry run. Nothing was written. Re-run with --commit to apply.\n')
    return
  }

  const userId = admin!.userId

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      source_tab: `Granola history · ${new Date().toISOString().slice(0, 10)}`,
      file_name: null,
      row_count: willLog,
      status: 'committed',
      imported_by: userId,
      committed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    console.error(`Could not open an import batch: ${batchError?.message}`)
    process.exit(1)
  }

  console.log(`Batch ${batch.id}. Writing…\n`)

  const summary = await runIngest(supabase, {
    sources: [{ name: 'granola', fetch: async () => ({ items: notes.map((n) => granolaListItem(n, apiKey)), cursor: null }) }],
    since: SINCE,
    deadline: Date.now() + BUDGET_MS,
    actorId: userId,
    importBatchId: batch.id,
  })

  console.log(JSON.stringify(summary, null, 2))

  // A batch that wrote nothing would sit in the import list offering an Undo for
  // changes that never happened.
  if (summary.activitiesCreated + summary.nextStepsCreated === 0) {
    await supabase.from('import_batches').delete().eq('id', batch.id)
    console.log('\nNothing was created, so the empty batch was removed.\n')
    return
  }

  await supabase
    .from('import_batches')
    .update({ row_count: summary.activitiesCreated + summary.nextStepsCreated })
    .eq('id', batch.id)

  console.log(
    `\n${summary.activitiesCreated} activities and ${summary.nextStepsCreated} next steps created,\n` +
      `as one batch. Undo it from the list at the bottom of /admin/import.\n`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
