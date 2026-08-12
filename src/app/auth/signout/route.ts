import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/** POST only — a GET would let a stray link or prefetch sign someone out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.nextUrl.origin), {
    status: 303,
  })
}
