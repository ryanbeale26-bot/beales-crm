'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export type FormState = { error?: string }

/** '' from an unfilled input means "no value", not empty string. */
function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? '').trim()
  return value === '' ? null : value
}

function number(formData: FormData, key: string): number | null {
  const value = text(formData, key)
  if (value === null) return null
  const n = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function revalidateDeal(id?: string | null) {
  revalidatePath('/opportunities')
  revalidatePath('/reports/pipeline')
  if (id) revalidatePath(`/opportunities/${id}`)
}

// -----------------------------------------------------------------------------
// Create and edit
// -----------------------------------------------------------------------------

export async function saveOpportunity(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, 'id')
  const name = text(formData, 'name')
  const stageId = text(formData, 'stage_id')

  // The only two that matter: a deal with no name is unusable, and stage_id is
  // NOT NULL because a deal is always somewhere on the board.
  if (!name) return { error: 'Give the deal a name.' }
  if (!stageId) return { error: 'Pick a stage.' }

  const values = {
    name,
    stage_id: stageId,
    account_id: text(formData, 'account_id'),
    property_type_id: text(formData, 'property_type_id'),
    lead_source_id: text(formData, 'lead_source_id'),
    owner_id: text(formData, 'owner_id'),
    secondary_owner_id: text(formData, 'secondary_owner_id'),
    entity: (text(formData, 'entity') ?? 'beales') as 'beales' | 'afs',
    monthly_value: number(formData, 'monthly_value'),
    square_footage: number(formData, 'square_footage'),
    current_staff_count: number(formData, 'current_staff_count'),
    incumbent_provider: text(formData, 'incumbent_provider'),
    address_line1: text(formData, 'address_line1'),
    city: text(formData, 'city'),
    state: text(formData, 'state'),
    postal_code: text(formData, 'postal_code'),
    opened_on: text(formData, 'opened_on'),
    expected_close_date: text(formData, 'expected_close_date'),
    scope_notes: text(formData, 'scope_notes'),
  }

  const supabase = await createClient()

  if (id) {
    const { error } = await supabase.from('opportunities').update(values).eq('id', id)
    if (error) return { error: `Could not save: ${error.message}` }
    revalidateDeal(id)
    redirect(`/opportunities/${id}`)
  }

  const { data, error } = await supabase
    .from('opportunities')
    .insert(values)
    .select('id')
    .single()
  if (error) return { error: `Could not create the deal: ${error.message}` }

  revalidateDeal()
  redirect(`/opportunities/${data.id}`)
}

// -----------------------------------------------------------------------------
// Moving a deal between stages
// -----------------------------------------------------------------------------

export type MoveResult =
  | { ok: true; stageId: string; isWon: boolean; isLost: boolean }
  | { ok: false; error: string }

/**
 * Dragging a card. Deliberately does the smallest possible write — the stage,
 * and nothing else — because the database does the rest: one trigger records the
 * move in opportunity_stage_events, another stamps the close date.
 *
 * Losing and winning need more information than a drag can carry, so this
 * returns whether the new stage is closed and the board opens the right form
 * afterwards. The deal has already moved either way: a card that snaps back
 * because you dismissed a dialog is worse than a deal missing its loss reason.
 */
export async function moveOpportunityStage(input: {
  opportunityId: string
  stageId: string
}): Promise<MoveResult> {
  const supabase = await createClient()

  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id, is_won, is_lost')
    .eq('id', input.stageId)
    .maybeSingle()

  if (stageError) return { ok: false, error: stageError.message }
  if (!stage) return { ok: false, error: 'That stage no longer exists.' }

  const { error } = await supabase
    .from('opportunities')
    .update({ stage_id: input.stageId })
    .eq('id', input.opportunityId)

  // The reopen guard in stamp_opportunity_close_date() surfaces here, and its
  // message is already written for a person to read.
  if (error) return { ok: false, error: error.message }

  revalidateDeal(input.opportunityId)
  return { ok: true, stageId: stage.id, isWon: stage.is_won, isLost: stage.is_lost }
}

// -----------------------------------------------------------------------------
// Closing a deal lost
// -----------------------------------------------------------------------------

export type SimpleResult = { ok: true } | { ok: false; error: string }

/**
 * Why we lost, and to whom. Not enforced by the database: the drag sets the
 * stage before this form can collect anything, so a NOT NULL rule would make the
 * drag itself fail. Everything here is optional.
 */
export async function recordLoss(input: {
  opportunityId: string
  lossReasonId: string | null
  competitorId: string | null
  newCompetitorName: string | null
  notes: string | null
}): Promise<SimpleResult> {
  const supabase = await createClient()

  let competitorId = input.competitorId

  // Anyone can name a competitor on the spot. Waiting for an admin to add
  // "Janitronics" is how the field stops filling this in at all.
  if (!competitorId && input.newCompetitorName?.trim()) {
    const name = input.newCompetitorName.trim()
    const { data: existing } = await supabase
      .from('competitors')
      .select('id')
      .ilike('name', name)
      .maybeSingle()

    if (existing) {
      competitorId = existing.id
    } else {
      const { data, error } = await supabase
        .from('competitors')
        .insert({ name })
        .select('id')
        .single()
      if (error) return { ok: false, error: `Could not add that competitor: ${error.message}` }
      competitorId = data.id
    }
  }

  const { error } = await supabase
    .from('opportunities')
    .update({
      loss_reason_id: input.lossReasonId,
      competitor_id: competitorId,
      scope_notes: input.notes,
    })
    .eq('id', input.opportunityId)

  if (error) return { ok: false, error: error.message }

  revalidateDeal(input.opportunityId)
  return { ok: true }
}

/** Why we won. win_notes is the sentence; win_reason_id is the ranked category. */
export async function recordWin(input: {
  opportunityId: string
  winReasonId: string | null
  winNotes: string | null
}): Promise<SimpleResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('opportunities')
    .update({ win_reason_id: input.winReasonId, win_notes: input.winNotes })
    .eq('id', input.opportunityId)

  if (error) return { ok: false, error: error.message }

  revalidateDeal(input.opportunityId)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// Turning a won deal into a building
// -----------------------------------------------------------------------------

export type AccountMatch = { id: string; name: string }

/**
 * What the conversion form should suggest. The account is matched here rather
 * than inside the database function, because matching "Tufts Medicine — CBRE
 * (Reading)" to an existing account is a guess, and a guess has to be shown to
 * somebody before it is written.
 */
export async function proposeConversion(opportunityId: string): Promise<
  | {
      ok: true
      dealName: string
      accountId: string | null
      accountName: string
      buildingName: string
      monthlyValue: number | null
      matches: AccountMatch[]
      alreadyConverted: boolean
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient()

  const { data: deal, error } = await supabase
    .from('opportunities')
    .select('id, name, account_id, building_id, monthly_value')
    .eq('id', opportunityId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!deal) return { ok: false, error: 'That deal no longer exists.' }

  const { splitClientName } = await import('@/lib/import/parse-rows')
  const parsed = splitClientName(deal.name)

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  const key = parsed.accountName.trim().toLowerCase()
  const exact = (accounts ?? []).find((a) => a.name.trim().toLowerCase() === key)

  // An exact name match is offered as the account; anything sharing the first
  // word is offered as a shortlist rather than chosen automatically.
  const firstWord = key.split(/\s+/)[0] ?? ''
  const shortlist = (accounts ?? []).filter(
    (a) => firstWord.length > 2 && a.name.toLowerCase().includes(firstWord),
  )

  return {
    ok: true,
    dealName: deal.name,
    accountId: deal.account_id ?? exact?.id ?? null,
    accountName: parsed.accountName,
    buildingName: parsed.buildingName,
    monthlyValue: deal.monthly_value === null ? null : Number(deal.monthly_value),
    matches: (shortlist.length > 0 ? shortlist : (accounts ?? [])).slice(0, 50),
    alreadyConverted: deal.building_id !== null,
  }
}

/**
 * One RPC call. Everything it does — create or reuse the account, create the
 * building, open the contract period, link the deal — happens in one Postgres
 * transaction, because four separate calls from here could leave a live building
 * with no contract period and therefore no revenue, silently and forever.
 */
export async function convertWonDeal(input: {
  opportunityId: string
  accountId: string | null
  accountName: string | null
  buildingName: string | null
  monthlyValue: number | null
  effectiveDate: string | null
}): Promise<{ ok: true; buildingId: string } | { ok: false; error: string }> {
  const supabase = await createClient()

  // The function's parameters all have defaults, so the generated types want
  // them left out rather than passed as null.
  const { data, error } = await supabase.rpc('convert_opportunity_to_building', {
    p_opportunity_id: input.opportunityId,
    p_account_id: input.accountId ?? undefined,
    p_account_name: input.accountName ?? undefined,
    p_building_name: input.buildingName ?? undefined,
    p_monthly_value: input.monthlyValue ?? undefined,
    p_effective_date: input.effectiveDate ?? new Date().toISOString().slice(0, 10),
  })

  // The function raises in plain English, so pass it straight through.
  if (error) return { ok: false, error: error.message }

  revalidateDeal(input.opportunityId)
  revalidatePath('/accounts')
  revalidatePath('/buildings')
  return { ok: true, buildingId: data as unknown as string }
}

/** Undo the link, so a mistaken conversion can be reversed and the deal reopened. */
export async function unlinkConvertedBuilding(opportunityId: string): Promise<SimpleResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('opportunities')
    .update({ building_id: null })
    .eq('id', opportunityId)

  if (error) return { ok: false, error: error.message }

  // The building itself is deliberately left alone. It may already be staffed
  // and billing, and deleting it from here would be a surprise.
  revalidateDeal(opportunityId)
  return { ok: true }
}

export async function deleteOpportunity(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('opportunities')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  revalidateDeal(id)
  redirect('/opportunities')
}
