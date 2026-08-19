'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

/**
 * Editing the five profiles.
 *
 * This works with the signed-in admin's own session and no elevated key:
 * `profiles_admin_all` in the initial schema grants an admin `for all` on
 * `profiles`. So RLS is the real lock and the checks below are a second one —
 * but a clear sentence beats a Postgres error, and two of them stop mistakes
 * RLS has no opinion about.
 *
 * What this deliberately CANNOT do: create an account, or set anybody else's
 * password. Both need the service role key, which bypasses every policy in the
 * database and is not deployed. The screen prints the terminal commands.
 */

export type Role = 'admin' | 'leadership' | 'field'

export type Result = { ok: true } | { ok: false; error: string }

export async function saveProfile(input: {
  id: string
  fullName: string
  role: Role
  seesRates: boolean
  isActive: boolean
}): Promise<Result> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.role !== 'admin') return { ok: false, error: 'Only an admin can change people.' }

  const fullName = input.fullName.trim()
  if (!fullName) return { ok: false, error: 'Give them a name.' }

  const { data: target, error: readError } = await supabase
    .from('profiles')
    .select('id, is_service, role, is_active')
    .eq('id', input.id)
    .maybeSingle()
  if (readError) return { ok: false, error: readError.message }
  if (!target) return { ok: false, error: 'That person no longer exists.' }

  // You cannot demote or deactivate yourself. Admin is the only role that can
  // reach this screen, so one careless save on your own row would lock the
  // company out of Import, Clean up, Reference data and People at once — with
  // no way back that does not involve the terminal and the service role key.
  if (target.id === user.id && input.role !== 'admin') {
    return {
      ok: false,
      error: 'You cannot take your own admin access away — nobody could give it back from inside the app.',
    }
  }
  if (target.id === user.id && !input.isActive) {
    return { ok: false, error: 'You cannot deactivate yourself.' }
  }

  // The nightly ingest signs in as a real profile, and `is_member()` requires
  // `is_active` — so deactivating it does not hide it, it silently stops it
  // writing anything. `is_service` is what keeps it out of the owner pickers.
  if (target.is_service && !input.isActive) {
    return {
      ok: false,
      error:
        'This is the machine account the nightly job signs in as. Deactivating it would stop the job writing anything, silently.',
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      role: input.role,
      sees_rates: input.seesRates,
      is_active: input.isActive,
    })
    .eq('id', input.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/people')
  // A name change shows up as an owner everywhere, and losing access changes
  // what the dashboard says about you.
  revalidatePath('/dashboard')
  return { ok: true }
}
