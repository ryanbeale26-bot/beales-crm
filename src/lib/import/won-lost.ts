import { parseDate, parseMoney, splitClientName, type SkippedRowLike } from './parse-rows'

export type SkippedRow = SkippedRowLike

/**
 * The Won/Loss tab records the same deals the Pipeline tab already holds — the
 * Pipeline tab has sixteen Closed Won rows and four Closed Lost ones, and this
 * tab has thirteen. So this importer's job is to ENRICH, not to create: it
 * matches a row to a deal that already exists and fills in the close date, why
 * it was lost and to whom.
 *
 * A row matching nothing does create a deal, because losing it would be worse —
 * but the preview says exactly which rows those are before anything is written.
 */

export type ProposedOutcome = {
  rowNumber: number
  company: string
  won: boolean
  closeDate: string | null
  /** Close date minus days-to-close. The only honest start date in the workbook. */
  openedOn: string | null
  annualValue: number | null
  monthlyValue: number | null
  lossReasonText: string | null
  competitorName: string | null
  winNotes: string | null
  /** Resolved during preview, so what is shown is what gets written. */
  opportunityId: string | null
  matchedName: string | null
  warnings: string[]
}

export type WonLostTargets = {
  opportunities: { id: string; name: string }[]
}

/**
 * "Janitronics won contract" is not a reason so much as a fact, and it is the
 * only loss recorded in the entire workbook. It maps onto the one loss reason
 * that has evidence behind it; the competitor column carries the rest.
 */
export function mapLossReason(raw: string | null): string | null {
  if (!raw?.trim()) return null
  const text = raw.toLowerCase()
  if (/won contract|lost to|competitor/.test(text)) return 'Lost to competitor'
  if (/price|cost|cheaper/.test(text)) return 'Price'
  if (/quality|service/.test(text)) return 'Service quality'
  if (/in-house|inhouse/.test(text)) return 'Brought in-house'
  if (/incumbent/.test(text)) return 'Went with incumbent'
  if (/no decision|stalled/.test(text)) return 'No decision'
  return null
}

export function buildWonLostProposal(
  rows: (string | null)[][],
  rowNumbers: number[],
  mapping: Record<string, number>,
  targets: WonLostTargets = { opportunities: [] },
): { outcomes: ProposedOutcome[]; skipped: SkippedRow[] } {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const byName = new Map(targets.opportunities.map((o) => [norm(o.name), o]))

  const at = (row: (string | null)[], key: string): string | null => {
    const index = mapping[key]
    if (index === undefined || index < 0) return null
    return row[index] ?? null
  }

  const outcomes: ProposedOutcome[] = []
  const skipped: SkippedRow[] = []

  rows.forEach((row, i) => {
    const rowNumber = rowNumbers[i]
    const company = at(row, 'company')?.trim() ?? null

    if (!company) {
      if (row.some((cell) => cell?.trim())) {
        skipped.push({ rowNumber, reason: 'No company name.', raw: null })
      }
      return
    }

    // The summary row sits in the MIDDLE of this tab, at row 18, with two real
    // deals below it. Its formulas only cover D5:D15, which is why the sheet's
    // own win rate and total won ARR leave those two deals out. Skip the label,
    // keep the deals underneath it.
    if (/^(company|win rate|total|avg)/i.test(company)) {
      skipped.push({ rowNumber, reason: 'Summary row.', raw: company })
      return
    }

    const rawOutcome = at(row, 'outcome')?.trim() ?? ''
    if (!/^(won|lost)$/i.test(rawOutcome)) {
      skipped.push({
        rowNumber,
        reason: rawOutcome ? `"${rawOutcome}" is neither Won nor Lost.` : 'No outcome on this row.',
        raw: company,
      })
      return
    }

    const warnings: string[] = []
    const won = /^won$/i.test(rawOutcome)

    const closeDate = parseDate(at(row, 'closeDate'))
    if (!closeDate) warnings.push('No close date — the deal will close as of today.')

    // Zeros on this tab mean "not applicable", not zero. The single lost deal
    // carries 0 for both its value and its days to close, and averaging those in
    // would drag every number on the report down.
    const rawAnnual = parseMoney(at(row, 'annualValue'))
    const annualValue = rawAnnual && rawAnnual > 0 ? rawAnnual : null
    const rawDays = Number(String(at(row, 'daysToClose') ?? '').replace(/[^\d.-]/g, ''))
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : null

    let openedOn: string | null = null
    if (closeDate && days !== null) {
      const d = new Date(`${closeDate}T12:00:00`)
      d.setDate(d.getDate() - days)
      openedOn = d.toISOString().slice(0, 10)
    } else {
      warnings.push('No days-to-close, so the deal has no start date and no sales cycle.')
    }

    const whole = norm(company)
    const { accountName, buildingName } = splitClientName(company)
    const match =
      byName.get(whole) ??
      byName.get(norm(buildingName)) ??
      // Last resort: a deal whose name starts with the same account. Reported as
      // a warning, because it is the one match here that is a genuine guess.
      targets.opportunities.find((o) => norm(o.name).startsWith(norm(accountName))) ??
      null

    if (!match) {
      warnings.push('No matching deal — a new one will be created.')
    } else if (norm(match.name) !== whole) {
      warnings.push(`Matched to "${match.name}" by name, not exactly.`)
    }

    const competitor = at(row, 'competitor')?.trim() || null
    const lossReasonText = at(row, 'lossReason')?.trim() || null
    if (!won && !lossReasonText && !competitor) {
      warnings.push('Lost, but the sheet records no reason and no competitor.')
    }

    outcomes.push({
      rowNumber,
      company,
      won,
      closeDate,
      openedOn,
      annualValue,
      // The Pipeline tab is the source of truth for value; this only supplies one
      // where the deal is brand new to the CRM.
      monthlyValue: annualValue === null ? null : Math.round((annualValue / 12) * 100) / 100,
      lossReasonText,
      competitorName: won ? null : competitor,
      winNotes: won ? (at(row, 'tippedTheWin')?.trim() || null) : null,
      opportunityId: match?.id ?? null,
      matchedName: match?.name ?? null,
      warnings,
    })
  })

  return { outcomes, skipped }
}
