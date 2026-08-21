'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Closing a next step.
 *
 * Until now nothing in the app wrote `next_steps.status` at all — the only two
 * rows ever closed were dismissed from the Supabase SQL editor, which has no
 * `auth.uid()`, which is why they read as "changed by —" on /admin/history.
 * Running as the signed-in person is the whole point: the audit trigger on
 * next_steps then records who decided the meeting was finished.
 */

export type StatusResult = { ok: true } | { ok: false; error: string }

export async function setNextStepStatus(
  id: string,
  status: 'open' | 'done' | 'dismissed',
): Promise<StatusResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data, error } = await supabase
    .from('next_steps')
    .update({
      status,
      // Cleared on the way back to open, so Undo restores the row rather than
      // leaving it open with a completion date on it.
      completed_at: status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    // RLS on next_steps is member-wide by design — accepting a suggestion and
    // linking a call are everyday work, not an admin job. This is the line that
    // stops one person closing another's, and it holds wherever the id came
    // from rather than only for the rows this dashboard happened to render.
    //
    // Today it can never bite, because both readers filter on owner_id too — so
    // a row you cannot close is a row you cannot see. That stops being true the
    // day a next step renders on an account page, where all five people see all
    // data: `owner_id` is nullable and run.ts falls back to the ingest profile
    // when nobody on the meeting is one of us, so those rows belong to nobody.
    .eq('owner_id', user.id)
    // Without this, a row that is not yours updates ZERO rows and PostgREST
    // still reports success — the strip would say "Marked done" over a write
    // that never happened. An empty result is a refusal, not an outcome.
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'That next step is not yours to change.' }
  }

  // No revalidatePath, deliberately, and this is the one place in the app that
  // leaves it out. Revalidating re-renders the dashboard, which drops the row
  // out of the strip the instant it is closed — and a Dismiss you cannot take
  // back is the exact problem this action exists to fix, since the only way
  // back would be the SQL editor again. The strip keeps the row in place with
  // an Undo instead, and next time the page is loaded the server has the truth.
  // Nothing else on any screen reads next_steps, so nothing else goes stale.
  return { ok: true }
}
