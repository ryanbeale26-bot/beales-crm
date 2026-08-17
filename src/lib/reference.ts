import 'server-only'

import { createClient } from '@/lib/supabase/server'

/** People who can own a record. Inactive profiles are included so that a record
 *  owned by someone who has left still shows their name rather than a blank.
 *
 *  Service accounts are not. The nightly ingest has to be an active profile —
 *  RLS refuses every write otherwise — so it cannot be hidden by deactivating
 *  it the way a departed colleague is. "Who owns this account" must always
 *  answer with somebody you can ring. */
export async function getOwners() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_active')
    .eq('is_service', false)
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

export async function getServiceTypes() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('service_types')
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

export async function getLeadSources() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lead_sources')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
  return data ?? []
}

/** Why deals are won. Starts empty on purpose — the list is Ryan's to build. */
export async function getWinReasons() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('win_reasons')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order')
  return data ?? []
}

/** Every stage, in board order. Includes the closed ones — the board has columns
 *  for them, because that is where a deal is dragged to close it. */
export async function getPipelineStages() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pipeline_stages')
    .select('id, name, probability, sort_order, is_won, is_lost')
    .eq('is_active', true)
    .order('sort_order')
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
