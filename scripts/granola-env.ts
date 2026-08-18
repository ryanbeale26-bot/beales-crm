/**
 * The bits every Granola script needs: .env.local, and a signed-in client.
 *
 * Signs in as the ingest service profile, exactly as the nightly job does, so a
 * script can never do more than the job can — RLS applies identically and every
 * row written is attributed in audit_log. The service role key is not read here
 * and must not be: the rule this project follows is that nothing deployed or
 * scripted can do more than a signed-in member.
 */

import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'

export function readEnvLocal(): Record<string, string> {
  const path = new URL('../.env.local', import.meta.url).pathname
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
  )
}

export function requireEnv(env: Record<string, string>, name: string): string {
  const value = env[name]?.trim()
  if (!value) {
    console.error(`Missing ${name} in .env.local.`)
    process.exit(1)
  }
  return value
}

export async function signInAsIngest(
  env: Record<string, string>,
): Promise<SupabaseClient<Database>> {
  const supabase = createClient<Database>(
    requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { error } = await supabase.auth.signInWithPassword({
    email: requireEnv(env, 'INGEST_USER_EMAIL'),
    password: requireEnv(env, 'INGEST_USER_PASSWORD'),
  })

  if (error) {
    console.error(`Could not sign in as the ingest profile: ${error.message}`)
    process.exit(1)
  }

  return supabase
}

/** Read a line with the echo suppressed, so a password never appears on screen,
 *  in scrollback, or in a screen share. Lifted from scripts/set-password.mjs,
 *  which exists for the same reason: an argument lands in shell history and in
 *  `ps`. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    const rlAny = rl as unknown as { _writeToOutput: (chunk: string) => void }
    const write = rlAny._writeToOutput.bind(rl)
    rlAny._writeToOutput = (chunk: string) => {
      if (!muted) write(chunk)
    }
    rl.question(question, (value) => {
      rl.close()
      process.stdout.write('\n')
      resolve(value)
    })
    muted = true
  })
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (value) => {
      rl.close()
      resolve(value.trim())
    })
  })
}

/**
 * Read the two credentials, from a person at a keyboard or from a pipe.
 *
 * The hidden prompt needs a TTY to suppress the echo. When there is no TTY —
 * anything scripted — prompting would either hang or silently print the
 * password, so it reads two lines from stdin instead. That is ordinary CLI
 * behaviour and it is what makes this path testable at all.
 */
async function credentials(): Promise<{ email: string; password: string }> {
  if (!process.stdin.isTTY) {
    const piped = await new Promise<string>((resolve) => {
      let buffer = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (chunk) => (buffer += chunk))
      process.stdin.on('end', () => resolve(buffer))
    })
    const [email = '', password = ''] = piped.split('\n')
    return { email: email.trim(), password: password.trim() }
  }

  const email = await ask("Your Beale's CRM email (must be an admin): ")
  const password = await askHidden('Password (not shown): ')
  return { email, password }
}

/**
 * Sign in as a real admin, prompting for the details.
 *
 * The historical backfill opens an `import_batches` row, and that table is
 * admin-write — rightly, because an import is a decision a person takes and undo
 * is an admin action too. The ingest service profile is `role = field` and RLS
 * refuses it, which is the correct answer rather than an obstacle: a batch
 * attributed to a machine account would leave nobody accountable for a year of
 * history appearing in the app.
 *
 * Prompted rather than taken as an argument or added to .env.local: an argument
 * lands in shell history and in `ps`, and a fourth credential in a dotfile is a
 * credential nobody rotates.
 */
export async function signInAsAdmin(
  env: Record<string, string>,
): Promise<{ supabase: SupabaseClient<Database>; userId: string }> {
  const supabase = createClient<Database>(
    requireEnv(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { email, password } = await credentials()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    console.error(`Could not sign in: ${error?.message ?? 'no user came back'}`)
    process.exit(1)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    console.error(
      `${profile?.full_name ?? email} is not an admin, so cannot open an import batch — ` +
        'which is what makes this undoable. Ask Ryan to run it.',
    )
    process.exit(1)
  }

  console.log(`Signed in as ${profile.full_name}.\n`)
  return { supabase, userId: data.user.id }
}
