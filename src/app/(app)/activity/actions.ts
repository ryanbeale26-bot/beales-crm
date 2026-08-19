'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

export type LogResult = { ok: true; id: string } | { ok: false; error: string }

/**
 * The one write that has to be quick and has to work. Only a type and a
 * subject are required; everything else is optional by design, because a
 * required field is a reason not to log anything at all.
 */
export async function logActivity(input: {
  activityTypeId: string
  subject: string
  body?: string | null
  occurredAt?: string | null
  accountId?: string | null
  buildingId?: string | null
  contactId?: string | null
}): Promise<LogResult> {
  const subject = input.subject.trim()
  if (!subject) return { ok: false, error: 'Say what happened.' }
  if (!input.activityTypeId) return { ok: false, error: 'Pick a type.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are signed out — sign in and try again.' }

  const { data, error } = await supabase
    .from('activities')
    .insert({
      activity_type_id: input.activityTypeId,
      subject,
      body: input.body?.trim() || null,
      occurred_at: input.occurredAt || new Date().toISOString(),
      logged_by: user.id,
      // A trigger fills account_id from whichever of these is set, so an
      // activity logged against a building shows on the account timeline too.
      account_id: input.accountId ?? null,
      building_id: input.buildingId ?? null,
      contact_id: input.contactId ?? null,
      source: 'manual',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: `Could not save: ${error.message}` }

  revalidatePath('/activity')
  if (input.accountId) revalidatePath(`/accounts/${input.accountId}`)
  if (input.buildingId) revalidatePath(`/buildings/${input.buildingId}`)
  if (input.contactId) revalidatePath(`/contacts/${input.contactId}`)

  return { ok: true, id: data.id }
}

export async function deleteActivity(id: string) {
  const supabase = await createClient()
  await supabase.from('activities').delete().eq('id', id)
  revalidatePath('/activity')
}
