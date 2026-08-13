'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

export type SearchHit = {
  kind: 'account' | 'building' | 'contact'
  id: string
  label: string
  sublabel: string | null
}

/**
 * One search box across accounts, buildings and contacts. Finding the right
 * place is the slow part of logging something on a phone, so this is
 * deliberately one query rather than a chain of pickers.
 */
export async function searchRecords(term: string): Promise<SearchHit[]> {
  const query = term.trim()
  if (query.length < 2) return []

  const supabase = await createClient()
  const like = `%${query}%`

  const [accounts, buildings, contacts] = await Promise.all([
    supabase.from('accounts').select('id, name').is('deleted_at', null).ilike('name', like).limit(5),
    supabase
      .from('buildings')
      .select('id, name, city, account:accounts(name)')
      .is('deleted_at', null)
      .or(`name.ilike.${like},city.ilike.${like},address_line1.ilike.${like}`)
      .limit(6),
    supabase
      .from('contacts')
      .select('id, first_name, last_name, account:accounts!contacts_account_id_fkey(name)')
      .is('deleted_at', null)
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      .limit(5),
  ])

  const hits: SearchHit[] = []

  for (const b of buildings.data ?? []) {
    hits.push({
      kind: 'building',
      id: b.id,
      label: b.name,
      sublabel: [b.account?.name, b.city].filter(Boolean).join(' · ') || null,
    })
  }
  for (const a of accounts.data ?? []) {
    hits.push({ kind: 'account', id: a.id, label: a.name, sublabel: 'Account' })
  }
  for (const c of contacts.data ?? []) {
    hits.push({
      kind: 'contact',
      id: c.id,
      label: [c.first_name, c.last_name].filter(Boolean).join(' '),
      sublabel: c.account?.name ?? 'Contact',
    })
  }

  return hits
}

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
