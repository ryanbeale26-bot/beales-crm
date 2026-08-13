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
