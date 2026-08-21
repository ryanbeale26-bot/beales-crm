/**
 * What Microsoft Graph actually returns. WRITES NOTHING, ANYWHERE.
 *
 *   npm run graph:probe             # shapes only — safe to share
 *   npm run graph:probe -- --raw    # full JSON, for your eyes only
 *   npm run graph:probe -- --selftest  # redaction, times, tiers, recurrence. No network.
 *
 * This is the script that has to run before a line of the mail parser is
 * written, for the same reason the Granola probe came before the title matcher:
 * three documented facts about that API turned out to be wrong, and each would
 * have been a day lost if it had been discovered through a parser instead.
 *
 * WHY THERE ARE TWO OUTPUT MODES. The samples needed to write the parser are
 * SHAPES — which fields exist, what type they are, how they nest. None of that
 * requires the contents of anybody's mail. So the default output redacts every
 * value: addresses keep their domain and lose their local part, subjects and
 * bodies become lengths. That report can be pasted into a chat, a ticket or a
 * commit message without leaking a client's business or a colleague's private
 * appointment. `--raw` prints everything and is meant to stay on your screen.
 *
 * It also proves, in one command, the four things that have to be true before
 * any of this works: the tenant id, the client id, the secret, and the admin
 * consent. And it repeats Mike's PowerShell access-policy test from the code
 * that will actually run at 3am — granted for one mailbox, denied for another.
 */

import { collapseRecurringSeries, graphTime } from '@/lib/ingest/graph'
import { matchParticipants, type Directory } from '@/lib/ingest/match'
import type { Participant } from '@/lib/ingest'
import { fetchMailboxes } from '@/lib/ingest/mailboxes'

import { readEnvLocal, requireEnv, signInAsIngest } from './granola-env'

const RAW = process.argv.includes('--raw')
const SELFTEST = process.argv.includes('--selftest')
const GRAPH = 'https://graph.microsoft.com/v1.0'

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** sam@acme.com -> s…@acme.com. The domain is the half that matters for
 *  matching and is the half that is not personal. */
function redactAddress(address: string): string {
  const at = address.indexOf('@')
  if (at < 1) return '…'
  return `${address[0]}…${address.slice(at)}`
}

/** A string becomes its length and its shape, never its content. */
function redactString(value: string): string {
  if (value === '') return '"" (empty)'
  if (/^<.+@.+>$/.test(value)) return `"<…@…>" (${value.length} chars, message-id shaped)`
  if (/@/.test(value) && !value.includes(' ')) return `"${redactAddress(value)}"`
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return `"${value}" (ISO timestamp)`
  return `${value.length} chars`
}

function describe(value: unknown, depth = 0): string {
  const pad = '  '.repeat(depth + 1)
  if (value === null) return 'null'
  if (value === undefined) return 'absent'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (typeof value === 'string') return RAW ? JSON.stringify(value) : redactString(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[] (empty)'
    return `[${value.length}] e.g.\n${pad}${describe(value[0], depth + 1).replace(/\n/g, `\n${pad}`)}`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('@'))
      .map(([k, v]) => `${pad}${k}: ${describe(v, depth + 1)}`)
    return `{\n${entries.join('\n')}\n${'  '.repeat(depth)}}`
  }
  return typeof value
}

function report(label: string, item: Record<string, unknown>): void {
  console.log(`\n  ${label}`)
  if (RAW) {
    console.log(JSON.stringify(item, null, 2).split('\n').map((l) => `    ${l}`).join('\n'))
    return
  }
  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith('@')) continue
    console.log(`    ${key}: ${describe(value, 2)}`)
  }
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

/** Nothing here should take twenty seconds. Without this a stalled connection
 *  hangs the script with no output at all, which reads as "it did nothing". */
const TIMEOUT_MS = 20_000

async function getToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })

  const body = (await response.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }

  if (!response.ok || !body.access_token) {
    // The whole error, because a bare status code here wastes an afternoon.
    // AADSTS7000215 = wrong secret; AADSTS700016 = wrong client id;
    // AADSTS90002 = wrong tenant id.
    console.error(`\n  Could not get a token (HTTP ${response.status}).`)
    console.error(`  ${body.error ?? 'unknown'}: ${body.error_description ?? ''}`)
    process.exit(1)
  }
  return body.access_token
}

type GraphResult = { status: number; items: Record<string, unknown>[]; error: string | null }

async function graphGet(token: string, path: string): Promise<GraphResult> {
  let response: Response
  try {
    response = await fetch(`${GRAPH}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    return { status: 0, items: [], error: `no response after ${TIMEOUT_MS / 1000}s (${message})` }
  }

  if (!response.ok) {
    const text = await response.text()
    let message = text.slice(0, 300)
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message
    } catch {
      // Not JSON; the truncated body is more useful than nothing.
    }
    return { status: response.status, items: [], error: message }
  }

  const body = (await response.json()) as { value?: Record<string, unknown>[] }
  return { status: response.status, items: body.value ?? [], error: null }
}

// ---------------------------------------------------------------------------

const MESSAGE_FIELDS = [
  'internetMessageId',
  'conversationId',
  'subject',
  'bodyPreview',
  'receivedDateTime',
  'sentDateTime',
  'from',
  'toRecipients',
  'ccRecipients',
  'isDraft',
].join(',')

const EVENT_FIELDS = [
  'iCalUId',
  'subject',
  'bodyPreview',
  'start',
  'end',
  'isAllDay',
  'isCancelled',
  'organizer',
  'attendees',
  'type',
  'seriesMasterId',
  'originalStart',
  'webLink',
].join(',')

/**
 * The redaction rules, pinned. No network, no database, no credentials — so
 * this runs anywhere, including before anybody has set Graph up, and it is what
 * proves the "safe to share" promise is actually kept.
 */
function selftest(): number {
  let failures = 0
  let total = 0
  const check = (name: string, ok: boolean, detail = '') => {
    total += 1
    console.log(ok ? `  ok    ${name}` : `  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures += 1
  }

  check('an address keeps its domain and loses the person', redactAddress('sam@acme.com') === 's…@acme.com')
  check('a malformed address gives nothing away', redactAddress('nonsense') === '…')
  check('an address with no local part gives nothing away', redactAddress('@acme.com') === '…')

  const subject = redactString('Q3 pricing for the Dana-Farber renewal')
  check('a subject becomes a length, never words', subject === '38 chars', subject)

  const messageId = redactString('<AS8P123MB4567ABCDEF@eurprd04.prod.outlook.com>')
  check(
    'a message id is recognised without being printed',
    messageId.includes('message-id shaped') && !messageId.includes('AS8P'),
    messageId,
  )

  const stamp = redactString('2026-08-19T14:05:00Z')
  check('a timestamp is kept in full, being harmless and load-bearing', stamp.includes('2026-08-19T14:05:00Z'))

  const nested = describe({ emailAddress: { address: 'jo@client.test', name: 'Jo Bloggs' } })
  check('a nested address is redacted too', nested.includes('j…@client.test') && !nested.includes('jo@'), nested)
  check('and so is the display name', !nested.includes('Bloggs'), nested)

  const body = describe({ bodyPreview: 'Hi Ryan, following up on the invoice for' })
  check('a body preview never prints', body.includes('chars') && !body.includes('invoice'), body)

  check('an empty string says so rather than looking absent', redactString('') === '"" (empty)')
  check('an absent field is distinguishable from a null one', describe(undefined) === 'absent' && describe(null) === 'null')

  // --- The most dangerous line in graph.ts -----------------------------------
  // Graph sends a calendar time with the zone in a SIBLING field and no marker
  // on the string, so new Date() reads it as local. In Boston that is every
  // meeting four or five hours out, silently, for ever.
  console.log('')
  check(
    'a zone-less Graph time is read as UTC, not as local',
    graphTime('2026-08-06T15:00:00.0000000', 'UTC') === '2026-08-06T15:00:00.000Z',
    graphTime('2026-08-06T15:00:00.0000000', 'UTC'),
  )
  check(
    'seven fractional digits do not defeat it',
    graphTime('2026-08-11T13:30:45.1234567', 'UTC') === '2026-08-11T13:30:45.123Z',
    graphTime('2026-08-11T13:30:45.1234567', 'UTC'),
  )
  check(
    'a time that already carries Z is left alone',
    graphTime('2026-08-19T19:47:16Z') === '2026-08-19T19:47:16.000Z',
    graphTime('2026-08-19T19:47:16Z'),
  )
  check(
    'an explicit offset is honoured rather than overwritten',
    graphTime('2026-08-19T15:47:16-04:00') === '2026-08-19T19:47:16.000Z',
    graphTime('2026-08-19T15:47:16-04:00'),
  )
  check(
    'a non-UTC zone is refused rather than guessed at',
    (() => {
      try {
        graphTime('2026-08-06T15:00:00.0000000', 'Eastern Standard Time')
        return false
      } catch {
        return true
      }
    })(),
  )
  check(
    'nonsense is refused rather than becoming an Invalid Date',
    (() => {
      try {
        graphTime('not a time', 'UTC')
        return false
      } catch {
        return true
      }
    })(),
  )

  matchingChecks(check)
  recurrenceChecks(check)

  console.log(`\n${failures === 0 ? 'PASSED' : 'FAILED'} — ${total - failures}/${total} checks\n`)
  return failures
}

type Check = (name: string, ok: boolean, detail?: string) => void

/** Enough of a Directory to exercise the tiers. `phrases` and `targets` are
 *  title matching, which is Granola's business and not reachable from here. */
function directory(options: {
  contacts?: [string, string | null][]
  domains?: [string, string][]
  accountNames?: [string, string][]
  colleagues?: string[]
}): Directory {
  const contactsByEmail = new Map<string, { id: string; accountId: string | null }[]>()
  for (const [address, accountId] of options.contacts ?? []) {
    const existing = contactsByEmail.get(address) ?? []
    existing.push({ id: `contact-${address}`, accountId })
    contactsByEmail.set(address, existing)
  }

  return {
    contactsByEmail,
    accountByDomain: new Map(options.domains ?? []),
    accountNames: new Map(options.accountNames ?? []),
    colleaguesByEmail: new Map(
      (options.colleagues ?? []).map((address) => [address, { id: 'us', fullName: 'A Colleague' }]),
    ),
    phrases: [],
    targets: new Map(),
  }
}

const people = (...addresses: string[]): Participant[] =>
  addresses.map((address, index) => ({
    address,
    name: null,
    role: index === 0 ? 'from' : 'to',
  }))

/**
 * The tiers, and the bug that shipped in them.
 *
 * Until 2026-08-20 a contact with no `account_id` matched nothing at all — the
 * exact tier reduced its matches to a set of non-null account ids and required
 * exactly one, so an accountless contact contributed zero and the message went
 * to the strangers tray. 63 of 99 live contacts are accountless, and it was
 * doing this to a real contact in production every night.
 */
function matchingChecks(check: Check): void {
  console.log('\n  the confidence tiers')

  const withAccount = directory({
    contacts: [['jo@client.test', 'acct-1']],
    accountNames: [['acct-1', 'A Client']],
  })
  const one = matchParticipants(people('jo@client.test'), withAccount)
  check(
    'a contact WITH an account still links the account and the person',
    one?.confidence === 'exact' && one.accountId === 'acct-1' && one.contactId !== null,
    JSON.stringify(one),
  )

  const twoAtOne = directory({
    contacts: [
      ['jo@client.test', 'acct-1'],
      ['sam@client.test', 'acct-1'],
    ],
    accountNames: [['acct-1', 'A Client']],
  })
  const pair = matchParticipants(people('jo@client.test', 'sam@client.test'), twoAtOne)
  check(
    'two people at one company link the company and not one of them',
    pair?.accountId === 'acct-1' && pair.contactId === null,
    JSON.stringify(pair),
  )

  const twoAccounts = directory({
    contacts: [
      ['jo@client.test', 'acct-1'],
      ['sam@other.test', 'acct-2'],
    ],
  })
  check(
    'a broker introducing two clients links neither',
    matchParticipants(people('jo@client.test', 'sam@other.test'), twoAccounts) === null,
  )

  // --- the fix ---------------------------------------------------------------
  const accountless = directory({ contacts: [['brittany@bbm.test', null]] })
  const known = matchParticipants(people('brittany@bbm.test'), accountless)
  check(
    'a contact with NO account is still an exact match to that person',
    known?.confidence === 'exact' && known.contactId === 'contact-brittany@bbm.test',
    JSON.stringify(known),
  )
  check(
    '...and its account is null rather than invented',
    known?.accountId === null,
    JSON.stringify(known),
  )

  const twoAccountless = directory({
    contacts: [
      ['brittany@bbm.test', null],
      ['brendan@bealesllc.test', null],
    ],
  })
  check(
    'TWO accountless contacts is still nothing — picking one is the guess this refuses',
    matchParticipants(people('brendan@bealesllc.test', 'brittany@bbm.test'), twoAccountless) === null,
  )

  const accountlessAtMappedDomain = directory({
    contacts: [['jo@client.test', null]],
    domains: [['client.test', 'acct-1']],
    accountNames: [['acct-1', 'A Client']],
  })
  const enriched = matchParticipants(people('jo@client.test'), accountlessAtMappedDomain)
  check(
    'a mapped domain still wins, because an account is worth more than a person',
    enriched?.confidence === 'domain' && enriched.accountId === 'acct-1',
    JSON.stringify(enriched),
  )
  check(
    '...and it now carries the contact too, which it used to throw away',
    enriched?.contactId === 'contact-jo@client.test',
    JSON.stringify(enriched),
  )
  check(
    '...and stops claiming nobody on the message is a contact',
    !(enriched?.rationale ?? '').includes('Nobody on this message is a contact'),
    enriched?.rationale,
  )

  const domainOnly = directory({
    domains: [['client.test', 'acct-1']],
    accountNames: [['acct-1', 'A Client']],
  })
  const stranger = matchParticipants(people('new@client.test'), domainOnly)
  check(
    'a stranger at a mapped domain links the account and nobody',
    stranger?.confidence === 'domain' && stranger.contactId === null,
    JSON.stringify(stranger),
  )

  const mixed = directory({
    contacts: [
      ['jo@client.test', 'acct-1'],
      ['brittany@bbm.test', null],
    ],
    accountNames: [['acct-1', 'A Client']],
  })
  check(
    'one contact with an account beside one without still links the account',
    matchParticipants(people('jo@client.test', 'brittany@bbm.test'), mixed)?.accountId === 'acct-1',
  )

  const ours = directory({
    contacts: [['ryan@bealesllc.test', null]],
    colleagues: ['ryan@bealesllc.test'],
  })
  check(
    'one of our own addresses is never a client match, contact row or not',
    matchParticipants(people('ryan@bealesllc.test'), ours) === null,
  )
}

/**
 * Recurring meetings, measured 2026-08-20: 40 occurrences across 11 series in a
 * single nightly window, 35 of them still ahead. Without collapsing, the first
 * night matching worked would have written 35 next steps for 11 meetings.
 */
function recurrenceChecks(check: Check): void {
  console.log('\n  recurring series')

  const NOW = Date.parse('2026-08-20T12:00:00Z')
  const at = (when: string, series: string | null, id: string) => ({
    id,
    seriesMasterId: series,
    start: { dateTime: `${when}.0000000`, timeZone: 'UTC' },
  })

  const weekly = collapseRecurringSeries(
    [
      at('2026-08-27T11:00:00', 'series-a', 'a3'),
      at('2026-09-03T11:00:00', 'series-a', 'a4'),
      at('2026-08-20T15:00:00', 'series-a', 'a2'),
    ],
    NOW,
  )
  check(
    'five weeks of one meeting become the next one',
    weekly.length === 1 && weekly[0].id === 'a2',
    JSON.stringify(weekly.map((e) => e.id)),
  )

  const past = collapseRecurringSeries(
    [
      at('2026-08-19T11:00:00', 'series-a', 'p1'),
      at('2026-08-20T09:00:00', 'series-a', 'p2'),
      at('2026-08-27T11:00:00', 'series-a', 'f1'),
    ],
    NOW,
  )
  check(
    'meetings that already happened are all kept — each one really did happen',
    past.length === 3,
    JSON.stringify(past.map((e) => e.id)),
  )

  const single = collapseRecurringSeries(
    [at('2026-08-24T12:00:00', null, 's1'), at('2026-09-01T12:00:00', null, 's2')],
    NOW,
  )
  check('a one-off meeting has no series and is never touched', single.length === 2)

  const two = collapseRecurringSeries(
    [
      at('2026-08-27T11:00:00', 'series-a', 'a1'),
      at('2026-09-03T11:00:00', 'series-a', 'a2'),
      at('2026-08-25T10:00:00', 'series-b', 'b1'),
      at('2026-09-01T10:00:00', 'series-b', 'b2'),
    ],
    NOW,
  )
  check(
    'each series keeps its own next meeting',
    two.length === 2 && two.some((e) => e.id === 'a1') && two.some((e) => e.id === 'b1'),
    JSON.stringify(two.map((e) => e.id)),
  )

  const unreadable = collapseRecurringSeries(
    [{ id: 'x', seriesMasterId: 'series-a', start: { dateTime: 'nonsense', timeZone: 'UTC' } }],
    NOW,
  )
  check(
    'a meeting whose clock cannot be read is kept, not silently dropped',
    unreadable.length === 1,
  )

  // The order Graph returns them in must not decide which one survives.
  const shuffled = collapseRecurringSeries(
    [
      at('2026-09-10T11:00:00', 'series-a', 'late'),
      at('2026-08-21T11:00:00', 'series-a', 'soon'),
      at('2026-09-03T11:00:00', 'series-a', 'mid'),
    ],
    NOW,
  )
  check(
    'the earliest wins whatever order Graph listed them in',
    shuffled.length === 1 && shuffled[0].id === 'soon',
    JSON.stringify(shuffled.map((e) => e.id)),
  )
}

async function main() {
  if (SELFTEST) {
    console.log('\nRedaction self-test — no network, no database, no credentials\n')
    process.exit(selftest() === 0 ? 0 : 1)
  }

  const env = readEnvLocal()
  const tenantId = requireEnv(env, 'GRAPH_TENANT_ID')
  const clientId = requireEnv(env, 'GRAPH_CLIENT_ID')
  const clientSecret = requireEnv(env, 'GRAPH_CLIENT_SECRET')

  console.log(
    RAW
      ? '\nRAW MODE — real content. Do not paste this anywhere.\n'
      : '\nShapes only, every value redacted. This output is safe to share.\n',
  )

  // --- 1. Does the app registration work at all? ----------------------------
  console.log('1. Token')
  const token = await getToken(tenantId, clientId, clientSecret)
  console.log(`  ok    got an access token (${token.length} chars)`)
  console.log('        tenant id, client id, secret and admin consent are all good')

  // --- 2. Whose mailboxes can it actually reach? ----------------------------
  // The same question Mike answered in PowerShell, asked by the code that will
  // run at 3am. Application permissions are tenant-wide; the access policy is
  // the only thing narrowing them, and this is where you see it working.
  console.log('\n2. Mailbox access — the policy, tested from here')
  process.stdout.write('  signing in as the ingest profile … ')
  const supabase = await signInAsIngest(env)
  console.log('ok')
  const mailboxes = await fetchMailboxes(supabase)

  if (mailboxes.length === 0) {
    console.error('  No mailboxes to try. Are there active, non-service profiles?')
    process.exit(1)
  }

  console.log(`  ${mailboxes.length} to try: ${mailboxes.map((m) => m.address).join(', ')}\n`)

  const reachable: string[] = []
  for (const mailbox of mailboxes) {
    // Printed BEFORE the request, not after. A line that appears and then stops
    // tells you exactly which call stalled; a line printed only on success
    // tells you nothing at all, which is how the first run of this looked.
    process.stdout.write(`  trying ${mailbox.address} … `)
    const result = await graphGet(token, `/users/${encodeURIComponent(mailbox.address)}/messages?$top=1&$select=id`)
    if (result.status === 200) {
      reachable.push(mailbox.address)
      console.log(`GRANTED  (${mailbox.fullName})`)
    } else if (result.status === 403) {
      console.log('denied — not in the ingest group, which is correct')
    } else if (result.status === 404) {
      console.log('no mailbox at that address')
    } else {
      console.log(`ERROR ${result.status}: ${result.error}`)
    }
  }

  if (reachable.length === 0) {
    console.error('\n  Nothing is reachable. The access policy may not have propagated yet —')
    console.error('  it can take over an hour. Try again before assuming it is wrong.')
    process.exit(1)
  }
  if (reachable.length > 1) {
    console.log('\n  NOTE: more than one mailbox is readable. Expected while the group')
    console.log('  holds one person — check that this is deliberate.')
  }

  const mailbox = reachable[0]

  // --- 3. What a message actually looks like --------------------------------
  console.log(`\n3. Messages from ${mailbox}`)
  const messages = await graphGet(
    token,
    `/users/${encodeURIComponent(mailbox)}/messages?$top=3&$select=${MESSAGE_FIELDS}&$orderby=receivedDateTime%20desc`,
  )
  if (messages.error) {
    console.log(`  ERROR ${messages.status}: ${messages.error}`)
  } else if (messages.items.length === 0) {
    console.log('  none in the mailbox')
  } else {
    messages.items.forEach((m, i) => report(`message ${i + 1}`, m))
  }

  // --- 4. What an event actually looks like ---------------------------------
  // calendarView rather than /events, because it expands a recurring series
  // into its occurrences — which is the shape the schema's external_id rule
  // (iCalUId + '/' + originalStart) exists for.
  const from = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const to = new Date(Date.now() + 30 * 86_400_000).toISOString()
  console.log(`\n4. Calendar for ${mailbox} (14 days back, 30 forward)`)
  // $top was 5 until 2026-08-20, and five was enough to reach the WRONG answer:
  // calendarView returns events in start order, the first five in this tenant
  // happened to be one-offs, and CLAUDE.md recorded on the strength of it that
  // every event in the tenant was a singleInstance. It is 40 occurrences across
  // 11 series. Read the whole window and COUNT it, then show a few shapes — a
  // sample answers "what does this look like", never "what is in here".
  const events = await graphGet(
    token,
    `/users/${encodeURIComponent(mailbox)}/calendarView?startDateTime=${from}&endDateTime=${to}&$top=200&$select=${EVENT_FIELDS}`,
  )
  if (events.error) {
    console.log(`  ERROR ${events.status}: ${events.error}`)
  } else if (events.items.length === 0) {
    console.log('  no events in that window')
  } else {
    const startsAt = (e: Record<string, unknown>): number | null => {
      const start = (e.start as { dateTime?: string; timeZone?: string } | undefined) ?? undefined
      if (!start?.dateTime) return null
      try {
        return new Date(graphTime(start.dateTime, start.timeZone)).getTime()
      } catch {
        return null
      }
    }
    const now = Date.now()
    const occurrences = events.items.filter(
      (e) => e.type === 'occurrence' || e.type === 'exception',
    )
    const series = new Set(
      occurrences.map((e) => String(e.seriesMasterId ?? '')).filter(Boolean),
    )
    const ahead = events.items.filter((e) => (startsAt(e) ?? 0) > now)
    const kept = collapseRecurringSeries(events.items, now).filter((e) => (startsAt(e) ?? 0) > now)

    console.log(
      `  ${events.items.length} events — ${occurrences.length} are occurrences of ` +
        `${series.size} recurring series, ${events.items.length - occurrences.length} are one-offs`,
    )
    console.log(
      `  ${ahead.length} still ahead; after collapsing each series to its next meeting, ` +
        `${kept.length} would be read as next steps`,
    )
    console.log('\n  the first few shapes:')
    events.items.slice(0, 5).forEach((e, i) => report(`event ${i + 1}`, e))
  }

  // --- 5. The question this whole probe was worth running for ---------------
  // CLAUDE.md assumed an Outlook meeting and a Granola note could be joined on
  // iCalUId. Phase 7c found Granola reporting a GOOGLE event id instead, which
  // makes that join impossible — but Granola's calendar_event also carries
  // scheduled_start_time, and both systems agree about when a meeting starts.
  //
  // This matters for deduplication, not for curiosity: without a join, one
  // meeting Ryan attends produces a calendar activity AND a note activity, and
  // "one email to several colleagues is one activity" stops being true for
  // meetings.
  console.log('\n5. Do Outlook events and Granola notes describe the same meetings?')

  const granolaKey = env.GRANOLA_API_KEY?.trim()
  const outlookStarts = new Map<string, string>()
  for (const event of events.items) {
    const start = (event.start as { dateTime?: string } | undefined)?.dateTime
    // Graph returns "2026-08-06T15:00:00.0000000" with NO zone marker and the
    // zone in a sibling field. Date.parse would read that as LOCAL time.
    if (start) outlookStarts.set(`${start.slice(0, 16)}Z`, String(event.iCalUId ?? ''))
  }

  if (!granolaKey) {
    console.log('  skipped — no GRANOLA_API_KEY')
  } else if (outlookStarts.size === 0) {
    console.log('  skipped — no Outlook events to compare')
  } else {
    // Says how long, because it fetches each note's detail at a throttled
    // 200ms and takes about ten seconds. Three runs of this were reported as
    // hangs before it admitted it was merely slow.
    console.log('  (this part takes about ten seconds)')
    process.stdout.write('  listing Granola notes … ')
    const { listGranolaNotes, fetchGranolaNote } = await import('@/lib/ingest/granola')
    const { notes } = await listGranolaNotes({
      apiKey: granolaKey,
      updatedAfter: from,
      deadline: Date.now() + 60_000,
    })
    console.log(`${notes.length} in the same window`)

    let matched = 0
    let withCalendar = 0
    for (const note of notes.slice(0, 8)) {
      process.stdout.write(`  note ${note.id.slice(0, 8)}… `)
      const detail = await fetchGranolaNote(note.id, granolaKey)
      const calendar = detail.calendar_event
      if (!calendar) {
        console.log('no calendar event attached')
        continue
      }
      withCalendar += 1
      const start = calendar.scheduled_start_time
      const key = start ? `${start.slice(0, 16)}Z` : null
      const hit = key ? outlookStarts.get(key) : undefined
      console.log(
        hit !== undefined
          ? `SAME START as an Outlook event (${key})`
          : `starts ${key ?? 'unknown'} — no Outlook event then`,
      )
      if (hit !== undefined) {
        matched += 1
        console.log(`      Granola calendar id: ${RAW ? calendar.calendar_event_id : `${String(calendar.calendar_event_id).slice(0, 10)}… (${String(calendar.calendar_event_id).length} chars)`}`)
        console.log(`      Outlook iCalUId    : ${RAW ? hit : `${hit.slice(0, 10)}… (${hit.length} chars)`}`)
        console.log(`      same id?           : ${calendar.calendar_event_id === hit ? 'YES' : 'NO — join on start time, not on id'}`)
      }
    }

    console.log(`\n  ${withCalendar} notes carry a calendar event; ${matched} start at the same moment as an Outlook event.`)
    if (matched === 0 && withCalendar > 0) {
      console.log('  No overlap. Granola may be watching a different calendar entirely.')
    }
  }

  console.log('\nNothing was written. Nothing was stored.\n')
}

main().catch((error) => {
  console.error('\nProbe failed:\n')
  console.error(error)
  process.exit(1)
})
