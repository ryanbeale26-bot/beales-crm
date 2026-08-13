'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: '◈' },
  { label: 'Accounts', href: '/accounts', icon: '◇' },
  { label: 'Buildings', href: '/buildings', icon: '▤' },
  { label: 'Contacts', href: '/contacts', icon: '☺' },
  { label: 'Employees', href: '/employees', icon: '⚑' },
]

const LATER = ['Opportunities', 'Activity', 'Projects', 'Reports']

export function AppShell({
  displayName,
  initial,
  children,
}: {
  displayName: string
  initial: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      {/* Dimmer behind the mobile drawer */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
        />
      )}

      <aside
        className={cn(
          'bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r',
          'transition-transform duration-150 md:sticky md:top-0 md:h-screen md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="bg-foreground/85 text-background flex size-5 items-center justify-center rounded-[3px] text-[11px] font-semibold">
            B
          </div>
          <span className="text-foreground truncate text-sm font-medium">Beale&rsquo;s CRM</span>
        </div>

        {/* Tapping any link closes the mobile drawer, so it never covers the
            page you just asked for. */}
        <nav className="flex-1 overflow-y-auto px-2 pb-3" onClick={() => setOpen(false)}>
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'row-hover mb-px flex items-center gap-2 rounded-[3px] px-2 py-1 text-sm',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground',
                )}
              >
                <span className="w-4 shrink-0 text-center opacity-60">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}

          <p className="text-sidebar-foreground/70 mt-5 mb-1 px-2 text-[11px] font-medium tracking-wide uppercase">
            Coming later
          </p>
          {LATER.map((label) => (
            <span
              key={label}
              title="Arrives in a later phase"
              className="text-sidebar-foreground/45 mb-px flex cursor-default items-center gap-2 rounded-[3px] px-2 py-1 text-sm"
            >
              <span className="w-4 shrink-0 text-center opacity-50">·</span>
              {label}
            </span>
          ))}
        </nav>

        <div className="border-sidebar-border border-t p-2">
          <div className="row-hover flex items-center gap-2 rounded-[3px] px-2 py-1.5">
            <div className="bg-foreground/10 text-foreground/70 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
              {initial}
            </div>
            <span className="text-foreground/80 flex-1 truncate text-sm">{displayName}</span>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="row-hover text-sidebar-foreground w-full rounded-[3px] px-2 py-1 text-left text-sm"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/85 sticky top-0 z-20 flex h-11 items-center gap-2 px-3 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="row-hover -ml-1 rounded-[3px] p-1.5 text-base md:hidden"
          >
            ☰
          </button>
          <span className="text-muted-foreground truncate text-sm md:hidden">Beale&rsquo;s CRM</span>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-6 pt-2 pb-24 md:px-12">{children}</main>
      </div>
    </div>
  )
}
