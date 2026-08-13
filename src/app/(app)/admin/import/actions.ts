'use server'

import { revalidatePath } from 'next/cache'

import {
  buildActiveClientsProposal,
  buildContactsProposal,
  type ProposedBuilding,
  type ProposedContact,
  type SkippedRow,
} from '@/lib/import/active-clients'
import { IMPORTERS, guessMapping, type ImporterKey } from '@/lib/import/definitions'
import type { Json } from '@/lib/database.types'
import { readWorkbook } from '@/lib/import/workbook'
import { createClient } from '@/lib/supabase/server'

export type SheetSummary = { name: string; headerRow: number; headers: string[]; rowCount: number }

export type ParseResult =
  | { ok: false; error: string }
  | {
      ok: true
      fileName: string
      sheets: SheetSummary[]
      selectedSheet: string
      mapping: Record<string, number>
      profiles: { id: string; full_name: string }[]
    }

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, admin: false as const }

  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, admin: data?.role === 'admin', userId: user.id }
}

/** Step 1 → 2. Read the file, list its sheets, and guess the column mapping. */
export async function parseUpload(formData: FormData): Promise<ParseResult> {
  const { admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can import data.' }

  const file = formData.get('file')
  const importerKey = String(formData.get('importer') ?? '') as ImporterKey
  const def = IMPORTERS[importerKey]

  if (!def) return { ok: false, error: 'Choose what you are importing.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a file.' }

  let sheets
  try {
    sheets = await readWorkbook(await file.arrayBuffer(), file.name)
  } catch (error) {
    return {
      ok: false,
      error: `Could not read that file: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }

  if (sheets.length === 0) return { ok: false, error: 'That file has no sheets in it.' }

  const selected =
    sheets.find((s) => s.name.toLowerCase().includes(def.sheetHint)) ?? sheets[0]

  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')

  return {
    ok: true,
    fileName: file.name,
    sheets: sheets.map((s) => ({
      name: s.name,
      headerRow: s.headerRow,
      headers: s.headers,
      rowCount: s.rows.length,
    })),
    selectedSheet: selected.name,
    mapping: guessMapping(def, selected.headers),
    profiles: profiles ?? [],
  }
}

export type PreviewResult =
  | { ok: false; error: string }
  | {
      ok: true
      kind: 'active-clients'
      buildings: ProposedBuilding[]
      skipped: SkippedRow[]
    }
  | { ok: true; kind: 'contacts'; contacts: ProposedContact[]; skipped: SkippedRow[] }

/**
 * Step 2 → 3. The file is re-read rather than held in memory between steps:
 * server actions are stateless, and a 300KB spreadsheet is quick to parse twice.
 */
export async function previewImport(formData: FormData): Promise<PreviewResult> {
  const { admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can import data.' }

  const file = formData.get('file')
  const importerKey = String(formData.get('importer') ?? '') as ImporterKey
  const sheetName = String(formData.get('sheet') ?? '')
  const mapping = JSON.parse(String(formData.get('mapping') ?? '{}')) as Record<string, number>

  if (!(file instanceof File)) return { ok: false, error: 'The file was lost — please choose it again.' }

  const sheets = await readWorkbook(await file.arrayBuffer(), file.name)
  const sheet = sheets.find((s) => s.name === sheetName)
  if (!sheet) return { ok: false, error: `Sheet "${sheetName}" is not in that file.` }

  const supabase = await createClient()
  const { data: profiles } = await supabase.from('profiles').select('id, full_name')

  if (importerKey === 'active-clients') {
    const { buildings, skipped } = buildActiveClientsProposal(
      sheet.rows,
      sheet.rowNumbers,
      mapping,
      profiles ?? [],
    )
    return { ok: true, kind: 'active-clients', buildings, skipped }
  }

  const { contacts, skipped } = buildContactsProposal(sheet.rows, sheet.rowNumbers, mapping)
  return { ok: true, kind: 'contacts', contacts, skipped }
}

export type CommitResult =
  | { ok: false; error: string }
  | {
      ok: true
      batchId: string
      accountsCreated: number
      accountsReused: number
      buildingsCreated: number
      contactsCreated: number
      contactsReused: number
      errors: number
    }

/**
 * Step 3 → done. Everything created carries the batch id, so undoing a bad run
 * is one delete rather than hand-cleaning the portfolio.
 */
export async function commitActiveClients(payload: {
  fileName: string
  sheetName: string
  mapping: Record<string, number>
  buildings: ProposedBuilding[]
}): Promise<CommitResult> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can import data.' }

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      source_tab: `${payload.fileName} · ${payload.sheetName}`,
      file_name: payload.fileName,
      mapping: payload.mapping,
      row_count: payload.buildings.length,
      status: 'draft',
      imported_by: userId,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ok: false, error: `Could not start the import: ${batchError?.message}` }
  }

  const batchId = batch.id
  let accountsCreated = 0
  let accountsReused = 0
  let buildingsCreated = 0
  let contactsCreated = 0
  let contactsReused = 0
  const rowErrors: { batch_id: string; row_number: number; raw_row: Json; error: string }[] = []

  // Existing accounts are matched case-insensitively so a re-import updates
  // rather than duplicating.
  const { data: existingAccounts } = await supabase
    .from('accounts')
    .select('id, name')
    .is('deleted_at', null)
  const accountsByName = new Map(
    (existingAccounts ?? []).map((a) => [a.name.trim().toLowerCase(), a.id]),
  )

  const { data: existingContacts } = await supabase
    .from('contacts')
    .select('id, email')
    .is('deleted_at', null)
  const contactsByEmail = new Map(
    (existingContacts ?? [])
      .filter((c) => c.email)
      .map((c) => [c.email!.trim().toLowerCase(), c.id]),
  )

  const { data: serviceTypes } = await supabase.from('service_types').select('id, name')
  const serviceTypeByName = new Map(
    (serviceTypes ?? []).map((s) => [s.name.toLowerCase(), s.id]),
  )

  for (const proposed of payload.buildings) {
    try {
      const key = proposed.accountName.trim().toLowerCase()
      let accountId = accountsByName.get(key)

      if (!accountId) {
        const { data: account, error } = await supabase
          .from('accounts')
          .insert({
            name: proposed.accountName.trim(),
            status: 'active',
            owner_id: proposed.ownerId,
            secondary_owner_id: proposed.secondaryOwnerId,
            import_batch_id: batchId,
          })
          .select('id')
          .single()
        if (error || !account) throw new Error(`account: ${error?.message}`)
        accountId = account.id
        accountsByName.set(key, accountId)
        accountsCreated++
      } else {
        accountsReused++
      }

      const { data: building, error: buildingError } = await supabase
        .from('buildings')
        .insert({
          account_id: accountId,
          name: proposed.buildingName,
          address_line1: proposed.addressLine1,
          city: proposed.city,
          state: proposed.state,
          postal_code: proposed.postalCode,
          square_footage: proposed.squareFootage,
          contract_start_date: proposed.contractStart,
          contract_end_date: proposed.contractEnd,
          health_score: proposed.healthScore,
          owner_id: proposed.ownerId,
          secondary_owner_id: proposed.secondaryOwnerId,
          scope_notes: proposed.scopeNotes,
          status: 'active',
          inspectqa_site_id: proposed.inspectqaSiteId,
          import_batch_id: batchId,
        })
        .select('id')
        .single()

      if (buildingError || !building) throw new Error(`building: ${buildingError?.message}`)
      buildingsCreated++

      if (proposed.serviceTypes.length > 0) {
        const links = proposed.serviceTypes
          .map((name) => serviceTypeByName.get(name.toLowerCase()))
          .filter((id): id is string => Boolean(id))
          .map((service_type_id) => ({ building_id: building.id, service_type_id }))
        if (links.length > 0) await supabase.from('building_services').insert(links)
      }

      // Always through the helper, so the revenue history is built properly.
      if (proposed.monthlyValue !== null) {
        const { error } = await supabase.rpc('set_building_monthly_value', {
          p_building_id: building.id,
          p_monthly_value: proposed.monthlyValue,
          p_effective_date:
            proposed.contractStart ?? new Date().toISOString().slice(0, 10),
          p_reason: 'initial',
        })
        if (error) throw new Error(`contract value: ${error.message}`)
      }

      if (proposed.contact && (proposed.contact.firstName || proposed.contact.lastName)) {
        const emailKey = proposed.contact.email?.trim().toLowerCase()
        let contactId = emailKey ? contactsByEmail.get(emailKey) : undefined

        if (!contactId) {
          const { data: contact, error } = await supabase
            .from('contacts')
            .insert({
              first_name: proposed.contact.firstName,
              last_name: proposed.contact.lastName,
              email: proposed.contact.email,
              phone: proposed.contact.phone,
              account_id: accountId,
              import_batch_id: batchId,
            })
            .select('id')
            .single()
          if (error || !contact) throw new Error(`contact: ${error?.message}`)
          contactId = contact.id
          if (emailKey) contactsByEmail.set(emailKey, contactId)
          contactsCreated++
        } else {
          contactsReused++
        }

        await supabase
          .from('contact_buildings')
          .upsert(
            { contact_id: contactId, building_id: building.id, is_primary: true },
            { onConflict: 'contact_id,building_id' },
          )
      }
    } catch (error) {
      rowErrors.push({
        batch_id: batchId,
        row_number: proposed.rowNumber,
        // Round-tripped so what is stored is guaranteed JSON-safe.
        raw_row: JSON.parse(JSON.stringify(proposed)) as Json,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  if (rowErrors.length > 0) await supabase.from('import_row_errors').insert(rowErrors)

  await supabase
    .from('import_batches')
    .update({
      status: 'committed',
      committed_at: new Date().toISOString(),
      row_count: buildingsCreated,
    })
    .eq('id', batchId)

  revalidatePath('/accounts')
  revalidatePath('/buildings')
  revalidatePath('/contacts')
  revalidatePath('/admin/import')

  return {
    ok: true,
    batchId,
    accountsCreated,
    accountsReused,
    buildingsCreated,
    contactsCreated,
    contactsReused,
    errors: rowErrors.length,
  }
}

export async function commitContacts(payload: {
  fileName: string
  sheetName: string
  mapping: Record<string, number>
  contacts: ProposedContact[]
}): Promise<CommitResult> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can import data.' }

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      source_tab: `${payload.fileName} · ${payload.sheetName}`,
      file_name: payload.fileName,
      mapping: payload.mapping,
      row_count: payload.contacts.length,
      status: 'draft',
      imported_by: userId,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ok: false, error: `Could not start the import: ${batchError?.message}` }
  }

  const batchId = batch.id
  let contactsCreated = 0
  let contactsReused = 0
  const rowErrors: { batch_id: string; row_number: number; raw_row: Json; error: string }[] = []

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .is('deleted_at', null)
  const accountsByName = new Map((accounts ?? []).map((a) => [a.name.trim().toLowerCase(), a.id]))

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, email')
    .is('deleted_at', null)
  const byEmail = new Map(
    (existing ?? []).filter((c) => c.email).map((c) => [c.email!.trim().toLowerCase(), c.id]),
  )

  for (const proposed of payload.contacts) {
    try {
      const emailKey = proposed.email?.trim().toLowerCase()
      if (emailKey && byEmail.has(emailKey)) {
        contactsReused++
        continue
      }

      const { error } = await supabase.from('contacts').insert({
        first_name: proposed.firstName,
        last_name: proposed.lastName,
        title: proposed.title,
        email: proposed.email,
        phone: proposed.phone,
        contact_role: proposed.relationship,
        notes: proposed.notes,
        account_id: proposed.companyName
          ? (accountsByName.get(proposed.companyName.trim().toLowerCase()) ?? null)
          : null,
        import_batch_id: batchId,
      })
      if (error) throw new Error(error.message)

      if (emailKey) byEmail.set(emailKey, 'created')
      contactsCreated++
    } catch (error) {
      rowErrors.push({
        batch_id: batchId,
        row_number: proposed.rowNumber,
        // Round-tripped so what is stored is guaranteed JSON-safe.
        raw_row: JSON.parse(JSON.stringify(proposed)) as Json,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  if (rowErrors.length > 0) await supabase.from('import_row_errors').insert(rowErrors)

  await supabase
    .from('import_batches')
    .update({
      status: 'committed',
      committed_at: new Date().toISOString(),
      row_count: contactsCreated,
    })
    .eq('id', batchId)

  revalidatePath('/contacts')
  revalidatePath('/admin/import')

  return {
    ok: true,
    batchId,
    accountsCreated: 0,
    accountsReused: 0,
    buildingsCreated: 0,
    contactsCreated,
    contactsReused,
    errors: rowErrors.length,
  }
}

/**
 * Undo. Deletes only what this batch created — accounts that already existed
 * were reused rather than stamped, so they survive.
 */
export async function rollbackImport(batchId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can undo an import.' }

  // Order matters: buildings reference accounts, and contract periods and
  // contact links cascade from the building.
  await supabase.from('buildings').delete().eq('import_batch_id', batchId)
  await supabase.from('contacts').delete().eq('import_batch_id', batchId)
  const { error } = await supabase.from('accounts').delete().eq('import_batch_id', batchId)
  if (error) return { ok: false, error: error.message }

  await supabase.from('import_batches').update({ status: 'rolled_back' }).eq('id', batchId)

  revalidatePath('/accounts')
  revalidatePath('/buildings')
  revalidatePath('/contacts')
  revalidatePath('/admin/import')
  return { ok: true }
}
