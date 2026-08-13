'use client'

import { useActionState, useState } from 'react'

import { sendMagicLink, signInWithPassword, type AuthState } from './actions'

const empty: AuthState = {}

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInWithPassword,
    empty,
  )
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, empty)

  const state = mode === 'password' ? passwordState : linkState
  const pending = mode === 'password' ? passwordPending : linkPending

  return (
    <form
      action={mode === 'password' ? passwordAction : linkAction}
      className="space-y-4"
    >
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" className="text-muted-foreground block text-[13px]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="bg-muted focus-visible:ring-ring mt-1 h-9 w-full rounded-[3px] border-0 px-2.5 text-base outline-none focus-visible:ring-2"
        />
      </div>

      {mode === 'password' && (
        <div>
          <label htmlFor="password" className="text-muted-foreground block text-[13px]">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="bg-muted focus-visible:ring-ring mt-1 h-9 w-full rounded-[3px] border-0 px-2.5 text-base outline-none focus-visible:ring-2"
          />
        </div>
      )}

      {state.error && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-[3px] px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="bg-muted text-foreground rounded-[3px] px-3 py-2 text-sm">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground focus-visible:ring-ring h-9 w-full rounded-[3px] text-sm font-medium transition-[filter] duration-[20ms] hover:brightness-95 focus-visible:ring-2 disabled:opacity-60"
      >
        {pending
          ? 'Working…'
          : mode === 'password'
            ? 'Sign in'
            : 'Email me a sign-in link'}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === 'password' ? 'link' : 'password')}
        className="text-muted-foreground hover:text-foreground w-full text-center text-sm"
      >
        {mode === 'password'
          ? 'Forgot your password? Email me a link instead'
          : 'Use my password instead'}
      </button>
    </form>
  )
}
