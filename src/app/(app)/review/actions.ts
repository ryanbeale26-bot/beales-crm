'use server'

import { revalidatePath } from 'next/cache'

import { acceptSuggestions, rejectSuggestions } from '@/lib/ingest/suggestions'
import { createClient } from '@/lib/supabase/server'

/**
 * Accepting and rejecting run as the signed-in person, not as the ingest
 * profile — so `audit_log` records who agreed to a change, which is the whole
 * reason a machine account writes suggestions rather than records.
 */

async function requireMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')
  return { supabase, userId: user.id }
}

function revalidate() {
  revalidatePath('/review')
  revalidatePath('/dashboard')
  revalidatePath('/activity')
  revalidatePath('/contacts')
  revalidatePath('/accounts')
  revalidatePath('/admin/import')
}

export async function acceptAction(ids: string[]) {
  const { supabase, userId } = await requireMember()
  const result = await acceptSuggestions(supabase, ids, userId)
  revalidate()
  return result
}

export async function rejectAction(ids: string[]) {
  const { supabase, userId } = await requireMember()
  const result = await rejectSuggestions(supabase, ids, userId)
  revalidate()
  return result
}
