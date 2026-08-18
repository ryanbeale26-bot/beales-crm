/**
 * Matching a note title to a record.
 *
 * Nothing here talks to the database or the network — the same rule
 * `addresses.ts` follows, and for the same reason: every rule in this file is
 * testable by reading it, and the callers above it stay about their own jobs.
 *
 * WHY THIS EXISTS AT ALL. Phase 7a matches on participants. Measured against
 * all 231 real Granola notes, that resolves nothing on any of them: not one
 * carries an external attendee address, because most are solo site inspections
 * dictated into a phone. The signal is the title, which carries street
 * addresses, building names and deal names.
 *
 * WHY IT IS AS STRICT AS IT IS. Some titles are private. Two of Ryan's last
 * twenty-four are his own medical appointments, and one of those carries both a
 * hospital name and a street address:
 *
 *   "Sleep apnea - reliable respiratory"
 *   "11:40pm - Sleep study Review - Dr Amit Anad - Center for Specialty Care -
 *    Milton Hospital - 199 Reedsdale Road Milton MA"
 *
 * A single-word matcher filed a family hospice note under Beth Israel Lahey on
 * the word "Beth". So: a derived phrase must be a PHRASE, and a street address
 * must carry its NUMBER — which is exactly why 199 Reedsdale Road matches
 * nothing, Beale's having no contract at that number.
 */

/**
 * Long street-suffix forms and their canonical short form.
 *
 * DUPLICATED in SQL as normalise_alias(), because v_alias_candidates has to
 * apply the same rule and a view cannot call TypeScript, while this matcher runs
 * over hundreds of titles and cannot make a round trip per phrase. Two copies of
 * a rule is a real cost; db:verify asserts the two agree. If one is edited, edit
 * both.
 *
 * The short forms are already canonical, so they need no entry of their own.
 */
export const SUFFIX_FORMS: Record<string, string> = {
  street: 'st',
  road: 'rd',
  drive: 'dr',
  avenue: 'ave',
  boulevard: 'blvd',
  parkway: 'pkwy',
  circle: 'cir',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  turnpike: 'tpke',
  highway: 'hwy',
  suites: 'suite',
  ste: 'suite',
}

/**
 * Tokens that carry no identity on their own.
 *
 * Used only to decide whether a DERIVED phrase is specific enough to offer —
 * never to edit a phrase. "Center" alone is half the healthcare book;
 * "Cancer Center" is a curated alias, which is a different thing entirely.
 */
const GENERIC_TOKENS = new Set([
  'the', 'and', 'of', 'at', 'in', 'llc', 'inc', 'co', 'corp', 'ltd', 'lp', 'llp',
  'properties', 'property', 'management', 'mgmt', 'group', 'partners', 'realty',
  'center', 'centre', 'hospital', 'medical', 'health', 'healthcare', 'clinic',
  'building', 'bldg', 'suite', 'floor', 'office', 'park', 'plaza',
  'inspection', 'walkthrough', 'meeting', 'ma', 'st', 'rd', 'dr', 'ave',
])

/** Titles that say what KIND of activity this was. A keyword picks a label —
 *  never a link. */
const SITE_VISIT_WORDS = ['inspection', 'inspect', 'walk through', 'walkthrough', 'walk thru']

/**
 * Lower-case, punctuation to spaces, whitespace collapsed, street suffixes
 * collapsed. The exact counterpart of normalise_alias() in SQL.
 *
 * Turning every non-alphanumeric character into a space is what makes
 * "Beale's", "Dana-Farber" and "90 Libbey Pkwy." normalise cleanly without a
 * list of punctuation to keep in step with anything.
 */
export function normaliseAlias(text: string | null | undefined): string | null {
  if (!text) return null

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => SUFFIX_FORMS[word] ?? word)

  return words.length === 0 ? null : words.join(' ')
}

/**
 * A title, normalised for matching.
 *
 * Dates and times are stripped BEFORE punctuation is flattened, and the order
 * matters: "8-13-2026" flattened first becomes the tokens "8 13 2026", which
 * then look exactly like a street number followed by a word. Every one of these
 * shapes is real:
 *
 *   "8-13-2026 46 Obery st inspection"     leading date
 *   "295 old oak Pembroke 8-6-2026"        trailing date
 *   "Wound center inspection 8-5-2027"     trailing date, and the YEAR IS WRONG
 *   "11:40pm - Sleep study Review ..."     leading time
 *   "6am cancer center walk through. 5:45 meet at DadS house"   two times
 *
 * The wrong year is why nothing downstream ever reads a date out of a title:
 * the note's own timestamp is the only date this phase trusts.
 */
export function normaliseTitle(title: string): string {
  const withoutDates = title
    // 8-13-2026, 8/13/26, 8.13.2026
    .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')
    // 2026-08-13
    .replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ')
    // 11:40pm, 5:45
    .replace(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi, ' ')
    // 6am, 6 pm. The trailing word boundary is what stops this eating the "6 Am"
    // of a street called "6 Amherst".
    .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, ' ')

  return normaliseAlias(withoutDates) ?? ''
}

/** Which activity type a note describes. Reads a keyword, decides a label, and
 *  touches no link. */
export function activityTypeForTitle(title: string): 'Site visit' | 'Meeting' {
  const flat = normaliseTitle(title)
  return SITE_VISIT_WORDS.some((word) => flat.includes(normaliseAlias(word) ?? word))
    ? 'Site visit'
    : 'Meeting'
}

/** Which record a phrase points at. Exactly one of the three is set, which the
 *  `match_aliases_one_target` constraint enforces in the database. */
export type AliasTarget = {
  accountId: string | null
  buildingId: string | null
  opportunityId: string | null
}

/** Where a phrase came from. `curated` is a person's explicit statement and
 *  outranks anything derived at the same words. */
export type PhraseSource = 'curated' | 'address' | 'name'

export type Phrase = {
  /** Already normalised. */
  alias: string
  source: PhraseSource
  target: AliasTarget
  /** What to call the record on screen. */
  label: string
}

export function targetKey(target: AliasTarget): string {
  return target.accountId ?? target.buildingId ?? target.opportunityId ?? 'none'
}

/**
 * A street address, reduced to the two forms a real title might carry.
 *
 * "797 Main St" gives back "797 main st" and "797 main". The short form is not
 * laziness — it is the only thing that matches "8-12-2026 797 main at
 * inspection", where "at" is a typo for "St". The number is mandatory in both,
 * and that single requirement is what keeps a bare "Main St" from matching
 * anything and what makes "199 Reedsdale Road" in a private medical note match
 * nothing at all.
 */
export function addressPhrases(addressLine: string | null | undefined): string[] {
  const flat = normaliseAlias(addressLine)
  if (!flat) return []

  const tokens = flat.split(' ')
  // No leading street number means no address phrase. A street name on its own
  // is not specific enough to be a fact.
  if (!/^\d[\da-z-]*$/.test(tokens[0]) || tokens.length < 2) return []

  const short = `${tokens[0]} ${tokens[1]}`
  return short === flat ? [flat] : [flat, short]
}

/** Whether a DERIVED phrase is specific enough to be worth matching on. Curated
 *  aliases skip this: a person typed them, which is the safeguard. */
export function isSpecificEnough(alias: string): boolean {
  const tokens = alias.split(' ')
  if (tokens.some((token) => /^\d/.test(token))) return tokens.length >= 2
  return tokens.filter((token) => !GENERIC_TOKENS.has(token)).length >= 2
}

/**
 * Whether a phrase says nothing on its own, even curated.
 *
 * "Medical Center" is every third record in a healthcare book. A person typing
 * it has almost certainly not meant to claim it for one building, so the admin
 * screen refuses it and says why. Deliberately NOT a length rule: "HTA" is three
 * characters and is a real alias.
 */
export function isTooGenericToCurate(alias: string): boolean {
  const tokens = alias.split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every((token) => GENERIC_TOKENS.has(token))
}

export type TitleMatch = { phrase: Phrase; start: number; end: number }

export type TitleVerdict =
  /** Exactly one record. A fact, and the link is applied. */
  | { kind: 'matched'; phrase: Phrase; matchedOn: string }
  /** Two or more different records are named. Nothing is linked and nothing is
   *  proposed — an alias is what resolves it, permanently. */
  | { kind: 'ambiguous'; matches: TitleMatch[] }
  /** Nothing known is named. Where the private notes land. */
  | { kind: 'none' }

/** Every occurrence of a phrase in the normalised title, at word boundaries. */
function occurrences(flatTitle: string, phrase: Phrase): TitleMatch[] {
  const haystack = ` ${flatTitle} `
  const needle = ` ${phrase.alias} `
  const found: TitleMatch[] = []

  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    // Back to offsets in flatTitle itself, so a caller can quote in context.
    found.push({ phrase, start: at, end: at + phrase.alias.length })
    // Overlapping repeats of one phrase tell us nothing extra, so step past it.
    from = at + needle.length - 1
  }

  return found
}

/**
 * Decide what a title is about.
 *
 * The interesting rule is what happens when several phrases match, because two
 * genuinely different situations look identical in a naive "longest wins":
 *
 *   "8-11-2026 851 middle st suite 2100"
 *       "851 middle st suite 2100" (one building) and "851 middle" (two
 *       buildings, because a landlord and a tenant both have contracts at that
 *       address). One phrase sits INSIDE the other, so the longer one is simply
 *       more specific and it wins. Answer: that building.
 *
 *   "Quincy Ambulatory and Plymouth Cordage Park kick off meeting"
 *       Two phrases at different places in the title, naming two different
 *       records. Neither is more specific than the other — they are both true.
 *       Answer: ambiguous, and longest-wins would have silently picked one.
 *
 * So containment is what decides, not length on its own. A phrase wholly inside
 * another phrase's span is discarded; what survives is counted by DISTINCT
 * RECORD, and two records means no link.
 */
export function matchTitle(title: string, phrases: Phrase[]): TitleVerdict {
  const flat = normaliseTitle(title)
  if (flat === '') return { kind: 'none' }

  const all = phrases.flatMap((phrase) => occurrences(flat, phrase))
  if (all.length === 0) return { kind: 'none' }

  // A more specific phrase covering the same words wins.
  let surviving = all.filter(
    (candidate) =>
      !all.some(
        (other) =>
          other !== candidate &&
          other.start <= candidate.start &&
          other.end >= candidate.end &&
          other.end - other.start > candidate.end - candidate.start,
      ),
  )

  // A person's explicit alias beats a phrase merely derived from a record name
  // at the same words. Curation is the whole reason match_aliases exists, so it
  // has to outrank the thing it was created to correct.
  const curated = surviving.filter((match) => match.phrase.source === 'curated')
  if (curated.length > 0) {
    surviving = surviving.filter(
      (match) =>
        match.phrase.source === 'curated' ||
        !curated.some((c) => c.start < match.end && match.start < c.end),
    )
  }

  const records = new Set(surviving.map((match) => targetKey(match.phrase.target)))

  if (records.size === 1) {
    // Report the longest surviving phrase: it is the most specific thing the
    // title actually said, and it is what the admin screen prints back.
    const best = surviving.reduce((a, b) =>
      b.phrase.alias.length > a.phrase.alias.length ? b : a,
    )
    return { kind: 'matched', phrase: best.phrase, matchedOn: best.phrase.alias }
  }

  return { kind: 'ambiguous', matches: surviving }
}
