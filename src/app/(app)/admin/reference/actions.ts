'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

/**
 * The reference lists an admin can edit without a migration: deal stages and
 * their win probabilities, loss reasons, win reasons, lead sources, competitors.
 *
 * RLS already blocks a non-admin from writing any of these, so this is a second
 * lock rather than the only one — but a clear message beats a Postgres error.
 */
const TABLES = {
  pipeline_stages: '/admin/reference',
  loss_reasons: '/admin/reference',
  win_reasons: '/admin/reference',
  lead_sources: '/admin/reference',
  competitors: '/admin/reference',
} as const

export type ReferenceTable = keyof typeof TABLES

export type Result = { ok: true } | { ok: false; error: string }

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, admin: false }

  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, admin: data?.role === 'admin' }
}

function done(table: ReferenceTable) {
  revalidatePath(TABLES[table])
  revalidatePath('/opportunities')
  revalidatePath('/reports/pipeline')
}

export async function saveReferenceRow(input: {
  table: ReferenceTable
  id?: string
  name: string
  sortOrder?: number | null
  probability?: number | null
  isActive?: boolean
}): Promise<Result> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can change reference data.' }

  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Give it a name.' }

  const values: {
    name: string
    sort_order?: number
    probability?: number
    is_active?: boolean
  } = { name }
  // competitors has no sort_order column, so only send what the table has.
  if (input.table !== 'competitors' && input.sortOrder !== undefined && input.sortOrder !== null) {
    values.sort_order = input.sortOrder
  }
  if (input.table === 'pipeline_stages' && input.probability !== undefined && input.probability !== null) {
    if (input.probability < 0 || input.probability > 100) {
      return { ok: false, error: 'A probability has to be between 0 and 100.' }
    }
    values.probability = input.probability
  }
  if (input.isActive !== undefined) values.is_active = input.isActive

  // The five tables have slightly different columns — competitors has no
  // sort_order, only stages have probability — and the guards above mean we only
  // ever set a column the chosen table actually has. TypeScript can't see that
  // from `input.table`, so it is asserted once here rather than fanning this
  // function out into five near-identical copies.
  const payload = values as never

  const query = input.id
    ? supabase.from(input.table).update(payload).eq('id', input.id)
    : supabase.from(input.table).insert(payload)

  const { error } = await query
  if (error) return { ok: false, error: error.message }

  done(input.table)
  return { ok: true }
}

/**
 * Retire rather than delete. Anything already pointing at the row keeps reading,
 * and a delete would fail the moment one deal used it.
 */
export async function setReferenceRowActive(input: {
  table: ReferenceTable
  id: string
  isActive: boolean
}): Promise<Result> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can change reference data.' }

  const { error } = await supabase
    .from(input.table)
    .update({ is_active: input.isActive })
    .eq('id', input.id)

  if (error) return { ok: false, error: error.message }

  done(input.table)
  return { ok: true }
}
