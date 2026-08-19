'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FormError } from '@/components/form-field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

/**
 * Changing your OWN password, on your own session.
 *
 * This is the one account job the app can do for itself. Creating an account
 * and resetting somebody else's password both need the service role key, which
 * bypasses every RLS policy and is deliberately not deployed — those stay
 * terminal jobs, and /settings/people prints the commands.
 *
 * The current password is asked for and verified first. Without it, an
 * unattended open laptop is enough to lock somebody out of their own account.
 */

/** Supabase's own floor is 6. These five accounts can read every contract value
 *  and pay rate in the business, so this asks for more — the same number
 *  `scripts/set-password.mjs` asks for, for the same reason. */
const MIN_LENGTH = 12

export function PasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    setDone(false)

    if (next.length < MIN_LENGTH) {
      setError(`Make the new password at least ${MIN_LENGTH} characters.`)
      return
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    if (next === current) {
      setError('That is the password you already have.')
      return
    }

    setPending(true)
    const supabase = createClient()

    // Prove it is you before changing anything. Signing in as yourself with
    // your own current password refreshes the session you are already on, so a
    // wrong answer here costs nothing but the message.
    const check = await supabase.auth.signInWithPassword({ email, password: current })
    if (check.error) {
      setPending(false)
      setError('That is not your current password.')
      return
    }

    const update = await supabase.auth.updateUser({ password: next })
    setPending(false)
    if (update.error) {
      setError(update.error.message)
      return
    }

    setCurrent('')
    setNext('')
    setConfirm('')
    setDone(true)
  }

  if (!email) {
    return (
      <p className="text-muted-foreground text-sm">
        Your profile has no email address on it, so the password cannot be changed here.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      {/* Hidden, but present: password managers need the account this form is
          about, and there is no visible email field on this page. */}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />

      <Field label="Current password" htmlFor="current_password">
        <Input
          id="current_password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>

      <Field
        label="New password"
        htmlFor="new_password"
        hint={`At least ${MIN_LENGTH} characters.`}
      >
        <Input
          id="new_password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>

      <Field label="New password again" htmlFor="confirm_password">
        <Input
          id="confirm_password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      <FormError message={error} />

      {done && (
        <p role="status" className="bg-muted text-foreground rounded-[3px] px-3 py-2 text-sm">
          Changed. Use the new one next time you sign in.
        </p>
      )}

      <Button type="submit" disabled={pending || !current || !next || !confirm}>
        {pending ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  )
}
