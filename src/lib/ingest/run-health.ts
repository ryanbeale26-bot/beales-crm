import 'server-only'

import type { Supabase } from '@/lib/ingest'

/**
 * Is the nightly job actually working?
 *
 * Nothing could answer that before `ingest_runs` existed. `/admin/ingest`
 * reported the last time something was *ingested*, which only moves when there
 * is something to ingest — so a quiet week and a broken cron looked identical.
 *
 * Staleness is the load-bearing signal here, not the rows. A sign-in failure
 * cannot write a row at all (writing needs the session that just failed) and a
 * cron that never fires obviously writes nothing either. Both show up the same
 * way: the last run gets old.
 */

/** Two runs a night, so a whole day of silence is already wrong. */
const STALE_AFTER_HOURS = 26

export type RunRow = {
  id: string
  startedAt: string
  finishedAt: string | null
  ok: boolean | null
  ranForMs: number | null
  sources: string[]
  seen: number
  ingested: number
  alreadySeen: number
  activitiesCreated: number
  nextStepsCreated: number
  /** Meetings that had MOVED or been renamed since we last saw them. */
  nextStepsUpdated: number
  suggestionsWritten: number
  stoppedEarly: boolean
  truncated: string[]
  errors: string[]
}

export type RunHealth = {
  runs: RunRow[]
  last: RunRow | null
  /** Nothing has run for over a day. The cron may not be firing at all. */
  stale: boolean
  /** Never run. Different from stale: nothing is wrong, it just has not started. */
  neverRun: boolean
  hoursSince: number | null
}

export async function fetchRunHealth(supabase: Supabase, limit = 10): Promise<RunHealth> {
  const { data } = await supabase
    .from('ingest_runs')
    .select(
      'id, started_at, finished_at, ok, ran_for_ms, sources, seen, ingested, already_seen, activities_created, next_steps_created, next_steps_updated, suggestions_written, stopped_early, truncated, errors',
    )
    .order('started_at', { ascending: false })
    .limit(limit)

  const runs: RunRow[] = (data ?? []).map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    ok: row.ok,
    ranForMs: row.ran_for_ms,
    sources: row.sources ?? [],
    seen: row.seen,
    ingested: row.ingested,
    alreadySeen: row.already_seen,
    activitiesCreated: row.activities_created,
    nextStepsCreated: row.next_steps_created,
    nextStepsUpdated: row.next_steps_updated,
    suggestionsWritten: row.suggestions_written,
    stoppedEarly: row.stopped_early,
    truncated: row.truncated ?? [],
    errors: row.errors ?? [],
  }))

  const last = runs[0] ?? null
  const hoursSince = last ? (Date.now() - new Date(last.startedAt).getTime()) / 3_600_000 : null

  return {
    runs,
    last,
    stale: hoursSince !== null && hoursSince > STALE_AFTER_HOURS,
    neverRun: last === null,
    hoursSince,
  }
}

/**
 * A run that never closed its own row.
 *
 * Not simply "finished_at is null" — that is also true of a run happening right
 * now. The route is capped at 300 seconds, so anything still open well past
 * that was killed rather than is running. Generous on purpose: reporting a live
 * run as dead is worse than reporting a dead one a few minutes late.
 */
const MAX_RUN_MS = 300_000

export function died(run: RunRow): boolean {
  if (run.finishedAt !== null || run.ok !== null) return false
  return Date.now() - new Date(run.startedAt).getTime() > MAX_RUN_MS * 2
}
