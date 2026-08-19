'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { GlobalSearch } from '@/components/global-search'
import { QuickAdd, type ActivityType } from '@/components/quick-add'
import { cn } from '@/lib/utils'

/**
 * The everyday screens. The admin ones deliberately are not here — Import and
 * Clean up used to be, where four of the five people saw them daily and got
 * "only an admin can do this" every time they clicked. They live behind
 * Settings now, reached from your name at the bottom.
 */
const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: '◈' },
  { label: 'Pipeline', href: '/opportunities', icon: '◆' },
  { label: 'Accounts', href: '/accounts', icon: '◇' },
  { label: 'Buildings', href: '/buildings', icon: '▤' },
  { label: 'Contacts', href: '/contacts', icon: '☺' },
  { label: 'Employees', href: '/employees', icon: '⚑' },
  { label: 'Activity', href: '/activity', icon: '≡' },
  // Review is everyday work for anyone, not an admin screen — but it only
  // appears when there is something in it. A permanent "Review 0" is the kind
  // of dead number this app argues against everywhere else.
  { label: 'Review', href: '/review', icon: '⌾', onlyWhenCounted: true },
  { label: 'Reports', href: '/reports', icon: '◱' },
]

const LATER = ['Projects']

/**
 * Pages that need the whole screen rather than the reading column.
 * Everything else is document-shaped and stays narrow on purpose — a line of
 * body text 1,400px wide is horrible to read. The pipeline board is the
 * exception: it is eight columns side by side, and squeezing it into 4xl showed
 * three of them.
 *
 * Exact matches only, so /opportunities/[id] stays a normal narrow page.
 */
const FULL_WIDTH = ['/opportunities']

export function AppShell({
  displayName,
  initial,
  activityTypes,
  reviewCount,
  children,
}: {
  displayName: string
  initial: string
  activityTypes: ActivityType[]
  /** Open suggestions waiting on /review. Zero hides the nav item entirely. */
  reviewCount: number
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const nav = NAV.filter((item) => !item.onlyWhenCounted || reviewCount > 0)

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
        {/* The guide's minimum digital size is 150px wide, and the sidebar is
            240px — so the logo runs full width with clear space around it
            rather than being shrunk into a corner. */}
        <div className="px-4 pt-4 pb-3">
          <Link href="/dashboard" className="block">
            <Image
              src="/beales-logo.png"
              alt="Beale's LLC"
              width={2000}
              height={1489}
              priority
              className="h-auto w-[150px]"
            />
          </Link>
        </div>

        {/* Tapping any link closes the mobile drawer, so it never covers the
            page you just asked for. */}
        <nav className="flex-1 overflow-y-auto px-2 pb-3" onClick={() => setOpen(false)}>
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'row-hover mb-px relative flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-sm',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                    : 'text-sidebar-foreground',
                )}
              >
                {/* Gold marks the current section — the guide's accent colour
                    doing accent work, never carrying text. */}
                {active && (
                  <span className="bg-brand-gold absolute top-1 bottom-1 -left-0.5 w-[3px] rounded-full" />
                )}
                <span className="w-4 shrink-0 text-center opacity-70">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.onlyWhenCounted && (
                  // Gold as a fill with navy on top, never gold text — 1.9:1
                  // against white fails every contrast bar.
                  <span className="bg-brand-gold text-primary shrink-0 rounded-full px-1.5 text-[11px] font-semibold">
                    {reviewCount}
                  </span>
                )}
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
          {/* Your name is the way into Settings — your account, and for an
              admin, everything administrative. It sits outside the <nav>
              above, so it needs its own handler to close the mobile drawer or
              it navigates behind it. */}
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={cn(
              'row-hover flex items-center gap-2 rounded-[3px] px-2 py-1.5',
              pathname.startsWith('/settings') && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
          >
            <div className="bg-foreground/10 text-foreground/70 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
              {initial}
            </div>
            <span className="text-foreground/80 flex-1 truncate text-sm">{displayName}</span>
            <span className="text-foreground/40 shrink-0 text-sm">›</span>
          </Link>
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

          {/* Search lives in the header rather than beside the Log button. The
              bottom-right corner belongs to Quick Add, and two floating circles
              would cost that button the thing that makes it work. The header is
              sticky, so this is one tap from anywhere, at any scroll position;
              once it is open the palette is a full-height sheet with the input
              on top, and the rest is thumb work. */}
          <div className="ml-auto">
            <GlobalSearch />
          </div>
        </header>

        <main
          className={cn(
            'mx-auto w-full flex-1 px-6 pt-2 pb-24',
            FULL_WIDTH.includes(pathname) ? 'max-w-none md:px-6' : 'max-w-4xl md:px-12',
          )}
        >
          {children}
        </main>
      </div>

      {/* On every screen, because the moment you have to navigate somewhere to
          log a call is the moment nobody logs the call. */}
      <QuickAdd activityTypes={activityTypes} />
    </div>
  )
}
