import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '@/lib/database.types'
import { supabaseAnonKey, supabaseUrl } from '@/lib/env'

/** Supabase client for use inside browser ("use client") components. */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey())
}
