import 'server-only'

import type { Supabase } from '@/lib/ingest'
import type { RunSummary } from '@/lib/ingest/run'

/**
 * Recording that the nightly job ran.
 *
 * Called from the cron route rather than from `runIngest`, deliberately: the
 * job can fail *before* `runIngest` is reached — a bad `INGEST_USER_PASSWORD`,
 * a Supabase outage, an expired credential — and that is the failure that will
 * never fix itself and that nobody would otherwise see. Recording from inside
 * the run would miss exactly those nights.
 *
 * The row is written when the run starts, with `ok` null, and updated when it
 * ends. A run killed by the platform therefore leaves a row that says so.
 */

export type RunHandle = { id: string } | null

/**
 * Open a run row. Returns null if it could not be written, because failing to
 * record a run must never stop the run itself — the bookkeeping is the least
 * important thing happening tonight.
 */
export async function startRun(supabase: Supabase, sources: string[]): Promise<RunHandle> {
  const { data, error } = await supabase
    .from('ingest_runs')
    .insert({ sources })
    .select('id')
    .single()

  if (error) {
    console.error('Could not open an ingest_runs row:', error.message)
    return null
  }
  return { id: data.id }
}

/** Close it, with everything the run counted. */
export async function finishRun(
  supabase: Supabase,
  handle: RunHandle,
  summary: RunSummary,
  ranForMs: number,
): Promise<void> {
  if (!handle) return

  const { error } = await supabase
    .from('ingest_runs')
    .update({
      finished_at: new Date().toISOString(),
      // "Clean", not "did something". A night with nothing to fetch is a good
      // night; a night with one error is not, however much else it wrote.
      ok: summary.errors.length === 0,
      ran_for_ms: ranForMs,
      seen: summary.seen,
      ingested: summary.ingested,
      already_seen: summary.alreadySeen,
      unknown_senders: summary.unknownSenders,
      ambiguous: summary.ambiguous,
      unmatched: summary.unmatched,
      activities_created: summary.activitiesCreated,
      next_steps_created: summary.nextStepsCreated,
      suggestions_written: summary.suggestionsWritten,
      stopped_early: summary.stoppedEarly,
      truncated: summary.truncated,
      errors: summary.errors,
    })
    .eq('id', handle.id)

  if (error) console.error('Could not close the ingest_runs row:', error.message)
}

/**
 * Close a run that never got as far as running — a sign-in failure, or
 * anything else thrown before `runIngest`. `ok` false with one error, so the
 * screen shows the night in red rather than not at all.
 */
export async function failRun(
  supabase: Supabase,
  handle: RunHandle,
  message: string,
  ranForMs: number,
): Promise<void> {
  if (!handle) return
  await supabase
    .from('ingest_runs')
    .update({
      finished_at: new Date().toISOString(),
      ok: false,
      ran_for_ms: ranForMs,
      errors: [message],
    })
    .eq('id', handle.id)
}
