'use client'

import './globals.css'

/**
 * The last boundary.
 *
 * `(app)/error.tsx` covers every page inside the group — including /settings,
 * /review and /admin/*, by nesting — but it does NOT cover `(app)/layout.tsx`
 * itself, which runs three queries on every navigation. Nor does it cover the
 * root layout, or /login and /setup, which sit outside the group. Only this
 * file catches those, and it has to render <html> and <body> itself because
 * the layout that would have provided them is the thing that failed.
 *
 * It deliberately does NOT import Montserrat. That Google Font import in the
 * root layout is the reason `next build` is pinned to --webpack, and a second
 * copy of it is a second way to break a cold build for a screen almost nobody
 * will ever see. The body stack is Arial-first anyway, so this still looks
 * like the app.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <h1 className="text-lg font-semibold">Beale&rsquo;s CRM could not start</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Nothing was lost. Try again, and if it keeps happening send the message below.
          </p>
          <pre className="bg-muted mt-4 overflow-x-auto rounded-lg p-3 text-left text-xs">
            {error.message}
            {error.digest && `\n\nReference: ${error.digest}`}
          </pre>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="bg-primary text-primary-foreground h-8 rounded-[3px] px-3 text-sm font-medium"
            >
              Try again
            </button>
            <a
              href="/dashboard"
              className="border-border h-8 rounded-[3px] border px-3 text-sm leading-8"
            >
              Back to dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
