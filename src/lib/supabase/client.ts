import { createBrowserClient } from '@supabase/ssr'

import { supabaseAnonKey, supabaseUrl } from '@/lib/env'

/** Supabase client for use inside browser ("use client") components. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey())
}
