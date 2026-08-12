'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { siteUrl } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

export type AuthState = { error?: string; notice?: string }

/**
 * Only allow redirects to paths inside this app. Without this check, a crafted
 * ?next=https://evil.example link could bounce someone off-site after login.
 */
function safeNext(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(String(formData.get('next') ?? '/dashboard'))

  if (!email || !password) {
    return { error: 'Enter your email and your password.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Deliberately vague: don't reveal which addresses have accounts.
    return { error: 'That email and password didn’t match. Try again.' }
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

export async function sendMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const next = safeNext(String(formData.get('next') ?? '/dashboard'))

  if (!email) {
    return { error: 'Enter your email address first.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Invite-only: never create an account from a login attempt.
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) {
    return { error: 'Could not send the link. Check the address and try again.' }
  }

  // Same message whether or not the address exists — see note above.
  return { notice: 'Check your email for a sign-in link. It expires in an hour.' }
}
