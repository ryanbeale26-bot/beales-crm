import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from '@/lib/env'

/** Paths that a signed-out person is allowed to reach. */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/setup' ||
    pathname.startsWith('/auth/') ||
    // The nightly ingest arrives from Vercel Cron with no cookie and no
    // session. It authenticates itself against CRON_SECRET inside the route,
    // and signs in to Supabase as the ingest profile from there. Bouncing it to
    // /login here would make the job fail every night with a 307 that nothing
    // reads and nothing reports — the worst kind of broken.
    pathname.startsWith('/api/cron/')
  )
}

/**
 * Runs on every request. Two jobs:
 *  1. Refresh the Supabase session cookie so logins don't expire mid-use.
 *  2. Bounce signed-out visitors to /login before any page content renders.
 */
export async function updateSession(request: NextRequest) {
  // Fresh clone with no .env.local yet — show setup instructions, don't crash.
  if (!hasSupabaseEnv()) {
    if (request.nextUrl.pathname === '/setup') return NextResponse.next({ request })
    return NextResponse.rewrite(new URL('/setup', request.url))
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        supabaseResponse = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options)
        }
      },
    },
  })

  // Do not remove: this is what actually refreshes an expiring session.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/setup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Must return this exact response object so refreshed cookies survive.
  return supabaseResponse
}
