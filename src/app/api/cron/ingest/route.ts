import { timingSafeEqual } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'

import { cronSecret, granolaApiKey, graphCredentials, hasGranolaEnv, hasGraphEnv } from '@/lib/env'
import { fixtureSource } from '@/lib/ingest/fixtures'
import { makeGranolaSource } from '@/lib/ingest/granola'
import { makeGraphSource } from '@/lib/ingest/graph'
import { fetchMailboxes } from '@/lib/ingest/mailboxes'
import { runIngest } from '@/lib/ingest/run'
import { failRun, finishRun, startRun, type RunHandle } from '@/lib/ingest/runs'
import { createIngestClient, ingestProfileId } from '@/lib/supabase/ingest'

/**
 * The nightly ingest.
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. There is no
 * session cookie, which is why `isPublicPath()` in the proxy lets /api/cron/
 * through — without that this route would redirect to /login every night and
 * report success while doing nothing at all.
 *
 * 300 seconds is the ceiling on the Hobby plan this project actually runs on,
 * and also the Pro ceiling without Fluid Compute. It is NOT a preference: a
 * build declaring more is REJECTED by Vercel at build time, not at runtime —
 * "Serverless Functions must have a maxDuration between 1 and 300 for plan
 * hobby". This file asked for 800 (the Pro-with-Fluid-Compute ceiling) from
 * Phase 7a until 2026-08-18, which is why the 7a commit never deployed and
 * every push after it failed the same way while production quietly went on
 * serving the last green build. Raise it only after confirming the plan the
 * project is on, and Fluid Compute with it.
 *
 * The run stops itself 30 seconds short of the ceiling, which is the difference
 * between a clean pause and a killed function.
 *
 * The schedule is in vercel.json, which is strict JSON and cannot carry a
 * comment, so it is explained here instead. Two entries, 07:00 and 09:00 —
 * **UTC**, which Vercel does not offer an alternative to. That is 03:00 and
 * 05:00 in Boston through the summer and 02:00 and 04:00 once the clocks go
 * back, which is why the job appears to move by an hour twice a year. The
 * second pass is a drain: if the first stopped at its deadline with work left,
 * the second finishes it, because every item's state is a row rather than a
 * position in a loop. A route that re-invoked itself would be a recursion bug
 * and a billing incident waiting to happen.
 */

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Leave enough room to finish the item in hand and write the summary. Scaled
 *  down with maxDuration: 100s of headroom out of 300 would spend a third of
 *  the budget doing nothing. */
const HEADROOM_MS = 30_000

/**
 * How far back a run looks.
 *
 * There is deliberately no durable cursor anywhere in this job: idempotency
 * lives in `ingested_items`, which is one fact rather than two that can
 * disagree. A fixed lookback plus that mirror means a missed night costs
 * nothing and a re-seen item is a timestamp touch. Two days is one night of
 * slack.
 */
const LOOKBACK_DAYS = 2

function authorised(request: NextRequest): boolean {
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${cronSecret()}`
  // Constant time, and length-checked first because timingSafeEqual throws on
  // a length mismatch rather than returning false.
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()

  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  // Held outside the try so the catch can close the run row if one was opened.
  let supabase: Awaited<ReturnType<typeof createIngestClient>> | null = null
  let handle: RunHandle = null

  try {
    supabase = await createIngestClient()
    const actorId = await ingestProfileId(supabase)

    // Which mailboxes to ASK for. The access policy in Exchange decides which
    // we actually get; anyone outside the ingest group answers 403 and is
    // counted, not raised.
    const mailboxes = hasGraphEnv() ? await fetchMailboxes(supabase) : []
    const sources = [
      'fixtures',
      ...(hasGranolaEnv() ? ['granola'] : []),
      ...(hasGraphEnv() ? ['graph'] : []),
    ]

    // Opened here rather than at the top, because writing it needs the session
    // that signing in just produced. A sign-in failure therefore leaves NO row
    // at all — which is the same shape as the cron never firing, and both are
    // caught the same way: /admin/ingest flags how long it has been since the
    // last run rather than waiting for a row that will never arrive.
    handle = await startRun(supabase, sources)

    const summary = await runIngest(supabase, {
      // Three real sources now. The fixtures stay wired up beside them: their
      // addresses are .invalid, so they create nothing, and they are the one
      // way to exercise the mail path on a machine with no credentials at all.
      sources: [
        { name: 'fixtures', fetch: fixtureSource },
        // Skipped rather than thrown when the key is absent: a machine with no
        // Granola key should still run the rest of the job.
        ...(hasGranolaEnv()
          ? [{ name: 'granola', fetch: makeGranolaSource(granolaApiKey()) }]
          : []),
        ...(hasGraphEnv()
          ? [{ name: 'graph', fetch: makeGraphSource(graphCredentials(), mailboxes) }]
          : []),
      ],
      since: new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString(),
      deadline: startedAt + maxDuration * 1000 - HEADROOM_MS,
      actorId,
    })

    await finishRun(supabase, handle, summary, Date.now() - startedAt)

    // Deliberately 200 even when items failed. Vercel retries a failed cron,
    // and a retry storm against a throttled API is worse than waiting a day —
    // the per-item state is in the database, so the next run resumes anyway.
    return NextResponse.json({
      ok: summary.errors.length === 0,
      ranForMs: Date.now() - startedAt,
      ...summary,
    })
  } catch (caught) {
    // A failure to sign in or to read the directory is different: nothing ran,
    // and it will not fix itself. This one is worth a non-200 so it shows up
    // red in Vercel's cron log.
    const message = caught instanceof Error ? caught.message : String(caught)
    if (supabase) await failRun(supabase, handle, message, Date.now() - startedAt)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
