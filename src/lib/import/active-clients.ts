import {
  isSkippableRow,
  parseAddress,
  parseDate,
  parseHealth,
  parseMoney,
  parseOwners,
  parseServiceScope,
  splitClientName,
  splitPersonName,
  type HealthScore,
} from './parse-rows'

export type ProposedBuilding = {
  rowNumber: number
  /** Editable in the preview — this is what the merge step changes. */
  accountName: string
  buildingName: string
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  squareFootage: number | null
  serviceTypes: string[]
  monthlyValue: number | null
  contractStart: string | null
  contractEnd: string | null
  healthScore: HealthScore | null
  ownerId: string | null
  secondaryOwnerId: string | null
  scopeNotes: string | null
  notes: string | null
  inspectqaSiteId: string | null
  contact: { firstName: string; lastName: string; email: string | null; phone: string | null } | null
  warnings: string[]
}

export type SkippedRow = { rowNumber: number; reason: string; raw: string | null }

export type ActiveClientsProposal = {
  buildings: ProposedBuilding[]
  skipped: SkippedRow[]
}

export function buildActiveClientsProposal(
  rows: (string | null)[][],
  rowNumbers: number[],
  mapping: Record<string, number>,
  profiles: { id: string; full_name: string }[],
): ActiveClientsProposal {
  const at = (row: (string | null)[], key: string): string | null => {
    const index = mapping[key]
    if (index === undefined || index < 0) return null
    return row[index] ?? null
  }

  const buildings: ProposedBuilding[] = []
  const skipped: SkippedRow[] = []

  rows.forEach((row, i) => {
    const rowNumber = rowNumbers[i]
    const clientName = at(row, 'clientName')

    const skip = isSkippableRow(clientName)
    if (skip) {
      // Truly blank rows are noise; a totals row is worth reporting.
      if (clientName) skipped.push({ rowNumber, reason: skip, raw: clientName })
      return
    }

    const warnings: string[] = []
    const { accountName, buildingName, warning } = splitClientName(clientName!)
    if (warning) warnings.push(warning)

    const scopeText = at(row, 'serviceScope')
    const scope = parseServiceScope(scopeText)

    // Several rows carry the address in the client name instead of the scope.
    let { addressLine1, city, state, postalCode } = scope
    if (!addressLine1) {
      const fallback = parseAddress(buildingName)
      if (fallback.addressLine1) {
        addressLine1 = fallback.addressLine1
        city = fallback.city
        state = fallback.state
        postalCode = fallback.postalCode
      }
    }
    if (!addressLine1) {
      warnings.push('No address found — add it by hand later.')
      warnings.push(...scope.warnings)
    }

    const owners = parseOwners(at(row, 'owner'), profiles)
    if (owners.warning) warnings.push(owners.warning)

    const monthlyValue = parseMoney(at(row, 'monthlyValue'))
    if (monthlyValue === null) warnings.push('No monthly value, so this building adds no revenue.')

    const person = splitPersonName(at(row, 'primaryContact'))
    const email = at(row, 'contactEmail')
    const phone = at(row, 'contactPhone')

    const openIssues = at(row, 'openIssues')
    const baseNotes = at(row, 'notes')
    const notes = [baseNotes, openIssues && `Open issues: ${openIssues}`]
      .filter(Boolean)
      .join('\n\n') || null

    buildings.push({
      rowNumber,
      accountName,
      buildingName,
      addressLine1,
      city,
      state,
      postalCode,
      squareFootage: scope.squareFootage,
      serviceTypes: scope.serviceTypes,
      monthlyValue,
      contractStart: parseDate(at(row, 'contractStart')),
      contractEnd: parseDate(at(row, 'renewalDate')),
      healthScore: parseHealth(at(row, 'healthScore')),
      ownerId: owners.ownerId,
      secondaryOwnerId: owners.secondaryOwnerId,
      // The original text is always kept, so nothing the parser missed is lost.
      scopeNotes: scopeText,
      notes,
      inspectqaSiteId: at(row, 'inspectqaId'),
      contact: person ? { firstName: person.first, lastName: person.last, email, phone } : null,
      warnings,
    })
  })

  return { buildings, skipped }
}

export type ProposedContact = {
  rowNumber: number
  firstName: string
  lastName: string
  title: string | null
  companyName: string | null
  email: string | null
  phone: string | null
  relationship: string | null
  notes: string | null
  /** People who work for Beale's or a vendor, flagged rather than assumed. */
  looksInternal: boolean
  warnings: string[]
}

const INTERNAL_WORDS = /internal|employee|vendor|subcontractor|union|potential hire/i

export function buildContactsProposal(
  rows: (string | null)[][],
  rowNumbers: number[],
  mapping: Record<string, number>,
): { contacts: ProposedContact[]; skipped: SkippedRow[] } {
  const at = (row: (string | null)[], key: string): string | null => {
    const index = mapping[key]
    if (index === undefined || index < 0) return null
    return row[index] ?? null
  }

  const contacts: ProposedContact[] = []
  const skipped: SkippedRow[] = []

  rows.forEach((row, i) => {
    const rowNumber = rowNumbers[i]
    const rawName = at(row, 'fullName')

    if (!rawName || rawName.trim().toLowerCase() === 'full name') {
      if (rawName) skipped.push({ rowNumber, reason: 'Repeated header row.', raw: rawName })
      return
    }

    const person = splitPersonName(rawName)
    if (!person) {
      skipped.push({ rowNumber, reason: 'Could not read a name.', raw: rawName })
      return
    }

    const relationship = at(row, 'relationship')
    const warnings: string[] = []
    const email = at(row, 'email')
    if (!email) warnings.push('No email, so this person cannot be de-duplicated on re-import.')

    contacts.push({
      rowNumber,
      firstName: person.first,
      lastName: person.last,
      title: at(row, 'title'),
      companyName: at(row, 'company'),
      email,
      phone: at(row, 'phone'),
      relationship,
      notes: at(row, 'notes'),
      looksInternal: Boolean(relationship && INTERNAL_WORDS.test(relationship)),
      warnings,
    })
  })

  return { contacts, skipped }
}
