import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Accounts', href: '/accounts' },
  { label: 'Buildings', href: '/buildings' },
  { label: 'Contacts', href: '/contacts' },
  { label: 'Employees', href: '/employees' },
]

/** Sections that arrive in later phases. Shown greyed so the shape is visible. */
const COMING_SOON = ['Opportunities', 'Activity', 'Projects', 'Reports']

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The middleware already guards this, but a page should never render
  // signed-out content if that guard is ever misconfigured.
  if (!user) redirect('/login')

  // profiles may not exist yet on a database with no migrations applied.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const displayName = profile?.full_name || user.email || 'Signed in'

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-slate-900">Beale&rsquo;s CRM</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{displayName}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-muted rounded-md px-2 py-1 font-medium whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
          {COMING_SOON.map((item) => (
            <span
              key={item}
              title="Coming in a later phase"
              className="px-2 py-1 whitespace-nowrap text-slate-400"
            >
              {item}
            </span>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
