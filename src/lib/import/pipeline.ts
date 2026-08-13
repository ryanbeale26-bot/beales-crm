import {
  parseDate,
  parseMoney,
  parseOwners,
  splitClientName,
  type SkippedRowLike,
} from './parse-rows'

export type SkippedRow = SkippedRowLike

/**
 * The Source column has fourteen spellings of about seven real sources. These
 * are the merges Ryan confirmed on 2026-08-13:
 *
 *   "Direct" and "Cold Outreach"          -> Direct Outreach
 *   every CBRE / Tufts-CBRE variant       -> CBRE Referral
 *   both inbound RFP rows                 -> Inbound RFP
 *
 * Most specific first, because "Existing Tufts/CBRE Relationship" has to reach
 * the CBRE rule before the plain "existing" one, and "Referral / Existing PM
 * relationship" has to reach it before the plain "referral" one.
 *
 * Anything unmatched leaves the source NULL rather than becoming "Other" — an
 * honest unknown beats a bucket nobody ever empties. The name is still shown in
 * the preview so nothing disappears quietly.
 */
const SOURCE_RULES: { pattern: RegExp; source: string }[] = [
  { pattern: /cbre|tufts/i, source: 'CBRE Referral' },
  { pattern: /existing pm relationship/i, source: 'CBRE Referral' },
  { pattern: /inbound rfp/i, source: 'Inbound RFP' },
  { pattern: /linkedin/i, source: 'LinkedIn' },
  { pattern: /bbm|partnership/i, source: 'BBM Partnership' },
  { pattern: /existing client expansion|client expansion/i, source: 'Existing Client Expansion' },
  { pattern: /existing/i, source: 'Existing Relationship' },
  { pattern: /direct|cold outreach/i, source: 'Direct Outreach' },
  { pattern: /referral/i, source: 'Referral' },
]

export function mapLeadSource(raw: string | null): { source: string | null; matched: boolean } {
  if (!raw?.trim()) return { source: null, matched: true }
  for (const rule of SOURCE_RULES) {
    if (rule.pattern.test(raw)) return { source: rule.source, matched: true }
  }
  return { source: null, matched: false }
}

export type ProposedDeal = {
  rowNumber: number
  name: string
  rawCompany: string
  stageName: string | null
  rawStage: string | null
  monthlyValue: number | null
  /** Kept for the four rows that carry an annual figure and no monthly one. */
  annualOnlyValue: number | null
  isProjectWork: boolean
  segmentName: string | null
  sourceName: string | null
  rawSource: string | null
  ownerName: string | null
  expectedCloseDate: string | null
  notes: string | null
  /** Resolved during preview, so what is shown is what gets written. */
  accountId: string | null
  accountName: string | null
  buildingId: string | null
  buildingName: string | null
  ownerId: string | null
  secondaryOwnerId: string | null
  warnings: string[]
  /** A row that cannot become a deal at all. Reported, never guessed at. */
  error: string | null
}

export type PipelineTargets = {
  accounts: { id: string; name: string }[]
  buildings: { id: string; name: string; account_id: string }[]
  stages: { id: string; name: string; is_won: boolean }[]
  profiles: { id: string; full_name: string }[]
}

export function buildPipelineProposal(
  rows: (string | null)[][],
  rowNumbers: number[],
  mapping: Record<string, number>,
  targets: PipelineTargets = { accounts: [], buildings: [], stages: [], profiles: [] },
): { deals: ProposedDeal[]; skipped: SkippedRow[] } {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const accountByName = new Map(targets.accounts.map((a) => [norm(a.name), a]))
  const buildingByName = new Map(targets.buildings.map((b) => [norm(b.name), b]))
  const stageByName = new Map(targets.stages.map((s) => [norm(s.name), s]))

  const at = (row: (string | null)[], key: string): string | null => {
    const index = mapping[key]
    if (index === undefined || index < 0) return null
    return row[index] ?? null
  }

  const deals: ProposedDeal[] = []
  const skipped: SkippedRow[] = []

  rows.forEach((row, i) => {
    const rowNumber = rowNumbers[i]
    const company = at(row, 'company')?.trim() ?? null

    if (!company) {
      // Truly blank rows are noise. A totals or repeated-header row is worth
      // reporting, because it means the sheet has a shape we did not expect.
      if (row.some((cell) => cell?.trim())) {
        skipped.push({ rowNumber, reason: 'No company name.', raw: null })
      }
      return
    }
    if (/^(company|total)/i.test(company)) {
      skipped.push({ rowNumber, reason: 'Header or totals row.', raw: company })
      return
    }

    const warnings: string[] = []
    let error: string | null = null

    // The em-dash split gives the account; the whole string stays the deal name,
    // because "Boston Scientific — Quincy" is what Ryan calls the deal.
    const { accountName, buildingName, warning } = splitClientName(company)
    if (warning) warnings.push(warning)

    const whole = norm(company)
    const building = buildingByName.get(whole) ?? buildingByName.get(norm(buildingName)) ?? null
    const account =
      (building ? (targets.accounts.find((a) => a.id === building.account_id) ?? null) : null) ??
      accountByName.get(whole) ??
      accountByName.get(norm(accountName)) ??
      null

    // stage_id is NOT NULL and there is no sensible default — putting an
    // unrecognised deal in "Targeting" would quietly change the pipeline. So an
    // unmatched stage is a row error.
    const rawStage = at(row, 'stage')
    const stage = rawStage ? (stageByName.get(norm(rawStage)) ?? null) : null
    if (!rawStage) error = 'No stage on this row.'
    else if (!stage) error = `Stage "${rawStage}" is not one of the stages on the board.`

    const monthly = parseMoney(at(row, 'monthlyValue'))
    const annual = parseMoney(at(row, 'annualValue'))

    // Four rows carry an annual figure and no monthly one. Ryan confirmed these
    // are one-off project work, not annual contracts, so the annual figure is
    // NOT divided by twelve — it is kept in the notes and flagged instead.
    const annualOnly = monthly === null && annual !== null ? annual : null
    if (annualOnly !== null) {
      warnings.push(
        `Annual figure only ($${annualOnly.toLocaleString('en-US')}) — treated as one-off project work, so it carries no monthly value.`,
      )
    }

    const rawSource = at(row, 'source')
    const { source, matched: sourceMatched } = mapLeadSource(rawSource)
    if (!sourceMatched && rawSource) {
      warnings.push(`Source "${rawSource}" did not match — left blank rather than guessed.`)
    }

    const ownerText = at(row, 'owner')
    const owners = parseOwners(ownerText, targets.profiles)
    if (owners.warning) warnings.push(owners.warning)

    if (building && stage?.is_won) {
      warnings.push(`Already a building — linked to "${building.name}" rather than converted again.`)
    }

    // The Notes cell is a whole activity log crammed into one field. It is kept
    // verbatim: tab 4 is the proper source for activities, and parsing it here
    // would duplicate what the activity importer already did.
    const nextAction = at(row, 'nextAction')
    const notes = [
      at(row, 'notes'),
      nextAction && `Next action: ${nextAction}`,
      annualOnly !== null && `Annual figure from the spreadsheet: $${annualOnly.toLocaleString('en-US')} (one-off project work).`,
    ]
      .filter(Boolean)
      .join('\n\n')

    deals.push({
      rowNumber,
      name: company,
      rawCompany: company,
      stageName: stage?.name ?? null,
      rawStage,
      monthlyValue: monthly,
      annualOnlyValue: annualOnly,
      isProjectWork: annualOnly !== null,
      segmentName: at(row, 'segment'),
      sourceName: source,
      rawSource,
      ownerName: ownerText,
      // The sheet has no "opened" date, so the only date worth keeping is the
      // follow-up, which is what Ryan uses as the expected close.
      expectedCloseDate: parseDate(at(row, 'followUpDate')),
      notes: notes || null,
      accountId: account?.id ?? null,
      accountName: account?.name ?? null,
      buildingId: stage?.is_won ? (building?.id ?? null) : null,
      buildingName: building?.name ?? null,
      ownerId: owners.ownerId,
      secondaryOwnerId: owners.secondaryOwnerId,
      warnings,
      error,
    })
  })

  return { deals, skipped }
}
