/**
 * Reads the environment variables the app needs, and fails with a plain-English
 * message if one is missing — rather than a confusing crash deep inside Supabase.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `Copy .env.local.example to .env.local and fill in the values from ` +
        `your Supabase project (Project Settings -> API), then restart "npm run dev".`,
    )
  }
  return value
}

/**
 * True when Supabase is configured. Used by the middleware to show the /setup
 * page instead of crashing on a fresh clone with no .env.local yet.
 */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  )
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function supabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * The login the nightly ingest uses.
 *
 * This is a real Supabase account — a profile flagged `is_service` — not the
 * service role key. That is deliberate, and the reasoning is written out in
 * .env.local.example: the rule this project follows is that the deployed app
 * can never do more than a signed-in member can do. A leaked password here
 * gives away one member account, which is bad; the service role key would give
 * away every row in the database with RLS switched off, which is unrecoverable.
 * It also means every row the job writes carries a real changed_by in
 * audit_log, instead of nobody.
 */
export function ingestCredentials(): { email: string; password: string } {
  return {
    email: required('INGEST_USER_EMAIL', process.env.INGEST_USER_EMAIL),
    password: required('INGEST_USER_PASSWORD', process.env.INGEST_USER_PASSWORD),
  }
}

/** The shared secret Vercel Cron sends in its Authorization header. */
export function cronSecret(): string {
  return required('CRON_SECRET', process.env.CRON_SECRET)
}

/** True when the ingest is configured at all. Lets the admin screen say "not
 *  set up yet" rather than throwing on a machine that has never had the keys. */
export function hasIngestEnv(): boolean {
  return Boolean(
    process.env.INGEST_USER_EMAIL?.trim() &&
      process.env.INGEST_USER_PASSWORD?.trim() &&
      process.env.CRON_SECRET?.trim(),
  )
}

/**
 * The Granola personal API key.
 *
 * A personal key, not a workspace key, and the difference is not cosmetic: a
 * workspace key structurally cannot read private notes, and it fails by
 * returning 200 with four notes from a Team Space rather than by erroring. A
 * plausible-looking wrong answer is the worst failure mode there is, so if this
 * ever reads only a handful of notes, suspect the key before the code.
 */
export function granolaApiKey(): string {
  return required('GRANOLA_API_KEY', process.env.GRANOLA_API_KEY)
}

/** True when Granola is configured. Lets the nightly run skip the source
 *  quietly on a machine that has never had the key, rather than throwing and
 *  taking the whole run down with it. */
export function hasGranolaEnv(): boolean {
  return Boolean(process.env.GRANOLA_API_KEY?.trim())
}

/**
 * Microsoft Graph — one app registration, application permissions Mail.Read
 * and Calendars.Read.
 *
 * The thing that actually keeps this safe is NOT here. Application permissions
 * are tenant-wide: without the ApplicationAccessPolicy in Exchange Online this
 * client id can read every mailbox in the company. `.env.local.example` carries
 * the argument and the two commands that prove it.
 *
 * Copy the secret VALUE, not the Secret ID — Entra shows both, the value is
 * visible only immediately after creation, and a Secret ID here fails
 * authentication with an error that does not say so.
 */
export function graphCredentials(): {
  tenantId: string
  clientId: string
  clientSecret: string
} {
  return {
    tenantId: required('GRAPH_TENANT_ID', process.env.GRAPH_TENANT_ID),
    clientId: required('GRAPH_CLIENT_ID', process.env.GRAPH_CLIENT_ID),
    clientSecret: required('GRAPH_CLIENT_SECRET', process.env.GRAPH_CLIENT_SECRET),
  }
}

/** True when all three are set. Same reason as hasGranolaEnv(): a machine
 *  without the credentials skips the source rather than taking the run down. */
export function hasGraphEnv(): boolean {
  return Boolean(
    process.env.GRAPH_TENANT_ID?.trim() &&
      process.env.GRAPH_CLIENT_ID?.trim() &&
      process.env.GRAPH_CLIENT_SECRET?.trim(),
  )
}

/**
 * Where this app is reachable. Used to build the magic-link redirect, so
 * getting it wrong means every sign-in link points at the wrong place.
 *
 * Only ever called from a 'use server' file, which is what lets the middle
 * branch work: `VERCEL_PROJECT_PRODUCTION_URL` is a plain server variable
 * (no NEXT_PUBLIC_ prefix), set automatically on every Vercel deployment. It
 * saves setting the domain by hand, which is a chicken-and-egg — you cannot
 * know the domain until after the first deploy — and it always resolves to the
 * production domain, so a magic link sent from a preview build still lands
 * somewhere real rather than on a throwaway deployment URL.
 *
 * Set NEXT_PUBLIC_SITE_URL to override, e.g. once there is a custom domain.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`

  return 'http://localhost:3000'
}

/**
 * The commit this deployment was built from, or null when there is no
 * deployment to name — which is every local run.
 *
 * Written after a real incident on 2026-08-21. The recurring-meeting collapse
 * was committed on the 20th and pushed on the 21st, and the nightly run in
 * between wrote four next steps from one weekly series. Nothing anywhere in the
 * app could answer "is the fix I wrote yesterday actually live?", so the session
 * that found it started by suspecting Microsoft Graph. Vercel builds from `main`
 * on push, so a commit that is merely committed is a commit that is not running.
 *
 * `VERCEL_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_MESSAGE` are plain server
 * variables (no NEXT_PUBLIC_ prefix), set automatically on every deployment —
 * the same mechanism siteUrl() leans on for VERCEL_PROJECT_PRODUCTION_URL. The
 * message is the full commit body, so only its first line is worth showing.
 */
export function deployedCommit(): { sha: string; subject: string | null } | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (!sha) return null

  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE?.trim()
  return {
    sha: sha.slice(0, 7),
    subject: message ? (message.split('\n')[0]?.trim() ?? null) : null,
  }
}
