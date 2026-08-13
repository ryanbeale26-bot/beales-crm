/**
 * What each importer expects, and how to guess the mapping from the column
 * names Ryan actually uses. Guesses are only a starting point — the mapping
 * screen always shows them for confirmation.
 */

export type FieldDef = {
  key: string
  label: string
  hint?: string
  /** Lower-cased header fragments that suggest this field. */
  match: string[]
}

export type ImporterKey = 'active-clients' | 'contacts' | 'activities'

export type ImporterDef = {
  key: ImporterKey
  label: string
  description: string
  /** Sheet name fragment used to pre-select the right tab. */
  sheetHint: string
  fields: FieldDef[]
}

export const IMPORTERS: Record<ImporterKey, ImporterDef> = {
  'active-clients': {
    key: 'active-clients',
    label: 'Active Clients → accounts and buildings',
    description:
      'One row per building. Accounts are worked out from the client name and shown for you to merge before anything is written.',
    sheetHint: 'active clients',
    fields: [
      {
        key: 'clientName',
        label: 'Client name',
        hint: 'Split on the em-dash to derive the account and the building',
        match: ['client name', 'client', 'customer'],
      },
      { key: 'serviceScope', label: 'Service scope', hint: 'Address, square footage and service type', match: ['service scope', 'scope'] },
      { key: 'monthlyValue', label: 'Monthly value', match: ['monthly value', 'monthly'] },
      { key: 'contractStart', label: 'Contract start', match: ['contract start', 'start date', 'start'] },
      { key: 'renewalDate', label: 'Renewal date', match: ['renewal', 'end date', 'expiry'] },
      { key: 'healthScore', label: 'Health score', match: ['health'] },
      { key: 'owner', label: 'Owner', match: ['owner', 'account manager'] },
      { key: 'primaryContact', label: 'Primary contact', match: ['primary contact', 'contact name'] },
      { key: 'contactEmail', label: 'Contact email', match: ['email'] },
      { key: 'contactPhone', label: 'Contact phone', match: ['phone', 'mobile'] },
      { key: 'notes', label: 'Notes', match: ['notes'] },
      { key: 'openIssues', label: 'Open issues', hint: 'Appended to the building notes', match: ['open issues', 'issues'] },
      { key: 'inspectqaId', label: 'Inspection system ID', match: ['cleansmarts', 'inspectqa', 'site id'] },
    ],
  },
  activities: {
    key: 'activities',
    label: 'Activity Log → activities',
    description:
      'One row per thing that happened. The free-text type column is mapped down to the short list, and anything that does not match is filed as a Note rather than guessed at.',
    sheetHint: 'activity log',
    fields: [
      { key: 'date', label: 'Date', match: ['date'] },
      { key: 'summary', label: 'Summary', hint: 'Becomes the subject', match: ['summary', 'description'] },
      { key: 'activityType', label: 'Activity type', match: ['activity type', 'type'] },
      { key: 'company', label: 'Company', hint: 'Matched against existing accounts', match: ['company', 'client'] },
      { key: 'contact', label: 'Contact', match: ['contact'] },
      { key: 'source', label: 'Source', match: ['source'] },
      { key: 'outcome', label: 'Outcome', hint: 'Kept in the notes', match: ['outcome'] },
      { key: 'nextStep', label: 'Next step', hint: 'Kept in the notes', match: ['next step', 'next action'] },
      { key: 'owner', label: 'Owner', match: ['owner'] },
    ],
  },
  contacts: {
    key: 'contacts',
    label: 'Contact Directory → contacts',
    description:
      'One row per person. Client and prospect contacts become contacts; employees and vendors are flagged so you can decide.',
    sheetHint: 'contact directory',
    fields: [
      { key: 'fullName', label: 'Full name', match: ['full name', 'name'] },
      { key: 'company', label: 'Company', hint: 'Matched against existing accounts', match: ['company', 'client / prospect ref', 'client'] },
      { key: 'title', label: 'Title', match: ['title', 'role'] },
      { key: 'email', label: 'Email', match: ['email'] },
      { key: 'phone', label: 'Phone', match: ['phone', 'mobile'] },
      { key: 'relationship', label: 'Relationship type', match: ['relationship'] },
      { key: 'owner', label: 'Owner', match: ['owner'] },
      { key: 'notes', label: 'Notes', match: ['notes'] },
      { key: 'active', label: 'Active?', match: ['active'] },
    ],
  },
}

/** Best-guess column index for each field, or -1 when nothing matches. */
export function guessMapping(def: ImporterDef, headers: string[]): Record<string, number> {
  const lower = headers.map((h) => h.toLowerCase().trim())
  const used = new Set<number>()
  const mapping: Record<string, number> = {}

  for (const field of def.fields) {
    let found = -1

    // Exact match first, so "Email" doesn't get stolen by a fuzzy rule.
    for (const candidate of field.match) {
      const exact = lower.findIndex((h, i) => h === candidate && !used.has(i))
      if (exact !== -1) {
        found = exact
        break
      }
    }

    if (found === -1) {
      for (const candidate of field.match) {
        const partial = lower.findIndex((h, i) => h.includes(candidate) && !used.has(i))
        if (partial !== -1) {
          found = partial
          break
        }
      }
    }

    if (found !== -1) used.add(found)
    mapping[field.key] = found
  }

  return mapping
}
