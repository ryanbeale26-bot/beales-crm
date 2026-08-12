import 'server-only'

import { createClient } from '@/lib/supabase/server'

/** People who can own a record. Inactive profiles are included so that a record
 *  owned by someone who has left still shows their name rather than a blank. */
export async function getOwners() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_active')
    .order('full_name')
  return data ?? []
}

export async function getPropertyTypes() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('property_types')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
  return data ?? []
}

export async function getLossReasons(appliesTo: 'building' | 'opportunity') {
  const supabase = await createClient()
  const { data } = await supabase
    .from('loss_reasons')
    .select('id, name')
    .eq('is_active', true)
    .in('applies_to', [appliesTo, 'both'])
    .order('sort_order')
  return data ?? []
}

export async function getCompetitors() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('competitors')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

/** The signed-in person's profile, including whether they may see pay rates. */
export async function getCurrentProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, sees_rates')
    .eq('id', user.id)
    .maybeSingle()

  return data
}
