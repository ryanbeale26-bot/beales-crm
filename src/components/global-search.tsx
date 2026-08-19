'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog } from 'radix-ui'

import { search } from '@/app/(app)/search-action'
import { KIND_LABELS, MIN_TERM, hrefFor, type SearchHit } from '@/lib/search'
import { cn } from '@/lib/utils'

/**
 * Global search: ⌘K on a desktop, a button in the header on a phone.
 *
 * Radix Dialog rather than cmdk. cmdk would be a new direct dependency, next
 * to the umbrella `radix-ui` package this repo already installs, and we would
 * be re-styling all of it anyway — while Dialog gives the focus trap, the
 * scrim, Escape and the aria wiring for nothing. The body below is the
 * debounced input and list from quick-add.tsx, which is already proven on
 * these phones.
 *
 * Deliberately not a search over activities: 800 rows of free text would drown
 * the four things anybody actually navigates to.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [cursor, setCursor] = useState(0)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Every search is a round trip and they can land out of order, so a slow
  // answer for "Lib" must not overwrite a fast one for "Libbey".
  const latest = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  /** ⌘K / Ctrl-K anywhere, and "/" when you are not already typing. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((was) => !was)
        return
      }

      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }
      event.preventDefault()
      setOpen(true)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onTermChange = useCallback((value: string) => {
    setTerm(value)
    setCursor(0)
    if (timer.current) clearTimeout(timer.current)

    if (value.trim().length < MIN_TERM) {
      setHits([])
      setSearching(false)
      return
    }

    setSearching(true)
    timer.current = setTimeout(async () => {
      const ticket = (latest.current += 1)
      const found = await search(value)
      if (ticket !== latest.current) return
      setHits(found)
      setSearching(false)
    }, 180)
  }, [])

  // Radix only calls onOpenChange when Radix itself closes the dialog -- Escape,
  // the scrim, the Esc button. Closing it from our own code has to come through
  // here too, or the next ⌘K opens on the last search somebody ran.
  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      if (timer.current) clearTimeout(timer.current)
      setTerm('')
      setHits([])
      setSearching(false)
      setCursor(0)
    }
  }

  function go(hit: SearchHit) {
    onOpenChange(false)
    router.push(hrefFor(hit))
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!hits.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => (c + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => (c - 1 + hits.length) % hits.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[cursor]
      if (hit) go(hit)
    }
  }

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, hits])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Search"
          // Taller on a phone than the h-7 the rest of the app's buttons use:
          // this one gets tapped standing in a car park, and 28px is under
          // every thumb-target guideline there is.
          className="row-hover text-muted-foreground border-border flex h-9 items-center gap-2 rounded-[3px] border px-2.5 text-sm md:h-7 md:px-2"
        >
          <span aria-hidden>⌕</span>
          <span>Search</span>
          {/* The shortcut is a desktop promise; a phone has no ⌘ key. */}
          <kbd className="text-muted-foreground/70 hidden font-sans text-xs md:inline">⌘K</kbd>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'bg-background fixed z-50 flex flex-col overflow-hidden shadow-xl',
            // Phone: a full-height sheet, so the input sits under the thumb at
            // the top and the keyboard takes the bottom without covering the
            // results. Desktop: a palette near the top of the window.
            'inset-0 rounded-none',
            'sm:inset-auto sm:top-[12vh] sm:left-1/2 sm:max-h-[70vh] sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-xl',
          )}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>

          <div className="border-border flex items-center gap-2 border-b px-3">
            <span className="text-muted-foreground" aria-hidden>
              ⌕
            </span>
            <input
              autoFocus
              value={term}
              onChange={(e) => onTermChange(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search buildings, accounts, people, deals"
              aria-label="Search buildings, accounts, people and deals"
              className="h-12 flex-1 bg-transparent text-base outline-none"
            />
            <Dialog.Close
              aria-label="Close"
              className="row-hover text-muted-foreground rounded-[3px] px-2 py-1 text-sm"
            >
              Esc
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul ref={listRef} className="py-1">
              {hits.map((hit, i) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    data-active={i === cursor}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(hit)}
                    className={cn(
                      'flex w-full items-baseline gap-2 px-3 py-2.5 text-left text-sm',
                      i === cursor ? 'bg-hover' : 'row-hover',
                    )}
                  >
                    <span className="truncate font-medium">{hit.label}</span>
                    {hit.sublabel && (
                      <span className="text-muted-foreground truncate">{hit.sublabel}</span>
                    )}
                    <span className="text-muted-foreground/70 ml-auto shrink-0 text-xs">
                      {KIND_LABELS[hit.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Never a blank box: say what it wants, or what to try instead. */}
            {!hits.length && (
              <p className="text-muted-foreground px-3 py-3 text-sm">
                {term.trim().length < MIN_TERM
                  ? 'Type at least two letters — a building, an account, a person or a deal.'
                  : searching
                    ? 'Searching…'
                    : `Nothing matches “${term.trim()}”. Try a street number, or the account name.`}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
