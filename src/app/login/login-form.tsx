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
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
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
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {mode === 'password' && (
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-800 focus:ring-2 focus:ring-blue-200 focus:outline-none disabled:opacity-60"
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
        className="w-full text-center text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900"
      >
        {mode === 'password'
          ? 'Forgot your password? Email me a link instead'
          : 'Use my password instead'}
      </button>
    </form>
  )
}
