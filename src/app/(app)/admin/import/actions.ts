'use server'

import { revalidatePath } from 'next/cache'

import {
  buildActiveClientsProposal,
  buildContactsProposal,
  type ProposedBuilding,
  type ProposedContact,
  type SkippedRow,
} from '@/lib/import/active-clients'
import { buildActivitiesProposal, type ProposedActivity } from '@/lib/import/activities'
import { IMPORTERS, guessMapping, type ImporterKey } from '@/lib/import/definitions'
import {
  buildFillProposal,
  scopeFromHeaders,
  SCOPE_TABLE,
  type FillTargets,
  type ProposedFill,
} from '@/lib/import/fill'
import { ID_HEADERS, type GapScope } from '@/lib/gaps'
import { fetchScope } from '@/lib/gaps/scope'
import { buildPipelineProposal, type ProposedDeal } from '@/lib/import/pipeline'
import { buildWonLostProposal, mapLossReason, type ProposedOutcome } from '@/lib/import/won-lost'
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
  | { ok: true; kind: 'pipeline'; deals: ProposedDeal[]; skipped: SkippedRow[] }
  | { ok: true; kind: 'won-lost'; outcomes: ProposedOutcome[]; skipped: SkippedRow[] }
  | { ok: true; kind: 'activities'; activities: ProposedActivity[]; skipped: SkippedRow[] }
  | {
      ok: true
      kind: 'gap-fill'
      scope: GapScope
      fills: ProposedFill[]
      skipped: SkippedRow[]
      ignoredColumns: string[]
      missingColumns: string[]
    }

/**
 * Everything the gap-filler needs to turn a spreadsheet cell into a change.
 *
 * `current` is the sheet as the download wrote it, keyed by record id — so a
 * cell Ryan did not touch compares equal and produces no change at all. It is
 * built from fetchScope(), the same function the download uses, which is the
 * only way to guarantee the two agree.
 */
async function buildFillTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: GapScope,
): Promise<FillTargets> {
  const [{ rows, columns }, { data: segments }, { data: profiles }, { data: accounts }, { data: contacts }] =
    await Promise.all([
      fetchScope(supabase, scope),
      supabase.from('property_types').select('id, name').eq('is_active', true),
      // Active profiles only. Brendan and the QA logins are deactivated and
      // must never be offered as an owner in an error message.
      supabase.from('profiles').select('id, full_name').eq('is_active', true),
      supabase.from('accounts').select('id, name').is('deleted_at', null),
      supabase.from('contacts').select('id, first_name, last_name, email').is('deleted_at', null),
    ])

  const current = new Map<string, Record<string, string>>()
  const labels = new Map<string, string>()
  const idHeader = ID_HEADERS[scope]
  const labelHeader = columns[1]?.header ?? idHeader

  for (const row of rows) {
    const cells: Record<string, string> = {}
    for (const column of columns) {
      const value = column.value(row)
      cells[column.header] = value === null || value === undefined ? '' : String(value)
    }
    const id = (cells[idHeader] ?? '').toLowerCase()
    if (!id) continue
    current.set(id, cells)
    labels.set(id, cells[labelHeader] || id)
  }

  const canFillValue = new Set<string>()
  const contractStart = new Map<string, string | null>()

  if (scope === 'buildings') {
    const [{ data: periods }, { data: buildings }] = await Promise.all([
      supabase.from('building_contract_periods').select('building_id'),
      supabase.from('buildings').select('id, contract_start_date').is('deleted_at', null),
    ])
    const hasPeriod = new Set((periods ?? []).map((p) => String(p.building_id).toLowerCase()))
    for (const b of buildings ?? []) {
      const id = String(b.id).toLowerCase()
      contractStart.set(id, b.contract_start_date)
      if (!hasPeriod.has(id)) canFillValue.add(id)
    }
  }

  return {
    current,
    labels,
    canFillValue,
    contractStart,
    segments: (segments ?? []).map((s) => ({ id: s.id, name: s.name })),
    profiles: (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name })),
    accounts: (accounts ?? []).map((a) => ({ id: a.id, name: a.name })),
    contacts: (contacts ?? []).map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim(),
      email: c.email ?? '',
    })),
  }
}

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

  // A switch rather than a chain of ifs. The old chain ended in a bare
  // fall-through that ran the *contacts* builder for anything it did not
  // recognise, so a mis-keyed file was silently imported as contacts.
  switch (importerKey) {
    case 'active-clients': {
      const { buildings, skipped } = buildActiveClientsProposal(
        sheet.rows,
        sheet.rowNumbers,
        mapping,
        profiles ?? [],
      )
      return { ok: true, kind: 'active-clients', buildings, skipped }
    }

    case 'activities': {
      // Matching happens here, not at commit, so the preview shows exactly which
      // account and building each row will land on.
      const [{ data: accounts }, { data: buildings }] = await Promise.all([
        supabase.from('accounts').select('id, name').is('deleted_at', null),
        supabase.from('buildings').select('id, name, account_id').is('deleted_at', null),
      ])
      const { activities, skipped } = buildActivitiesProposal(
        sheet.rows,
        sheet.rowNumbers,
        mapping,
        { accounts: accounts ?? [], buildings: buildings ?? [] },
      )
      return { ok: true, kind: 'activities', activities, skipped }
    }

    case 'pipeline': {
      const [{ data: accounts }, { data: buildings }, { data: stages }] = await Promise.all([
        supabase.from('accounts').select('id, name').is('deleted_at', null),
        supabase.from('buildings').select('id, name, account_id').is('deleted_at', null),
        supabase.from('pipeline_stages').select('id, name, is_won'),
      ])
      const { deals, skipped } = buildPipelineProposal(sheet.rows, sheet.rowNumbers, mapping, {
        accounts: accounts ?? [],
        buildings: buildings ?? [],
        stages: stages ?? [],
        profiles: profiles ?? [],
      })
      return { ok: true, kind: 'pipeline', deals, skipped }
    }

    case 'won-lost': {
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select('id, name')
        .is('deleted_at', null)
      const { outcomes, skipped } = buildWonLostProposal(sheet.rows, sheet.rowNumbers, mapping, {
        opportunities: opportunities ?? [],
      })
      return { ok: true, kind: 'won-lost', outcomes, skipped }
    }

    case 'contacts': {
      const { contacts, skipped } = buildContactsProposal(sheet.rows, sheet.rowNumbers, mapping)
      return { ok: true, kind: 'contacts', contacts, skipped }
    }

    case 'gap-fill': {
      // The scope comes from the file's own first column, not from a dropdown:
      // this app wrote the sheet, so it can say what it is, and a buildings
      // sheet uploaded by mistake should be an error rather than zero rows.
      const scope = scopeFromHeaders(sheet.headers)
      if (!scope) {
        return {
          ok: false,
          error: `That does not look like a gap sheet. The first column should be one of ${Object.values(ID_HEADERS).join(', ')} — this one is "${sheet.headers[0] ?? '(empty)'}".`,
        }
      }

      const targets = await buildFillTargets(supabase, scope)
      const { rows, skipped, ignoredColumns, missingColumns } = buildFillProposal(
        scope,
        sheet.headers,
        sheet.rows,
        sheet.rowNumbers,
        targets,
        new Date().toISOString().slice(0, 10),
      )
      return { ok: true, kind: 'gap-fill', scope, fills: rows, skipped, ignoredColumns, missingColumns }
    }

    default: {
      // ImporterKey is a closed union, so a new importer that forgets a branch
      // here fails `npm run typecheck` rather than importing as contacts.
      const never: never = importerKey
      return { ok: false, error: `Unknown importer: ${String(never)}` }
    }
  }
}


export type CommitResult =
  | { ok: false; error: string }
  | {
      ok: true
      batchId: string
      accountsCreated: number
      accountsReused: number
      buildingsCreated: number
      activitiesCreated: number
      contactsCreated: number
      contactsReused: number
      dealsCreated: number
      dealsUpdated: number
      errors: number
      /**
       * The gap-filler's counters. Optional so the five importers that create
       * records rather than fill them in do not have to zero-fill three more
       * fields — the done panel guards every counter with `> 0 &&` anyway.
       */
      recordsUpdated?: number
      fieldsChanged?: number
      contractValuesSet?: number
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
    activitiesCreated: 0,
    contactsCreated,
    contactsReused,
    dealsCreated: 0,
    dealsUpdated: 0,
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
    activitiesCreated: 0,
    contactsCreated,
    contactsReused,
    dealsCreated: 0,
    dealsUpdated: 0,
    errors: rowErrors.length,
  }
}

export async function commitActivities(payload: {
  fileName: string
  sheetName: string
  mapping: Record<string, number>
  activities: ProposedActivity[]
}): Promise<CommitResult> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can import data.' }

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      source_tab: `${payload.fileName} · ${payload.sheetName}`,
      file_name: payload.fileName,
      mapping: payload.mapping,
      row_count: payload.activities.length,
      status: 'draft',
      imported_by: userId,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ok: false, error: `Could not start the import: ${batchError?.message}` }
  }

  const batchId = batch.id
  let created = 0
  const rowErrors: { batch_id: string; row_number: number; raw_row: Json; error: string }[] = []

  const [{ data: types }, { data: people }] = await Promise.all([
    supabase.from('activity_types').select('id, name'),
    supabase.from('profiles').select('id, full_name'),
  ])

  const typeByName = new Map((types ?? []).map((t) => [t.name.toLowerCase(), t.id]))
  const noteTypeId = typeByName.get('note')

  const rows = payload.activities.map((a) => {
    const typeId = typeByName.get(a.typeName.toLowerCase()) ?? noteTypeId
    // "Ryan / Robert" logged it — the first name listed is who it is filed under.
    const firstName = a.ownerName?.split(/[/&,]/)[0]?.trim().toLowerCase()
    const loggedBy =
      (firstName && people?.find((p) => p.full_name.toLowerCase().startsWith(firstName))?.id) ||
      userId

    return {
      activity_type_id: typeId!,
      subject: a.subject,
      body: a.body,
      occurred_at: a.occurredAt ? new Date(a.occurredAt).toISOString() : new Date().toISOString(),
      logged_by: loggedBy,
      // Resolved during preview, so what was shown is what gets written.
      account_id: a.accountId,
      building_id: a.buildingId,
      source: a.source as 'manual',
      import_batch_id: batchId,
      rowNumber: a.rowNumber,
    }
  })

  // 670 rows one at a time is slow and hammers the connection; insert in
  // chunks and fall back to per-row only for a chunk that fails.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    // rowNumber is carried alongside for error reporting; strip it before insert.
    const payloadRows = chunk.map((row) => {
      const rest = { ...row } as Partial<typeof row>
      delete rest.rowNumber
      return rest as Omit<typeof row, 'rowNumber'>
    })
    const { error } = await supabase.from('activities').insert(payloadRows)

    if (!error) {
      created += chunk.length
      continue
    }

    for (const row of chunk) {
      const rowNumber = row.rowNumber
      const rest = { ...row } as Partial<typeof row>
      delete rest.rowNumber
      const { error: rowError } = await supabase
        .from('activities')
        .insert(rest as Omit<typeof row, 'rowNumber'>)
      if (rowError) {
        rowErrors.push({
          batch_id: batchId,
          row_number: rowNumber,
          raw_row: JSON.parse(JSON.stringify(rest)) as Json,
          error: rowError.message,
        })
      } else {
        created++
      }
    }
  }

  if (rowErrors.length > 0) await supabase.from('import_row_errors').insert(rowErrors)

  await supabase
    .from('import_batches')
    .update({ status: 'committed', committed_at: new Date().toISOString(), row_count: created })
    .eq('id', batchId)

  revalidatePath('/activity')
  revalidatePath('/admin/import')

  return {
    ok: true,
    batchId,
    accountsCreated: 0,
    accountsReused: 0,
    buildingsCreated: 0,
    activitiesCreated: created,
    contactsCreated: 0,
    contactsReused: 0,
    dealsCreated: 0,
    dealsUpdated: 0,
    errors: rowErrors.length,
  }
}

/**
 * The Pipeline tab. One row per deal, matched to an account and a stage during
 * the preview, so what was shown is what gets written.
 */
export async function commitPipeline(payload: {
  fileName: string
  sheetName: string
  mapping: Record<string, number>
  deals: ProposedDeal[]
}): Promise<CommitResult> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can import data.' }

  const usable = payload.deals.filter((d) => !d.error)

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      source_tab: `${payload.fileName} · ${payload.sheetName}`,
      file_name: payload.fileName,
      mapping: payload.mapping,
      row_count: usable.length,
      status: 'draft',
      imported_by: userId,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ok: false, error: `Could not start the import: ${batchError?.message}` }
  }

  const batchId = batch.id
  const rowErrors: { batch_id: string; row_number: number; raw_row: Json; error: string }[] = []

  // A row whose stage did not match never had a home to go to. Record it as an
  // error rather than parking it in a stage nobody chose.
  for (const bad of payload.deals.filter((d) => d.error)) {
    rowErrors.push({
      batch_id: batchId,
      row_number: bad.rowNumber,
      raw_row: JSON.parse(JSON.stringify(bad)) as Json,
      error: bad.error ?? 'Unknown problem.',
    })
  }

  const [{ data: stages }, { data: propertyTypes }, { data: leadSources }] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name'),
    supabase.from('property_types').select('id, name'),
    supabase.from('lead_sources').select('id, name'),
  ])

  const stageByName = new Map((stages ?? []).map((s) => [s.name.toLowerCase(), s.id]))
  const typeByName = new Map((propertyTypes ?? []).map((p) => [p.name.toLowerCase(), p.id]))
  const sourceByName = new Map((leadSources ?? []).map((l) => [l.name.toLowerCase(), l.id]))

  const rows = usable.map((d) => ({
    rowNumber: d.rowNumber,
    name: d.name,
    stage_id: stageByName.get((d.stageName ?? '').toLowerCase()) as string,
    account_id: d.accountId,
    building_id: d.buildingId,
    property_type_id: typeByName.get((d.segmentName ?? '').toLowerCase()) ?? null,
    lead_source_id: sourceByName.get((d.sourceName ?? '').toLowerCase()) ?? null,
    owner_id: d.ownerId,
    secondary_owner_id: d.secondaryOwnerId,
    monthly_value: d.monthlyValue,
    expected_close_date: d.expectedCloseDate,
    scope_notes: d.notes,
    import_batch_id: batchId,
  }))

  let created = 0

  // Fifty-odd rows one at a time is fine, but chunking matches the activity
  // importer and keeps the connection from being hammered on a re-run.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await supabase
      .from('opportunities')
      // rowNumber is carried alongside for error reporting; strip it before insert.
      .insert(
        chunk.map((row) => {
          const rest = { ...row } as Partial<typeof row>
          delete rest.rowNumber
          return rest as Omit<typeof row, 'rowNumber'>
        }),
      )

    if (!error) {
      created += chunk.length
      continue
    }

    // A chunk that fails is retried one row at a time, so one bad row does not
    // take ninety-nine good ones down with it.
    for (const row of chunk) {
      const { rowNumber, ...rest } = row
      const { error: rowError } = await supabase.from('opportunities').insert(rest)
      if (rowError) {
        rowErrors.push({
          batch_id: batchId,
          row_number: rowNumber,
          raw_row: JSON.parse(JSON.stringify(rest)) as Json,
          error: rowError.message,
        })
      } else {
        created += 1
      }
    }
  }

  if (rowErrors.length > 0) await supabase.from('import_row_errors').insert(rowErrors)

  await supabase
    .from('import_batches')
    .update({ status: 'committed', committed_at: new Date().toISOString(), row_count: created })
    .eq('id', batchId)

  revalidatePath('/opportunities')
  revalidatePath('/reports/pipeline')
  revalidatePath('/admin/import')

  return {
    ok: true,
    batchId,
    accountsCreated: 0,
    accountsReused: 0,
    buildingsCreated: 0,
    activitiesCreated: 0,
    contactsCreated: 0,
    contactsReused: 0,
    dealsCreated: created,
    dealsUpdated: 0,
    errors: rowErrors.length,
  }
}

/**
 * The Won/Loss tab. Mostly an UPDATE: these deals already exist from the
 * Pipeline tab, and this fills in the close date, the loss reason, the
 * competitor and what tipped the win.
 *
 * Only a row that matched nothing inserts, and only those inserts carry the
 * batch id — an update to a deal somebody else imported must not be deleted by
 * undoing this batch.
 */
export async function commitWonLost(payload: {
  fileName: string
  sheetName: string
  mapping: Record<string, number>
  outcomes: ProposedOutcome[]
  /** Distinct "Tipped the win" phrases the admin chose to keep as win reasons. */
  winReasonNames: string[]
}): Promise<CommitResult> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can import data.' }

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      source_tab: `${payload.fileName} · ${payload.sheetName}`,
      file_name: payload.fileName,
      mapping: payload.mapping,
      row_count: payload.outcomes.length,
      status: 'draft',
      imported_by: userId,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ok: false, error: `Could not start the import: ${batchError?.message}` }
  }

  const batchId = batch.id
  const rowErrors: { batch_id: string; row_number: number; raw_row: Json; error: string }[] = []

  // The win reasons Ryan ticked in the preview. Created before the deals, so a
  // deal can point at one straight away.
  for (const [index, name] of payload.winReasonNames.entries()) {
    await supabase
      .from('win_reasons')
      .upsert({ name, sort_order: index + 1 }, { onConflict: 'name' })
  }

  const [{ data: stages }, { data: lossReasons }, { data: competitors }, { data: winReasons }] =
    await Promise.all([
      supabase.from('pipeline_stages').select('id, name, is_won, is_lost'),
      supabase.from('loss_reasons').select('id, name'),
      supabase.from('competitors').select('id, name'),
      supabase.from('win_reasons').select('id, name'),
    ])

  const wonStage = (stages ?? []).find((s) => s.is_won)?.id
  const lostStage = (stages ?? []).find((s) => s.is_lost)?.id
  const lossByName = new Map((lossReasons ?? []).map((l) => [l.name.toLowerCase(), l.id]))
  const winByName = new Map((winReasons ?? []).map((w) => [w.name.toLowerCase(), w.id]))
  const competitorByName = new Map((competitors ?? []).map((c) => [c.name.toLowerCase(), c.id]))

  let updated = 0
  let created = 0

  for (const o of payload.outcomes) {
    try {
      let competitorId: string | null = null
      if (o.competitorName) {
        const key = o.competitorName.toLowerCase()
        competitorId = competitorByName.get(key) ?? null
        if (!competitorId) {
          const { data, error } = await supabase
            .from('competitors')
            .insert({ name: o.competitorName })
            .select('id')
            .single()
          if (error) throw new Error(`competitor: ${error.message}`)
          competitorId = data.id
          competitorByName.set(key, competitorId)
        }
      }

      const mappedLoss = mapLossReason(o.lossReasonText)
      const values = {
        stage_id: (o.won ? wonStage : lostStage) as string,
        actual_close_date: o.closeDate,
        opened_on: o.openedOn,
        loss_reason_id: o.won ? null : (lossByName.get((mappedLoss ?? '').toLowerCase()) ?? null),
        competitor_id: competitorId,
        win_notes: o.winNotes,
        win_reason_id: o.winNotes ? (winByName.get(o.winNotes.toLowerCase()) ?? null) : null,
      }

      if (o.opportunityId) {
        // No import_batch_id here: this deal already existed, and stamping it
        // would mean undoing this batch deleted somebody else's import.
        const { error } = await supabase
          .from('opportunities')
          .update(values)
          .eq('id', o.opportunityId)
        if (error) throw new Error(error.message)
        updated += 1
      } else {
        const { error } = await supabase.from('opportunities').insert({
          ...values,
          name: o.company,
          monthly_value: o.monthlyValue,
          import_batch_id: batchId,
        })
        if (error) throw new Error(error.message)
        created += 1
      }
    } catch (error) {
      rowErrors.push({
        batch_id: batchId,
        row_number: o.rowNumber,
        raw_row: JSON.parse(JSON.stringify(o)) as Json,
        error: error instanceof Error ? error.message : 'Unknown problem.',
      })
    }
  }

  if (rowErrors.length > 0) await supabase.from('import_row_errors').insert(rowErrors)

  await supabase
    .from('import_batches')
    .update({
      status: 'committed',
      committed_at: new Date().toISOString(),
      row_count: created + updated,
    })
    .eq('id', batchId)

  revalidatePath('/opportunities')
  revalidatePath('/reports/pipeline')
  revalidatePath('/admin/import')

  return {
    ok: true,
    batchId,
    accountsCreated: 0,
    accountsReused: 0,
    buildingsCreated: 0,
    activitiesCreated: 0,
    contactsCreated: 0,
    contactsReused: 0,
    dealsCreated: created,
    dealsUpdated: updated,
    errors: rowErrors.length,
  }
}

/**
 * The gap-filler's commit.
 *
 * Unlike the other five this creates nothing. Every field it changes goes
 * through apply_gap_fill(), which updates the record and journals the before
 * and after in one transaction — the journal is the only thing that makes undo
 * possible, since there are no batch-stamped rows to delete.
 */
export async function commitFill(payload: {
  fileName: string
  scope: GapScope
  fills: ProposedFill[]
}): Promise<CommitResult> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can import data.' }

  const table = SCOPE_TABLE[payload.scope]
  const usable = payload.fills.filter(
    (f) => !f.error && (f.changes.length > 0 || f.contract !== null),
  )

  if (usable.length === 0) {
    return { ok: false, error: 'Nothing in that file would change anything.' }
  }

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      // Named so the Previous imports list tells a gap fill apart from an
      // import at a glance — the two Undo buttons mean very different things.
      source_tab: `Gap fill · ${payload.scope} · ${payload.fileName}`,
      file_name: payload.fileName,
      mapping: {},
      row_count: usable.length,
      status: 'draft',
      imported_by: userId,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ok: false, error: `Could not start the import: ${batchError?.message}` }
  }
  const batchId = batch.id

  const rowErrors: { batch_id: string; row_number: number; raw_row: Json; error: string }[] = []
  for (const fill of payload.fills) {
    if (fill.error) {
      rowErrors.push({
        batch_id: batchId,
        row_number: fill.rowNumber,
        raw_row: JSON.parse(JSON.stringify({ id: fill.recordId, label: fill.label })) as Json,
        error: fill.error,
      })
    }
  }

  let recordsUpdated = 0
  let fieldsChanged = 0
  let contractValuesSet = 0

  for (const fill of usable) {
    if (fill.changes.length > 0) {
      const values = Object.fromEntries(fill.changes.map((c) => [c.column, c.value]))
      const { data, error } = await supabase.rpc('apply_gap_fill', {
        p_table: table,
        p_record_id: fill.recordId,
        p_values: values as Json,
        p_batch_id: batchId,
      })
      if (error) {
        rowErrors.push({
          batch_id: batchId,
          row_number: fill.rowNumber,
          raw_row: JSON.parse(JSON.stringify(values)) as Json,
          error: `${fill.label}: ${error.message}`,
        })
      } else {
        const changed = Number(data ?? 0)
        if (changed > 0) recordsUpdated += 1
        fieldsChanged += changed
      }
    }

    if (fill.contract) {
      const { error } = await supabase.rpc('fill_building_contract_value', {
        p_building_id: fill.recordId,
        p_monthly_value: fill.contract.monthlyValue,
        p_effective_date: fill.contract.effectiveDate,
        p_import_batch_id: batchId,
      })
      if (error) {
        rowErrors.push({
          batch_id: batchId,
          row_number: fill.rowNumber,
          raw_row: JSON.parse(JSON.stringify(fill.contract)) as Json,
          error: `${fill.label}: ${error.message}`,
        })
      } else {
        contractValuesSet += 1
      }
    }
  }

  if (rowErrors.length > 0) {
    await supabase.from('import_row_errors').insert(rowErrors)
  }

  await supabase
    .from('import_batches')
    .update({
      status: 'committed',
      committed_at: new Date().toISOString(),
      row_count: recordsUpdated + contractValuesSet,
    })
    .eq('id', batchId)

  revalidateAfterImport()

  return {
    ok: true,
    batchId,
    accountsCreated: 0,
    accountsReused: 0,
    buildingsCreated: 0,
    activitiesCreated: 0,
    contactsCreated: 0,
    contactsReused: 0,
    dealsCreated: 0,
    dealsUpdated: 0,
    errors: rowErrors.length,
    recordsUpdated,
    fieldsChanged,
    contractValuesSet,
  }
}

/** Everything a commit or an undo can change. */
function revalidateAfterImport() {
  for (const path of [
    '/dashboard',
    '/accounts',
    '/buildings',
    '/contacts',
    '/opportunities',
    '/reports',
    '/admin/import',
  ]) {
    revalidatePath(path)
  }
}

/**
 * Undo. Deletes only what this batch created — accounts that already existed
 * were reused rather than stamped, so they survive.
 */
export async function rollbackImport(
  batchId: string,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can undo an import.' }

  // A gap fill changed fields on records that already existed, so there is
  // nothing stamped to delete. Put the old values back first, before anything
  // else moves underneath it.
  const { data: replayed, error: replayError } = await supabase.rpc('rollback_field_changes', {
    p_batch_id: batchId,
  })
  if (replayError) return { ok: false, error: replayError.message }

  // Order matters: buildings reference accounts, and contact links cascade from
  // the building. Opportunities go before accounts too — and note that a deal
  // the Won/Loss import merely UPDATED was never stamped with a batch id, so it
  // survives, which is the point.
  //
  // Contract periods are deleted explicitly rather than left to cascade: a gap
  // fill opens a period on a building it did not create, so there is no
  // building deletion for it to cascade from. Only a period this batch opened
  // carries the stamp, and fill_building_contract_value() refuses to stamp one
  // that already existed.
  const steps: [string, string][] = [
    ['activities', 'activities'],
    ['opportunities', 'deals'],
    ['building_contract_periods', 'contract values'],
    ['buildings', 'buildings'],
    ['contacts', 'contacts'],
    ['accounts', 'accounts'],
  ]

  for (const [table, noun] of steps) {
    // Every step is checked. Only the last one used to be, so a failure part
    // way through reported success and left the undo half done.
    const { error } = await supabase
      .from(table as 'activities')
      .delete()
      .eq('import_batch_id', batchId)
    if (error) return { ok: false, error: `Could not remove the ${noun}: ${error.message}` }
  }

  // A field somebody edited by hand since the import is deliberately left as
  // they edited it. That has to outlive the button that reported it: the list
  // revalidates the moment the undo lands, the Undo button disappears with the
  // batch's status, and the message would go with it. So it is stored on the
  // batch — `mapping` is jsonb and a gap fill has no column mapping to keep.
  const summary = (replayed ?? {}) as { reverted?: number; skipped?: number }
  const skipped = Number(summary.skipped ?? 0)
  const note =
    skipped > 0
      ? `${skipped} ${skipped === 1 ? 'field was' : 'fields were'} changed by hand since this import, so ${skipped === 1 ? 'it was' : 'they were'} left as ${skipped === 1 ? 'it is' : 'they are'}.`
      : undefined

  await supabase
    .from('import_batches')
    .update({
      status: 'rolled_back',
      mapping: { undo: { reverted: Number(summary.reverted ?? 0), skipped, note: note ?? null } },
    })
    .eq('id', batchId)

  revalidateAfterImport()
  revalidatePath('/reports/pipeline')

  return { ok: true, note }
}
