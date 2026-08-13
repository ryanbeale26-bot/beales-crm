/**
 * Turning Ryan's two free-text columns into structured records.
 *
 * All of this is a best guess and says so: every proposal carries `warnings`,
 * and the preview screen shows them before anything is written. Nothing here
 * silently invents data — anything it cannot parse is left blank and the
 * original text is always kept in the notes.
 */

export type ParsedName = { accountName: string; buildingName: string; warning?: string }

/** Em-dash, en-dash, or a spaced hyphen — Ryan's sheet uses all three. */
const SPLITTERS = [' — ', ' – ', ' — ', ' - ']

/**
 * "Boston Scientific — Quincy" → account "Boston Scientific", building "Quincy".
 * "Fox Rock Properties"        → both, since there is only one name to go on.
 */
export function splitClientName(raw: string): ParsedName {
  const name = raw.replace(/\s+/g, ' ').trim()

  for (const splitter of SPLITTERS) {
    const at = name.indexOf(splitter)
    if (at > 0) {
      const accountName = name.slice(0, at).trim()
      const buildingName = name.slice(at + splitter.length).trim()
      if (accountName && buildingName) return { accountName, buildingName }
    }
  }

  return {
    accountName: name,
    buildingName: name,
    warning: 'No dash in the client name, so the account and building share it.',
  }
}

export type ParsedScope = {
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  squareFootage: number | null
  serviceTypes: string[]
  warnings: string[]
}

const SERVICE_WORDS: Record<string, string> = {
  janitorial: 'Janitorial',
  maintenance: 'Maintenance',
  hvac: 'HVAC',
  security: 'Security',
}

/**
 * "100 Adams Rd Clinton MA · 345,774 SF Industrial · Janitorial + Maintenance"
 * Segments are separated by "·" but not every row follows the pattern, so each
 * piece is pulled out independently rather than by position.
 */
export function parseServiceScope(raw: string | null): ParsedScope {
  const result: ParsedScope = {
    addressLine1: null,
    city: null,
    state: null,
    postalCode: null,
    squareFootage: null,
    serviceTypes: [],
    warnings: [],
  }
  if (!raw) return result

  const text = raw.replace(/\s+/g, ' ').trim()

  // Square footage, wherever it appears: "345,774 SF"
  const sf = text.match(/([\d][\d,]*)\s*(?:sq\.?\s*ft|sf)\b/i)
  if (sf) {
    const value = Number(sf[1].replace(/,/g, ''))
    if (Number.isFinite(value)) result.squareFootage = value
  }

  // Service types, wherever they appear.
  for (const [word, label] of Object.entries(SERVICE_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) result.serviceTypes.push(label)
  }

  // The address is the first segment that carries a street number.
  const segments = text.split('·').map((s) => s.trim()).filter(Boolean)
  const addressSegment =
    segments.find((s) => /\d/.test(s) && !/\bsf\b|sq\.?\s*ft/i.test(s)) ?? null

  if (addressSegment) {
    const address = parseAddress(addressSegment)
    result.addressLine1 = address.addressLine1
    result.city = address.city
    result.state = address.state
    result.postalCode = address.postalCode
    result.warnings.push(...address.warnings)
  }

  return result
}

export type ParsedAddress = {
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  warnings: string[]
}

/**
 * "100 Adams Rd Clinton MA 01510" → street / city / state / zip.
 * Used on the scope column and, when that yields nothing, on the building name —
 * several rows carry the address there instead ("38 Industrial Park Rd, Plymouth").
 */
export function parseAddress(raw: string): ParsedAddress {
  const result: ParsedAddress = {
    addressLine1: null,
    city: null,
    state: null,
    postalCode: null,
    warnings: [],
  }

  const cleaned = raw
    .replace(/\s*[—–]\s*.*$/, '') // drop trailing commentary after a dash
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || !/\d/.test(cleaned)) return result

  const zip = cleaned.match(/\b(\d{5})(?:-\d{4})?\s*$/)
  if (zip) result.postalCode = zip[1]

  const withoutZip = zip ? cleaned.slice(0, zip.index).trim() : cleaned
  const state = withoutZip.match(/[,\s]\s*([A-Z]{2})\s*\.?$/)

  const body = state ? withoutZip.slice(0, state.index).trim().replace(/,$/, '') : withoutZip
  if (state) result.state = state[1]

  // City is the last comma-separated chunk when there is one.
  const parts = body.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    result.city = parts[parts.length - 1]
    result.addressLine1 = parts.slice(0, -1).join(', ')
  } else {
    const words = body.split(' ')
    // A street name ends in a type word; anything after it is the town.
    const typeAt = words.findLastIndex((w) =>
      /^(st|street|rd|road|ave|avenue|dr|drive|blvd|way|ln|lane|pkwy|parkway|circle|cir|ct|court|pl|place|sq|square|hwy|highway|terrace|ter)\.?,?$/i.test(w),
    )
    if (typeAt !== -1 && typeAt < words.length - 1) {
      result.addressLine1 = words.slice(0, typeAt + 1).join(' ').replace(/,$/, '')
      result.city = words.slice(typeAt + 1).join(' ').replace(/,$/, '')
    } else {
      result.addressLine1 = body
    }
  }

  if (!result.state) result.warnings.push('No state found in the address text.')
  return result
}

export function parseMoney(raw: string | null): number | null {
  if (!raw) return null
  const value = Number(String(raw).replace(/[$,\s]/g, ''))
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function parseDate(raw: string | null): string | null {
  if (!raw) return null
  const text = String(raw).trim()

  // Already ISO.
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)

  // US style, which is what a US spreadsheet exports.
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (us) {
    const [, m, d, y] = us
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

export type HealthScore = 'healthy' | 'needs_attention' | 'at_risk'

export function parseHealth(raw: string | null): HealthScore | null {
  if (!raw) return null
  const text = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  if (text.includes('healthy')) return 'healthy'
  if (text.includes('needs')) return 'needs_attention'
  if (text.includes('risk')) return 'at_risk'
  return null
}

/**
 * "Ryan", "Both", "Ryan / Robert" → up to two people. Matched on first name
 * against the real profiles, so "Robert" finds Robert Mulligan.
 */
export function parseOwners(
  raw: string | null,
  profiles: { id: string; full_name: string }[],
): { ownerId: string | null; secondaryOwnerId: string | null; warning?: string } {
  if (!raw) return { ownerId: null, secondaryOwnerId: null }

  const text = raw.trim()
  if (/^both$/i.test(text)) {
    // "Both" means the two managing directors, but say so rather than assume.
    const ryan = profiles.find((p) => /^ryan\b/i.test(p.full_name))
    const robert = profiles.find((p) => /^robert\b/i.test(p.full_name))
    return {
      ownerId: ryan?.id ?? null,
      secondaryOwnerId: robert?.id ?? null,
      warning: '"Both" read as Ryan plus Robert.',
    }
  }

  const names = text.split(/[/&,]|\band\b/i).map((n) => n.trim()).filter(Boolean)
  const matched = names
    .map((name) => profiles.find((p) => p.full_name.toLowerCase().startsWith(name.toLowerCase())))
    .filter((p): p is { id: string; full_name: string } => Boolean(p))

  const warning =
    matched.length < names.length
      ? `No match for owner "${names.filter((n) => !profiles.some((p) => p.full_name.toLowerCase().startsWith(n.toLowerCase()))).join(', ')}".`
      : undefined

  return {
    ownerId: matched[0]?.id ?? null,
    secondaryOwnerId: matched[1]?.id ?? null,
    warning,
  }
}

/** "Dawn Aimola" → first and last. A single word becomes the last name. */
export function splitPersonName(raw: string | null): { first: string; last: string } | null {
  if (!raw) return null
  const parts = raw.replace(/\s+/g, ' ').trim().split(' ')
  if (parts.length === 0 || parts[0] === '') return null
  if (parts.length === 1) return { first: '', last: parts[0] }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/** Totals rows and blank spacers that must never become records. */
export function isSkippableRow(clientName: string | null): string | null {
  if (!clientName) return 'No client name.'
  const text = clientName.trim().toLowerCase()
  if (text.startsWith('total')) return 'Totals row.'
  if (text === 'client name') return 'Repeated header row.'
  return null
}
