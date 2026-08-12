/**
 * Shown when the app has no Supabase credentials yet. The middleware rewrites
 * every request here rather than crashing, so a fresh clone gives instructions
 * instead of a stack trace.
 */
export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold tracking-wide text-blue-700 uppercase">
        Beale&rsquo;s CRM
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Almost there — Supabase isn&rsquo;t connected yet
      </h1>
      <p className="mt-3 text-slate-600">
        The app is running, but it has no database credentials. Three steps:
      </p>

      <ol className="mt-6 space-y-4 text-slate-700">
        <li className="rounded-lg border border-slate-200 bg-white p-4">
          <span className="font-medium text-slate-900">1. Copy the example file</span>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-sm text-slate-100">
            cp .env.local.example .env.local
          </pre>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white p-4">
          <span className="font-medium text-slate-900">
            2. Fill in the values from Supabase
          </span>
          <p className="mt-1 text-sm">
            In your Supabase project, go to <em>Project Settings &rarr; API</em> and copy the
            Project URL and the <code className="rounded bg-slate-100 px-1">anon</code> key
            into <code className="rounded bg-slate-100 px-1">.env.local</code>.
          </p>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white p-4">
          <span className="font-medium text-slate-900">3. Restart the dev server</span>
          <p className="mt-1 text-sm">
            Stop <code className="rounded bg-slate-100 px-1">npm run dev</code> with Ctrl-C and
            start it again. Environment variables are only read at startup.
          </p>
        </li>
      </ol>
    </main>
  )
}
