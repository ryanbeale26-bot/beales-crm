import 'server-only'

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

import { ingestCredentials, supabaseAnonKey, supabaseUrl } from '@/lib/env'
import type { Database } from '@/lib/database.types'

/**
 * A Supabase client signed in as the nightly ingest profile.
 *
 * Three things are deliberate here.
 *
 * It uses `@supabase/supabase-js` directly rather than `@supabase/ssr`. The
 * SSR helper exists to read and write session cookies; a cron invocation has no
 * cookie jar and no response to attach one to, so the SSR client would try to
 * persist a session into nothing.
 *
 * It signs in with a password rather than using the service role key. The
 * ingest profile is an ordinary member: every write goes through the same RLS
 * policies as a person's, it cannot read pay rates, it cannot administer users,
 * and `audit_log.changed_by` names it on every row it touches. Under the
 * service role key `auth.uid()` is null and the audit trail loses its author on
 * exactly the rows nobody watched being written.
 *
 * And it does not persist or auto-refresh. One sign-in per run, held for the
 * length of that run, discarded when the function ends.
 */
export async function createIngestClient(): Promise<SupabaseClient<Database>> {
  const { email, password } = ingestCredentials()

  const supabase = createSupabaseClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw new Error(
      `The nightly ingest could not sign in as ${email}: ${error.message}. ` +
        `Check INGEST_USER_EMAIL and INGEST_USER_PASSWORD, and that the profile ` +
        `is still active — RLS refuses every write from an inactive profile.`,
    )
  }

  if (!data.user) {
    throw new Error(`Signing in as ${email} returned no user.`)
  }

  return supabase
}

/** The ingest profile's own id, for stamping `logged_by` and `created_by`. */
export async function ingestProfileId(supabase: SupabaseClient<Database>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('The ingest client is not signed in.')
  return user.id
}
