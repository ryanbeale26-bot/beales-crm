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

  if (importerKey === 'activities') {
    // Matching happens here, not at commit, so the preview shows exactly which
    // account and building each row will land on.
    const [{ data: accounts }, { data: buildings }] = await Promise.all([
      supabase.from('accounts').select('id, name').is('deleted_at', null),
      supabase.from('buildings').select('id, name, account_id').is('deleted_at', null),
    ])
    const { activities, skipped } = buildActivitiesProposal(sheet.rows, sheet.rowNumbers, mapping, {
      accounts: accounts ?? [],
      buildings: buildings ?? [],
    })
    return { ok: true, kind: 'activities', activities, skipped }
  }

  if (importerKey === 'pipeline') {
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

  if (importerKey === 'won-lost') {
    const { data: opportunities } = await supabase
      .from('opportunities')
      .select('id, name')
      .is('deleted_at', null)
    const { outcomes, skipped } = buildWonLostProposal(sheet.rows, sheet.rowNumbers, mapping, {
      opportunities: opportunities ?? [],
    })
    return { ok: true, kind: 'won-lost', outcomes, skipped }
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
      activitiesCreated: number
      contactsCreated: number
      contactsReused: number
      dealsCreated: number
      dealsUpdated: number
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
 * Undo. Deletes only what this batch created — accounts that already existed
 * were reused rather than stamped, so they survive.
 */
export async function rollbackImport(batchId: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can undo an import.' }

  // Order matters: buildings reference accounts, and contract periods and
  // contact links cascade from the building. Opportunities go before accounts
  // too — and note that a deal the Won/Loss import merely UPDATED was never
  // stamped with a batch id, so it survives, which is the point.
  await supabase.from('activities').delete().eq('import_batch_id', batchId)
  await supabase.from('opportunities').delete().eq('import_batch_id', batchId)
  await supabase.from('buildings').delete().eq('import_batch_id', batchId)
  await supabase.from('contacts').delete().eq('import_batch_id', batchId)
  const { error } = await supabase.from('accounts').delete().eq('import_batch_id', batchId)
  if (error) return { ok: false, error: error.message }

  await supabase.from('import_batches').update({ status: 'rolled_back' }).eq('id', batchId)

  revalidatePath('/accounts')
  revalidatePath('/buildings')
  revalidatePath('/contacts')
  revalidatePath('/opportunities')
  revalidatePath('/reports/pipeline')
  revalidatePath('/admin/import')
  return { ok: true }
}
