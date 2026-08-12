import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/**
 * Where magic links land. Supabase sends one of two shapes depending on the
 * email template in use, so handle both:
 *   - ?code=...                    (default templates, PKCE flow)
 *   - ?token_hash=...&type=magiclink   (customised templates)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(next, origin))
  }

  const failed = new URL('/login', origin)
  failed.searchParams.set('next', next)
  return NextResponse.redirect(failed)
}
