/**
 * What the title matcher would make of every Granola note. WRITES NOTHING.
 *
 *   npm run granola:probe              # against the real notes and the real database
 *   npm run granola:probe -- --selftest  # the hazard cases only. No network, no database
 *
 * WHY THIS IS A TERMINAL SCRIPT AND NOT A SCREEN. The list that matters most is
 * the one at the bottom: titles that matched nothing. That list is, by
 * construction, where the private notes are — two of Ryan's last twenty-four are
 * his own medical appointments, and one of those names a hospital and a street.
 * He needs to read those titles to know which alias to add, and they must not be
 * stored anywhere four colleagues can read. A terminal is the only place both of
 * those are true at once.
 *
 * The loop this is built for: probe, add an alias or two at /admin/ingest, probe
 * again. Repeat until the unmatched list is only genuinely personal notes.
 */

import { granolaListItem, listGranolaNotes } from '@/lib/ingest/granola'
import { loadDirectory, matchItem } from '@/lib/ingest/match'
import { matchTitle, activityTypeForTitle, type Phrase } from '@/lib/ingest/titles'

import { readEnvLocal, requireEnv, signInAsIngest } from './granola-env'

const SELFTEST = process.argv.includes('--selftest')

// ---------------------------------------------------------------------------
// The self-test: every shape that has to keep working, pinned.
// ---------------------------------------------------------------------------
// Real titles, from the real account. This is the regression test for the rule
// the whole phase rests on, and it needs neither a credential nor a database —
// so it runs anywhere, including before anybody has set the key up.

function selftest(): number {
  let failures = 0
  let ran = 0
  const check = (name: string, ok: boolean, detail = '') => {
    ran += 1
    console.log(ok ? `  ok    ${name}` : `  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures += 1
  }

  const target = (kind: 'account' | 'building' | 'deal', id: string) => ({
    accountId: kind === 'account' ? id : null,
    buildingId: kind === 'building' ? id : null,
    opportunityId: kind === 'deal' ? id : null,
  })

  const phrases: Phrase[] = [
    // 46 Obery St — one building, one address.
    { alias: '46 obery st', source: 'address', target: target('building', 'obery'), label: '46 Obery St' },
    { alias: '46 obery', source: 'address', target: target('building', 'obery'), label: '46 Obery St' },
    // 797 Main St — the title says "797 main at", a typo for St, so only the
    // short form can reach it.
    { alias: '797 main st', source: 'address', target: target('building', 'main'), label: '797 Main St' },
    { alias: '797 main', source: 'address', target: target('building', 'main'), label: '797 Main St' },
    // 851 Middle St — TWO contracts to two accounts at one address, which is the
    // whole reason a bare address there has to be ambiguous.
    { alias: '851 middle st', source: 'address', target: target('building', 'hta'), label: 'HTA suite 2100' },
    { alias: '851 middle', source: 'address', target: target('building', 'hta'), label: 'HTA suite 2100' },
    { alias: '851 middle st', source: 'address', target: target('building', 'brown'), label: 'Brown suite 3500' },
    { alias: '851 middle', source: 'address', target: target('building', 'brown'), label: 'Brown suite 3500' },
    // ...and the curated alias that resolves it.
    { alias: '851 middle st suite 2100', source: 'curated', target: target('building', 'hta'), label: 'HTA suite 2100' },
    // Two genuinely different places, both named in one title.
    { alias: 'quincy ambulatory', source: 'name', target: target('deal', 'quincy'), label: 'Quincy Ambulatory' },
    { alias: 'plymouth cordage park', source: 'name', target: target('deal', 'cordage'), label: 'Plymouth Cordage Park' },
    // The account the single-word matcher wrongly filed a family hospice note
    // under, on the word "Beth".
    { alias: 'beth israel lahey', source: 'name', target: target('account', 'bilh'), label: 'Beth Israel Lahey' },
    { alias: 'wound center', source: 'curated', target: target('building', 'wound'), label: 'Wound Center' },
  ]

  const verdict = (title: string) => matchTitle(title, phrases)

  const a = verdict('8-13-2026 46 Obery st inspection')
  check('a leading date does not stop an address matching', a.kind === 'matched' && a.phrase.label === '46 Obery St', a.kind)

  const b = verdict('295 old oak Pembroke 8-6-2026')
  check('a trailing date matches nothing on its own', b.kind === 'none', b.kind)

  const c = verdict('8-12-2026 797 main at inspection ')
  check('"797 main at" still reaches 797 Main St', c.kind === 'matched' && c.phrase.label === '797 Main St', c.kind)

  const d = verdict('8-11-2026 851 middle st')
  check('one address, two contracts, no suite -> ambiguous', d.kind === 'ambiguous', d.kind)

  const e = verdict('8-11-2026 851 middle st suite 2100')
  check('the suite resolves it, because the longer phrase contains the shorter', e.kind === 'matched' && e.phrase.label === 'HTA suite 2100', e.kind)

  const f = verdict('Quincy Ambulatory and Plymouth Cordage Park kick off meeting - 8-11-2026')
  check('two different places in one title -> ambiguous, never the longer one', f.kind === 'ambiguous', f.kind)

  const g = verdict('Sleep apnea - reliable respiratory')
  check('a private medical note matches nothing', g.kind === 'none', g.kind)

  const h = verdict('11:40pm - Sleep study Review - Dr Amit Anad -Center for Specialty Care - Milton Hospital -199 Reedsdale Road Milton MA')
  check('a private note naming a hospital AND a street matches nothing', h.kind === 'none', h.kind)

  const i = verdict("Beth's hospice visit with the family")
  check('"Beth" alone never reaches Beth Israel Lahey', i.kind === 'none', i.kind)

  const j = verdict('Wound center inspection 8-5-2027')
  check('a curated alias matches, and the wrong year in the title is ignored', j.kind === 'matched' && j.phrase.label === 'Wound Center', j.kind)

  const k = verdict('6am cancer center walk through. 5:45 meet at DadS house - USA Granola to track the walk through ')
  check('two stray times do not break a title', k.kind === 'none', k.kind)

  check('an inspection is a Site visit', activityTypeForTitle('8-13-2026 46 Obery st inspection') === 'Site visit')
  check('a walk through is a Site visit', activityTypeForTitle('6am cancer center walk through') === 'Site visit')
  check('a kick off is a Meeting', activityTypeForTitle('Quincy Ambulatory kick off meeting') === 'Meeting')

  // Counted, not hardcoded: a total that can disagree with the checks it is
  // counting is the one number in a test nobody would think to doubt.
  console.log(`\n${failures === 0 ? 'PASSED' : 'FAILED'} — ${ran - failures}/${ran} checks\n`)
  return failures
}

// ---------------------------------------------------------------------------

async function main() {
  if (SELFTEST) {
    console.log('\nTitle matcher self-test — no network, no database\n')
    process.exit(selftest() === 0 ? 0 : 1)
  }

  const env = readEnvLocal()
  const apiKey = requireEnv(env, 'GRANOLA_API_KEY')
  const supabase = await signInAsIngest(env)

  const dir = await loadDirectory(supabase)
  const curated = dir.phrases.filter((p) => p.source === 'curated').length

  console.log(
    `\n${dir.phrases.length} phrases in the book — ${curated} curated, ` +
      `${dir.phrases.length - curated} derived from records already held.\n`,
  )

  console.log('Reading notes from Granola (read-only)…')
  const { notes, truncated } = await listGranolaNotes({ apiKey })
  console.log(`${notes.length} notes${truncated ? ' (stopped early — there are more)' : ''}.\n`)

  const clean: string[] = []
  const ambiguous: string[] = []
  const nothing: string[] = []

  for (const note of notes) {
    const title = (note.title ?? '').trim()
    const when = note.created_at.slice(0, 10)

    if (title === '') {
      nothing.push(`  ${when}  (no title)`)
      continue
    }

    // Deliberately matchItem(), the SAME function the nightly job calls, on the
    // same RawItem the connector would hand it — rather than matchTitle() on its
    // own. A probe that reasons about matching slightly differently from the job
    // is the "two counts of one number eventually disagree" mistake, and the
    // number here is the one that decides what Ryan aliases.
    const outcome = matchItem(granolaListItem(note, apiKey), dir)

    if (outcome.kind === 'matched') {
      const type = activityTypeForTitle(title)
      const label = outcome.match.label ?? outcome.match.accountName
      const account =
        outcome.match.accountName && outcome.match.accountName !== label
          ? `  (${outcome.match.accountName})`
          : ''
      clean.push(
        `  ${when}  ${title}\n` +
          `            -> ${label}${account}  [${type}]  via “${outcome.match.matchedOn}”`,
      )
    } else if (outcome.kind === 'ambiguous') {
      const labels = [...new Set(outcome.candidates.map((c) => `${c.label} (${c.kind})`))]
      ambiguous.push(
        `  ${when}  ${title}\n` + `            -> could be: ${labels.join('  |  ')}`,
      )
    } else {
      nothing.push(`  ${when}  ${title}`)
    }
  }

  console.log(`CLEAN — ${clean.length}. These would be logged, linked, as Ryan.\n`)
  console.log(clean.join('\n') || '  (none)')

  console.log(
    `\n\nAMBIGUOUS — ${ambiguous.length}. Nothing is linked. Each of these is fixed by ONE alias\n` +
      `at /admin/ingest, which also fixes every future note shaped the same way.\n`,
  )
  console.log(ambiguous.join('\n') || '  (none)')

  console.log(
    `\n\nMATCHED NOTHING — ${nothing.length}. The nightly job stores the note id and date for\n` +
      `these and NOTHING else — no title, no summary. Read them here, decide which are\n` +
      `business and want an alias, and leave the personal ones alone.\n`,
  )
  console.log(nothing.join('\n') || '  (none)')

  console.log(
    `\n\n${clean.length} clean / ${ambiguous.length} ambiguous / ${nothing.length} nothing` +
      `  —  of ${notes.length} notes. Nothing was written.\n`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
