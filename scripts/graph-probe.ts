/**
 * What Microsoft Graph actually returns. WRITES NOTHING, ANYWHERE.
 *
 *   npm run graph:probe             # shapes only — safe to share
 *   npm run graph:probe -- --raw    # full JSON, for your eyes only
 *   npm run graph:probe -- --selftest  # the redaction rules only. No network.
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
  const check = (name: string, ok: boolean, detail = '') => {
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

  console.log(`\n${failures === 0 ? 'PASSED' : 'FAILED'} — ${11 - failures}/11 checks\n`)
  return failures
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
  const events = await graphGet(
    token,
    `/users/${encodeURIComponent(mailbox)}/calendarView?startDateTime=${from}&endDateTime=${to}&$top=5&$select=${EVENT_FIELDS}`,
  )
  if (events.error) {
    console.log(`  ERROR ${events.status}: ${events.error}`)
  } else if (events.items.length === 0) {
    console.log('  no events in that window')
  } else {
    events.items.forEach((e, i) => report(`event ${i + 1}`, e))
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
