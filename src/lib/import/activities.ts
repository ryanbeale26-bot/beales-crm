import { parseDate, splitClientName, splitPersonName, type SkippedRowLike } from './parse-rows'

export type SkippedRow = SkippedRowLike

/**
 * The Activity Log's type column is free text with about 95 distinct values.
 * They collapse onto the controlled list by matching the most specific rule
 * first — "Email - Thread (Quality Issue)" is a complaint, not an email.
 *
 * Anything that matches nothing becomes a Note and is flagged, rather than
 * being dropped or guessed at.
 */
const TYPE_RULES: { pattern: RegExp; type: string }[] = [
  { pattern: /complaint|quality issue|escalation|remediation|intervention/i, type: 'Complaint' },
  { pattern: /proposal|quote/i, type: 'Proposal sent' },
  { pattern: /walkthrough|walk-through|site walk/i, type: 'Walkthrough' },
  { pattern: /inspection|deep clean|site visit|site report/i, type: 'Site visit' },
  { pattern: /meeting|zoom|kickoff|calendar - invite/i, type: 'Meeting' },
  { pattern: /call|voicemail/i, type: 'Call' },
  { pattern: /email|text|imessage|thread/i, type: 'Email' },
]

export function mapActivityType(raw: string | null): { type: string; matched: boolean } {
  if (!raw) return { type: 'Note', matched: false }
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(raw)) return { type: rule.type, matched: true }
  }
  return { type: 'Note', matched: false }
}

/** The Source column names several tools; map onto the activity_source enum. */
export function mapSource(raw: string | null): string {
  if (!raw) return 'manual'
  const text = raw.toLowerCase()
  if (text.includes('granola')) return 'granola'
  if (text.includes('gmail')) return 'gmail'
  if (text.includes('imessage')) return 'imessage'
  if (text.includes('outlook calendar')) return 'outlook_calendar'
  if (text.includes('google calendar')) return 'google_calendar'
  if (text.includes('outlook')) return 'outlook'
  if (text.includes('cowork')) return 'cowork'
  if (text.includes('phone') || text.includes('text')) return 'phone'
  if (text.includes('logger') || text.includes('crm')) return 'system'
  return 'manual'
}

export type ProposedActivity = {
  rowNumber: number
  typeName: string
  typeMatched: boolean
  rawType: string | null
  subject: string
  body: string | null
  occurredAt: string | null
  source: string
  companyName: string | null
  contactName: string | null
  ownerName: string | null
  /** Resolved against real records so the preview shows where it will land. */
  accountId: string | null
  accountName: string | null
  buildingId: string | null
  buildingName: string | null
  warnings: string[]
}

export type MatchTargets = {
  accounts: { id: string; name: string }[]
  buildings: { id: string; name: string; account_id: string }[]
}

export function buildActivitiesProposal(
  rows: (string | null)[][],
  rowNumbers: number[],
  mapping: Record<string, number>,
  targets: MatchTargets = { accounts: [], buildings: [] },
): { activities: ProposedActivity[]; skipped: SkippedRow[] } {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const accountByName = new Map(targets.accounts.map((a) => [norm(a.name), a]))
  const buildingByName = new Map(targets.buildings.map((b) => [norm(b.name), b]))

  /**
   * The Company column repeats the Active Clients format —
   * "HTA REIT — 851 Middle St Fall River" — so match the whole string first,
   * then the halves either side of the dash. A building match also settles the
   * account, since a building belongs to one.
   */
  function match(company: string | null) {
    if (!company) return { account: null, building: null }

    const whole = norm(company)
    const buildingWhole = buildingByName.get(whole)
    if (buildingWhole) {
      return {
        account: targets.accounts.find((a) => a.id === buildingWhole.account_id) ?? null,
        building: buildingWhole,
      }
    }
    const accountWhole = accountByName.get(whole)
    if (accountWhole) return { account: accountWhole, building: null }

    const { accountName, buildingName } = splitClientName(company)
    const building = buildingByName.get(norm(buildingName)) ?? null
    const account =
      (building
        ? (targets.accounts.find((a) => a.id === building.account_id) ?? null)
        : null) ?? accountByName.get(norm(accountName)) ?? null

    return { account, building }
  }

  const at = (row: (string | null)[], key: string): string | null => {
    const index = mapping[key]
    if (index === undefined || index < 0) return null
    return row[index] ?? null
  }

  const activities: ProposedActivity[] = []
  const skipped: SkippedRow[] = []

  rows.forEach((row, i) => {
    const rowNumber = rowNumbers[i]
    const summary = at(row, 'summary')
    const rawType = at(row, 'activityType')
    const dateText = at(row, 'date')

    // Subject is the one required field, so a row without one cannot become
    // an activity. Fall back to the type before giving up.
    const subject = summary?.trim() || rawType?.trim() || null
    if (!subject || subject.toLowerCase() === 'summary') {
      skipped.push({ rowNumber, reason: 'Nothing to use as a subject.', raw: summary })
      return
    }

    const warnings: string[] = []
    const { type, matched: typeMatched } = mapActivityType(rawType)
    if (!typeMatched && rawType) warnings.push(`Type "${rawType}" did not match — filed as a Note.`)

    const occurredAt = parseDate(dateText)
    if (!occurredAt) warnings.push('No date — will be logged as today.')

    const outcome = at(row, 'outcome')
    const nextStep = at(row, 'nextStep')
    const body = [outcome, nextStep && `Next step: ${nextStep}`].filter(Boolean).join('\n\n') || null

    const company = at(row, 'company')
    const placed = match(company)
    if (company && !placed.account && !placed.building) {
      warnings.push(`No account matches "${company}" — it will not appear on a timeline.`)
    }

    activities.push({
      rowNumber,
      typeName: type,
      typeMatched,
      rawType,
      subject: subject.slice(0, 500),
      body,
      occurredAt,
      source: mapSource(at(row, 'source')),
      companyName: company,
      contactName: at(row, 'contact'),
      ownerName: at(row, 'owner'),
      accountId: placed.account?.id ?? null,
      accountName: placed.account?.name ?? null,
      buildingId: placed.building?.id ?? null,
      buildingName: placed.building?.name ?? null,
      warnings,
    })
  })

  return { activities, skipped }
}

export { splitPersonName }
