import { parseDate, splitClientName } from './parse-rows'
import { readWorkbook } from './workbook'

/**
 * Re-attaching the 374 activities that are linked to nothing.
 *
 * The Activity Log has a Company column. `commitActivities` read it, used it in
 * the preview, and then wrote only account_id and building_id — so an activity
 * it could not place kept its subject and date and lost the company string
 * entirely. There is nothing left in the database to parse.
 *
 * So the company string is fetched back out of the workbook and the two are
 * keyed together on (subject, date). That key was measured against the real
 * data before this was written: 667 of 667 rows match exactly one activity and
 * none matches two, which is what makes this a join rather than a guess.
 *
 * What it then matches against is the surprise, and it is why this is worth
 * doing at all. Re-running the *account* matcher over those 374 resolves
 * exactly none of them — the accounts that were going to match already did, in
 * the original import. What the leftovers are is **deals**: "Jumbo Capital",
 * "HTA REIT — 851 Middle St Fall River", "Boston Children's Hospital — RFP via
 * Premier (GPO)". 113 of them are an exact match on an opportunity's name.
 *
 * That matters more than the number suggests. Every report in the app treats
 * deal activity as unmeasurable, because 0 of 667 activities carried an
 * opportunity_id — which is also why "this deal has gone quiet" could not be
 * built. This is where that number stops being zero.
 */

export type RelinkProposal = {
  activityId: string
  activitySubject: string
  occurredOn: string
  company: string
  opportunityId: string
  opportunityName: string
  /** Resolved here rather than left to the trigger — see the note below. */
  accountId: string | null
}

export type RelinkResult = {
  proposals: RelinkProposal[]
  /** Rows whose company matched no deal. Genuinely a person's job. */
  unmatched: { company: string; count: number }[]
  sheetRows: number
  orphans: number
  /** Rows the (subject, date) key could not pin to exactly one activity. */
  unkeyed: number
}

export type RelinkTargets = {
  activities: {
    id: string
    subject: string
    occurred_at: string
    account_id: string | null
    building_id: string | null
    opportunity_id: string | null
  }[]
  opportunities: { id: string; name: string; account_id: string | null }[]
}

const norm = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()

const keyOf = (subject: string, isoDate: string) => `${norm(subject)}|${isoDate}`

export async function buildRelinkProposal(
  buffer: ArrayBuffer,
  fileName: string,
  targets: RelinkTargets,
): Promise<RelinkResult> {
  const sheets = await readWorkbook(buffer, fileName)
  const sheet =
    sheets.find((s) => s.name.toLowerCase().includes('activity log')) ??
    sheets.find((s) => s.headers.some((h) => norm(h) === 'summary'))

  if (!sheet) {
    throw new Error(
      'No Activity Log sheet in that file. Expected a tab called "4 - Activity Log".',
    )
  }

  const column = (fragment: string) =>
    sheet.headers.findIndex((h) => h && norm(h).includes(fragment))

  const iDate = column('date')
  const iSummary = column('summary')
  const iType = column('activity type')
  const iCompany = column('company')

  if (iSummary < 0 || iDate < 0 || iCompany < 0) {
    throw new Error('That sheet has no Date, Summary and Company columns.')
  }

  // One entry per key. A key that appears twice is dropped from the map rather
  // than resolved, because picking one of two activities to relink is exactly
  // the kind of guess this whole phase refuses to make.
  const byKey = new Map<string, RelinkTargets['activities'][number] | null>()
  for (const activity of targets.activities) {
    const key = keyOf(activity.subject, activity.occurred_at.slice(0, 10))
    byKey.set(key, byKey.has(key) ? null : activity)
  }

  const dealByName = new Map<string, RelinkTargets['opportunities'][number]>()
  const dealNameCount = new Map<string, number>()
  for (const deal of targets.opportunities) {
    const name = norm(deal.name)
    dealNameCount.set(name, (dealNameCount.get(name) ?? 0) + 1)
    dealByName.set(name, deal)
  }

  const proposals: RelinkProposal[] = []
  const unmatchedCounts = new Map<string, number>()
  let sheetRows = 0
  let unkeyed = 0

  for (const row of sheet.rows) {
    const cell = (index: number) => (index < 0 ? null : (row[index] ?? null))

    const subject = cell(iSummary)?.trim() || cell(iType)?.trim() || null
    if (!subject || norm(subject) === 'summary') continue
    sheetRows += 1

    const occurredOn = parseDate(cell(iDate))
    if (!occurredOn) {
      unkeyed += 1
      continue
    }

    const activity = byKey.get(keyOf(subject.slice(0, 500), occurredOn))
    if (!activity) {
      unkeyed += 1
      continue
    }

    // Already attached to something. Never re-point an existing link.
    if (activity.account_id || activity.building_id || activity.opportunity_id) continue

    const company = cell(iCompany)?.trim()
    if (!company) continue

    const deal = matchDeal(company, dealByName, dealNameCount)
    if (!deal) {
      unmatchedCounts.set(company, (unmatchedCounts.get(company) ?? 0) + 1)
      continue
    }

    proposals.push({
      activityId: activity.id,
      activitySubject: activity.subject,
      occurredOn,
      company,
      opportunityId: deal.id,
      opportunityName: deal.name,
      accountId: deal.account_id,
    })
  }

  return {
    proposals,
    unmatched: [...unmatchedCounts.entries()]
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count),
    sheetRows,
    orphans: targets.activities.filter(
      (a) => !a.account_id && !a.building_id && !a.opportunity_id,
    ).length,
    unkeyed,
  }
}

/**
 * Exact name equality, then the half before the em-dash — the same two passes
 * the account matcher makes, and for the same reason: the sheet writes
 * "HTA REIT — 851 Middle St Fall River" where the deal is called either the
 * whole thing or just "HTA REIT".
 *
 * A name that belongs to two deals matches neither. Measured against the real
 * data this never happens today, but two deals for one client is an ordinary
 * thing to happen next year.
 */
function matchDeal(
  company: string,
  dealByName: Map<string, RelinkTargets['opportunities'][number]>,
  dealNameCount: Map<string, number>,
): RelinkTargets['opportunities'][number] | null {
  const whole = norm(company)
  if (dealNameCount.get(whole) === 1) return dealByName.get(whole) ?? null

  const head = norm(splitClientName(company).accountName)
  if (head !== whole && dealNameCount.get(head) === 1) return dealByName.get(head) ?? null

  return null
}
