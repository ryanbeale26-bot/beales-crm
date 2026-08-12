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

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000'
}
