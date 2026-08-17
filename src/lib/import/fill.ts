import type { Json } from '@/lib/database.types'
import { HEALTH_LABELS } from '@/lib/format'
import { ID_HEADERS, type GapScope } from '@/lib/gaps'
import type { SkippedRowLike } from '@/lib/import/parse-rows'

export type SkippedRow = SkippedRowLike

/**
 * The gap-filler: a sheet this app wrote, edited in Excel, read back.
 *
 * Two rules run through everything here.
 *
 * A blank cell leaves the field alone. There is no way to empty a field through
 * an import, so a half-filled re-upload can never wipe anything. The corollary
 * is that an unparseable cell must be an *error* and never a blank — otherwise
 * "$2,50O" with a letter O would silently do nothing and the preview would say
 * nothing either.
 *
 * Nothing is matched by name. Every row carries the record's own id in the
 * first column, and a row whose id matches nothing is an error rather than a
 * new record — this importer never inserts.
 */

// ---------------------------------------------------------------------------
// Field specs — the exact headers the export writes
// ---------------------------------------------------------------------------

type Kind =
  | 'text'
  | 'number'
  | 'integer'
  | 'money'
  | 'date'
  | 'yesno'
  | 'health'
  | 'segment'
  | 'owner'
  | 'account'
  | 'contact'
  /** The building contract value, which is not a column at all. */
  | 'contract'

export type FillField = {
  header: string
  /** null for a context column: shown in the sheet, never written back. */
  column: string | null
  kind: Kind
}

const FIELDS: Record<GapScope, FillField[]> = {
  buildings: [
    { header: 'Building', column: null, kind: 'text' },
    { header: 'Account', column: null, kind: 'text' },
    { header: 'Monthly value', column: null, kind: 'contract' },
    { header: 'Segment', column: 'property_type_id', kind: 'segment' },
    { header: 'Square footage', column: 'square_footage', kind: 'integer' },
    { header: 'Contract start', column: 'contract_start_date', kind: 'date' },
    { header: 'Contract end', column: 'contract_end_date', kind: 'date' },
    { header: 'Health', column: 'health_score', kind: 'health' },
    { header: 'Owner', column: 'owner_id', kind: 'owner' },
    { header: 'Day porter', column: 'day_porter', kind: 'yesno' },
    { header: 'Day porter hours per day', column: 'day_porter_hours_per_day', kind: 'number' },
    { header: 'Day porter days per week', column: 'day_porter_days_per_week', kind: 'number' },
    { header: 'Night hours per night', column: 'night_hours_per_night', kind: 'number' },
    { header: 'Night days per week', column: 'night_days_per_week', kind: 'number' },
    { header: 'Weekend service', column: 'weekend_service', kind: 'yesno' },
    { header: 'Weekend hours per week', column: 'weekend_hours_per_week', kind: 'number' },
  ],
  deals: [
    { header: 'Deal', column: null, kind: 'text' },
    // Stage is context on purpose. stamp_opportunity_close_date() is a BEFORE
    // trigger on UPDATE OF stage_id that stamps close dates and raises on a
    // reopened converted deal — stages move on the board, not in a spreadsheet.
    { header: 'Stage', column: null, kind: 'text' },
    { header: 'Monthly value', column: 'monthly_value', kind: 'money' },
    { header: 'Expected close', column: 'expected_close_date', kind: 'date' },
    { header: 'Account', column: 'account_id', kind: 'account' },
    { header: 'Owner', column: 'owner_id', kind: 'owner' },
    { header: 'Segment', column: 'property_type_id', kind: 'segment' },
    { header: 'Opened on', column: 'opened_on', kind: 'date' },
  ],
  contacts: [
    { header: 'Name', column: null, kind: 'text' },
    { header: 'Account', column: 'account_id', kind: 'account' },
    { header: 'Title', column: 'title', kind: 'text' },
    { header: 'Email', column: 'email', kind: 'text' },
  ],
  accounts: [
    { header: 'Account', column: null, kind: 'text' },
    { header: 'Primary contact', column: 'primary_contact_id', kind: 'contact' },
    { header: 'Owner', column: 'owner_id', kind: 'owner' },
    { header: 'Secondary owner', column: 'secondary_owner_id', kind: 'owner' },
  ],
}

export const SCOPE_TABLE: Record<GapScope, string> = {
  buildings: 'buildings',
  deals: 'opportunities',
  contacts: 'contacts',
  accounts: 'accounts',
}

/** Which sheet this is, read from the first column rather than from a dropdown. */
export function scopeFromHeaders(headers: string[]): GapScope | null {
  const first = (headers[0] ?? '').trim().toLowerCase()
  for (const [scope, header] of Object.entries(ID_HEADERS)) {
    if (first === header.toLowerCase()) return scope as GapScope
  }
  return null
}

// ---------------------------------------------------------------------------
// Parsing — three states, never two
// ---------------------------------------------------------------------------
// The existing parsers in parse-rows.ts return null both for "empty" and for
// "could not read that", which is right for a best-effort import of a messy
// spreadsheet and wrong here: null means "leave the field alone", so a typo
// would vanish without a word.

type Parsed =
  | { state: 'blank' }
  | { state: 'value'; value: Json; display: string }
  | { state: 'error'; message: string }

const DASHES = /[‐-―−]/g

/** Case, spacing and dash-style differences are not real differences. */
function normalise(text: string): string {
  return text
    .normalize('NFC')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function parseNumber(raw: string, whole: boolean): Parsed {
  const cleaned = raw.replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  if (cleaned === '' || !Number.isFinite(n)) {
    return { state: 'error', message: `"${raw}" is not a number` }
  }
  if (n < 0) return { state: 'error', message: `"${raw}" is negative` }
  if (whole && !Number.isInteger(n)) {
    return { state: 'error', message: `"${raw}" has to be a whole number` }
  }
  return { state: 'value', value: n, display: String(n) }
}

/**
 * ISO first, then the US order Excel writes when it reformats a date column on
 * save — which it will, so this has to read 8/17/2026 as well as 2026-08-17.
 */
function parseDateCell(raw: string): Parsed {
  const text = raw.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (iso) {
    const value = `${iso[1]}-${iso[2]}-${iso[3]}`
    return Number.isNaN(new Date(`${value}T12:00:00`).getTime())
      ? { state: 'error', message: `"${raw}" is not a date` }
      : { state: 'value', value, display: value }
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text)
  if (us) {
    const year = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3])
    const value = `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
    return Number.isNaN(new Date(`${value}T12:00:00`).getTime())
      ? { state: 'error', message: `"${raw}" is not a date` }
      : { state: 'value', value, display: value }
  }

  return { state: 'error', message: `"${raw}" is not a date — write it as 2026-08-17` }
}

function parseYesNoCell(raw: string): Parsed {
  const t = normalise(raw)
  if (['yes', 'y', 'true', '1'].includes(t)) return { state: 'value', value: true, display: 'Yes' }
  if (['no', 'n', 'false', '0'].includes(t)) return { state: 'value', value: false, display: 'No' }
  return { state: 'error', message: `"${raw}" has to be Yes or No` }
}

function parseHealthCell(raw: string): Parsed {
  const t = normalise(raw)
  for (const [key, label] of Object.entries(HEALTH_LABELS)) {
    if (t === normalise(label) || t === normalise(key)) {
      return { state: 'value', value: key, display: label }
    }
  }
  return {
    state: 'error',
    message: `"${raw}" is not a health score — use ${Object.values(HEALTH_LABELS).join(', ')}`,
  }
}

/** Exact match on a name, with a list of what would have worked. */
function matchByName(
  raw: string,
  options: { id: string; name: string }[],
  noun: string,
): Parsed {
  const t = normalise(raw)
  const hits = options.filter((o) => normalise(o.name) === t)
  if (hits.length === 1) return { state: 'value', value: hits[0].id, display: hits[0].name }
  if (hits.length > 1) {
    return { state: 'error', message: `More than one ${noun} is called "${raw}"` }
  }
  const known = options.map((o) => o.name).join(', ')
  return { state: 'error', message: `No ${noun} called "${raw}". Known: ${known}` }
}

/**
 * A contact by email or by id.
 *
 * 21 contacts have no email and contacts.email carries no unique constraint, so
 * neither alone round-trips. The export writes an email where there is one and
 * the contact's id where there is not.
 */
function matchContact(
  raw: string,
  contacts: { id: string; name: string; email: string }[],
): Parsed {
  const t = normalise(raw)
  const byId = contacts.find((c) => c.id.toLowerCase() === t)
  if (byId) return { state: 'value', value: byId.id, display: byId.name || byId.email || byId.id }

  const byEmail = contacts.filter((c) => c.email && normalise(c.email) === t)
  if (byEmail.length === 1) {
    return { state: 'value', value: byEmail[0].id, display: byEmail[0].name || byEmail[0].email }
  }
  if (byEmail.length > 1) {
    return {
      state: 'error',
      message: `More than one contact uses "${raw}". Paste their Contact ID from the contacts sheet instead.`,
    }
  }
  return {
    state: 'error',
    message: `No contact with the email or ID "${raw}". Add their email on the contacts sheet first, or paste their Contact ID.`,
  }
}

// ---------------------------------------------------------------------------
// The proposal
// ---------------------------------------------------------------------------

export type FieldChange = {
  column: string
  label: string
  from: string
  to: string
  value: Json
  /** True when the field already held something. Those are the ones to read. */
  overwrite: boolean
  /** True when this app worked it out rather than the sheet saying so. */
  derived?: boolean
}

export type ContractFill = {
  monthlyValue: number
  effectiveDate: string
  /** False when the date fell back to today, which reads as new business. */
  backdated: boolean
}

export type ProposedFill = {
  rowNumber: number
  recordId: string
  label: string
  changes: FieldChange[]
  contract: ContractFill | null
  warnings: string[]
  error: string | null
}

export type FillTargets = {
  /** id → header → the cell exactly as the download wrote it. */
  current: Map<string, Record<string, string>>
  /** id → the name to show in the preview. */
  labels: Map<string, string>
  /** Buildings with no contract period at all, so a first value may be opened. */
  canFillValue: Set<string>
  /** Building id → contract start date already on the record. */
  contractStart: Map<string, string | null>
  segments: { id: string; name: string }[]
  profiles: { id: string; name: string }[]
  accounts: { id: string; name: string }[]
  contacts: { id: string; name: string; email: string }[]
}

export type FillProposal = {
  scope: GapScope
  rows: ProposedFill[]
  skipped: SkippedRow[]
  /** Headers in the file this importer does not write. Reported, never guessed at. */
  ignoredColumns: string[]
  /** Headers the importer expected and the file does not have. */
  missingColumns: string[]
}

export function buildFillProposal(
  scope: GapScope,
  headers: string[],
  rows: (string | null)[][],
  rowNumbers: number[],
  targets: FillTargets,
  today: string,
): FillProposal {
  const specs = FIELDS[scope]
  const idHeader = ID_HEADERS[scope]

  const indexOf = new Map<string, number>()
  headers.forEach((h, i) => {
    const key = normalise(h)
    if (key && !indexOf.has(key)) indexOf.set(key, i)
  })

  const known = new Set([normalise(idHeader), ...specs.map((s) => normalise(s.header))])
  const ignoredColumns = headers.filter((h) => h.trim() !== '' && !known.has(normalise(h)))
  const missingColumns = specs
    .filter((s) => s.column !== null || s.kind === 'contract')
    .filter((s) => !indexOf.has(normalise(s.header)))
    .map((s) => s.header)

  const idIndex = indexOf.get(normalise(idHeader)) ?? 0
  const at = (row: (string | null)[], header: string): string | null => {
    const i = indexOf.get(normalise(header))
    if (i === undefined) return null
    const cell = row[i]
    return cell === null || cell === undefined || cell.trim() === '' ? null : cell.trim()
  }

  const proposals: ProposedFill[] = []
  const skipped: SkippedRow[] = []
  const seen = new Set<string>()

  rows.forEach((row, i) => {
    const rowNumber = rowNumbers[i] ?? i + 1
    const rawId = (row[idIndex] ?? '').trim()

    if (row.every((c) => c === null || c.trim() === '')) return

    if (!rawId) {
      skipped.push({ rowNumber, reason: `No ${idHeader} — this importer never creates records`, raw: null })
      return
    }

    const recordId = rawId.toLowerCase()
    const current = targets.current.get(recordId)
    const label = targets.labels.get(recordId) ?? rawId

    if (!current) {
      proposals.push({
        rowNumber,
        recordId,
        label: rawId,
        changes: [],
        contract: null,
        warnings: [],
        error: `No ${scope === 'deals' ? 'open deal' : scope.replace(/s$/, '')} has the ID ${rawId}. Download a fresh sheet — this one may be out of date.`,
      })
      return
    }

    if (seen.has(recordId)) {
      proposals.push({
        rowNumber,
        recordId,
        label,
        changes: [],
        contract: null,
        warnings: [],
        error: `${label} appears more than once in this file. Remove the duplicate row.`,
      })
      return
    }
    seen.add(recordId)

    const changes: FieldChange[] = []
    const warnings: string[] = []
    let contract: ContractFill | null = null
    let error: string | null = null

    for (const spec of specs) {
      const raw = at(row, spec.header)
      const was = current[spec.header] ?? ''

      // Context columns are here so the sheet reads like a spreadsheet. An
      // edit to one is ignored rather than silently written somewhere.
      if (spec.column === null && spec.kind !== 'contract') {
        if (raw !== null && normalise(raw) !== normalise(was)) {
          warnings.push(`${spec.header} is only here for reference — "${raw}" was not saved`)
        }
        continue
      }

      if (raw === null) continue // blank leaves the field alone
      if (normalise(raw) === normalise(was)) continue // unchanged

      const parsed = parseCell(spec, raw, targets)

      if (parsed.state === 'error') {
        error = error ?? `${spec.header}: ${parsed.message}`
        continue
      }
      if (parsed.state === 'blank') continue

      if (spec.kind === 'contract') {
        if (!targets.canFillValue.has(recordId)) {
          error =
            error ??
            `${label} already has a contract value. Change it on the building page, where you can say whether it is a price change or a correction.`
          continue
        }
        // Prefer the start date this same row is setting, then the one already
        // on the record, then today. Backdating is what makes the MRR history
        // real rather than a step in the month of the import.
        const startCell = at(row, 'Contract start')
        const startParsed = startCell ? parseDateCell(startCell) : null
        const start =
          startParsed?.state === 'value'
            ? String(startParsed.value)
            : (targets.contractStart.get(recordId) ?? null)

        contract = {
          monthlyValue: Number(parsed.value),
          effectiveDate: start ?? today,
          backdated: Boolean(start),
        }
        continue
      }

      changes.push({
        column: spec.column as string,
        label: spec.header,
        from: was,
        to: parsed.display,
        value: parsed.value,
        overwrite: was !== '',
      })
    }

    // Hours only count towards v_building_hours when their switch is on, so
    // filling "8 hours a day" on a building whose day_porter flag is false
    // would read as 8 and compute as 0. Turn the switch on, and record it as
    // its own change so undo puts it back.
    if (scope === 'buildings') {
      for (const [hoursHeader, flagColumn, flagHeader] of [
        ['Day porter hours per day', 'day_porter', 'Day porter'],
        ['Weekend hours per week', 'weekend_service', 'Weekend service'],
      ] as const) {
        const setting = changes.find((c) => c.label === hoursHeader)
        const alreadySetting = changes.some((c) => c.column === flagColumn)
        const flagWas = current[flagHeader] ?? ''
        if (setting && Number(setting.value) > 0 && !alreadySetting && flagWas !== 'Yes') {
          changes.push({
            column: flagColumn,
            label: flagHeader,
            from: flagWas || 'No',
            to: 'Yes',
            value: true,
            overwrite: false,
            derived: true,
          })
        }
      }
    }

    // Overwrites first: filling a blank is always safe, changing something that
    // was already there is the line to read.
    changes.sort((a, b) => Number(b.overwrite) - Number(a.overwrite))

    proposals.push({ rowNumber, recordId, label, changes, contract, warnings, error })
  })

  return { scope, rows: proposals, skipped, ignoredColumns, missingColumns }
}

function parseCell(spec: FillField, raw: string, targets: FillTargets): Parsed {
  switch (spec.kind) {
    case 'text':
      return { state: 'value', value: raw, display: raw }
    case 'integer':
      return parseNumber(raw, true)
    case 'number':
    case 'money':
    case 'contract':
      return parseNumber(raw, false)
    case 'date':
      return parseDateCell(raw)
    case 'yesno':
      return parseYesNoCell(raw)
    case 'health':
      return parseHealthCell(raw)
    case 'segment':
      return matchByName(raw, targets.segments, 'segment')
    case 'owner':
      return matchByName(raw, targets.profiles, 'person')
    case 'account':
      return matchByName(raw, targets.accounts, 'account')
    case 'contact':
      return matchContact(raw, targets.contacts)
    default: {
      const never: never = spec.kind
      throw new Error(`Unhandled field kind: ${String(never)}`)
    }
  }
}
