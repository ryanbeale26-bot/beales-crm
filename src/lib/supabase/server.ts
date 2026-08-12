import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from '@/lib/database.types'
import { supabaseAnonKey, supabaseUrl } from '@/lib/env'

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Always create a fresh one per request — never share it across requests, or
 * one person's session could leak into another's page.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components are not allowed to write cookies. That's fine:
          // the middleware refreshes the session cookie on every request.
        }
      },
    },
  })
}
