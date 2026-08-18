'use server'

import { revalidatePath } from 'next/cache'

import { getCurrentProfile } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin clean-up: archiving and merging records that the import left duplicated.
 *
 * Everything here is a SOFT delete. Nothing is ever removed from the database,
 * for a reason worth stating plainly: `activities.account_id` is declared
 * `on delete cascade`, so hard-deleting one duplicated account would take every
 * activity ever logged against it with no undo and no screen to show it. The
 * Cancer Center account alone carries 44. There is no button in this app that
 * can do that, and there should not be.
 *
 * Archiving sets `deleted_at`. Every query in the app already filters on it, so
 * an archived record vanishes from lists, pickers and reports while keeping its
 * history, its audit rows and its place on anything that referenced it.
 */

export type CleanupResult = { ok: true; message: string } | { ok: false; error: string }

/** Tables that can be archived here. Reference data is edited at /admin/reference
 *  and deliberately not exposed to this screen. */
export type ArchivableTable = 'accounts' | 'buildings' | 'contacts' | 'opportunities' | 'sites'

async function requireAdmin() {
  const profile = await getCurrentProfile()
  if (profile?.role !== 'admin') return null
  return profile
}

/**
 * Refuse to archive something that other live records still depend on.
 *
 * This is the whole safety story. Archiving an account that still owns
 * buildings would leave those buildings pointing at a record no screen can
 * show, and archiving a building that still bills would drop its value out of
 * MRR with no movement recorded anywhere — a silent contraction, which is the
 * one thing the revenue model is built to make impossible.
 */
async function blockers(table: ArchivableTable, id: string): Promise<string | null> {
  const supabase = await createClient()

  if (table === 'accounts') {
    const { count } = await supabase
      .from('buildings')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', id)
      .is('deleted_at', null)
    if (count && count > 0) {
      return `This account still has ${count} live building${count === 1 ? '' : 's'}. Move or archive them first — otherwise they point at an account nothing can show.`
    }
  }

  if (table === 'buildings') {
    const { data } = await supabase
      .from('building_contract_periods')
      .select('monthly_value')
      .eq('building_id', id)
      .is('end_date', null)
    const open = data ?? []
    if (open.length > 0) {
      const value = open.reduce((sum, p) => sum + Number(p.monthly_value ?? 0), 0)
      return `This building still bills $${value.toLocaleString()} a month. Move its contract to the record you are keeping, or close it, before archiving — archiving it now would remove that from MRR with no movement recorded.`
    }
  }

  return null
}

export async function archiveRecord(
  table: ArchivableTable,
  id: string,
): Promise<CleanupResult> {
  if (!(await requireAdmin())) return { ok: false, error: 'Only an admin can archive records.' }

  const blocked = await blockers(table, id)
  if (blocked) return { ok: false, error: blocked }

  const supabase = await createClient()
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/cleanup')
  revalidatePath('/accounts')
  revalidatePath('/buildings')
  return { ok: true, message: 'Archived. It is hidden everywhere, and nothing was deleted.' }
}

export async function restoreRecord(
  table: ArchivableTable,
  id: string,
): Promise<CleanupResult> {
  if (!(await requireAdmin())) return { ok: false, error: 'Only an admin can restore records.' }

  const supabase = await createClient()
  const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/cleanup')
  revalidatePath('/accounts')
  revalidatePath('/buildings')
  return { ok: true, message: 'Restored.' }
}

/**
 * Move everything an account owns onto another account.
 *
 * `buildingId`, when given, also stamps that building onto every activity that
 * moves. That is what turns "44 activities filed under a duplicate Cancer
 * Center account" into "44 activities against the Cancer Center building under
 * South Shore Health", which is where they belonged all along.
 *
 * Contract periods are deliberately NOT touched: they live on buildings, so
 * they travel with the building. Consolidating two buildings at one address is
 * a separate, explicit step — moveContracts below.
 */
export async function mergeAccount(options: {
  fromAccountId: string
  intoAccountId: string
  buildingId?: string | null
}): Promise<CleanupResult> {
  if (!(await requireAdmin())) return { ok: false, error: 'Only an admin can merge accounts.' }

  const { fromAccountId, intoAccountId, buildingId } = options
  if (fromAccountId === intoAccountId) {
    return { ok: false, error: 'Those are the same account.' }
  }

  const supabase = await createClient()
  const moved: string[] = []

  const activityPatch: { account_id: string; building_id?: string } = { account_id: intoAccountId }
  if (buildingId) activityPatch.building_id = buildingId

  const { count: activityCount, error: activityError } = await supabase
    .from('activities')
    .update(activityPatch, { count: 'exact' })
    .eq('account_id', fromAccountId)

  if (activityError) return { ok: false, error: `Activities: ${activityError.message}` }
  if (activityCount) moved.push(`${activityCount} activities`)

  for (const [table, label] of [
    ['buildings', 'buildings'],
    ['contacts', 'contacts'],
    ['opportunities', 'deals'],
    ['next_steps', 'next steps'],
  ] as const) {
    const { count, error } = await supabase
      .from(table)
      .update({ account_id: intoAccountId }, { count: 'exact' })
      .eq('account_id', fromAccountId)

    if (error) return { ok: false, error: `${label}: ${error.message}` }
    if (count) moved.push(`${count} ${label}`)
  }

  revalidatePath('/admin/cleanup')
  revalidatePath('/accounts')
  revalidatePath('/activity')

  return {
    ok: true,
    message: moved.length
      ? `Moved ${moved.join(', ')}. The old account is now empty and can be archived.`
      : 'That account had nothing on it. It can be archived as it is.',
  }
}

/**
 * Consolidate two buildings at one address.
 *
 * Calls the database function rather than doing it here, because closing one
 * period and opening another would write churn AND new business into the same
 * month of the revenue waterfall — a contraction and a win that never happened.
 * The function repoints the existing rows instead, so company MRR is
 * arithmetically identical before and after.
 */
export async function moveContracts(
  fromBuildingId: string,
  toBuildingId: string,
): Promise<CleanupResult> {
  if (!(await requireAdmin())) {
    return { ok: false, error: 'Only an admin can move contract history.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('move_contract_periods_to_building', {
    p_from_building: fromBuildingId,
    p_to_building: toBuildingId,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/cleanup')
  revalidatePath('/buildings')
  revalidatePath('/reports/revenue')

  return {
    ok: true,
    message: `Moved ${data ?? 0} contract period(s). Company MRR is unchanged — no churn and no new business was recorded.`,
  }
}
