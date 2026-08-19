'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { logActivity } from '@/app/(app)/activity/actions'
import { searchPlaces } from '@/app/(app)/search-action'
import { type PlaceKind, type SearchHit } from '@/lib/search'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type ActivityType = { id: string; name: string }

/** Where the activity is being logged against, when opened from a record page. */
export type QuickAddContext = {
  kind: 'account' | 'building' | 'contact'
  id: string
  label: string
}

/**
 * The floating button and its sheet. Everything here serves one number: the
 * time from tapping the button to the activity being saved.
 *
 *   - Type is a row of chips, not a dropdown. One tap, no menu to open.
 *   - The subject field takes focus immediately, so you can start typing.
 *   - Where it happened is one search box across accounts, buildings and
 *     contacts, prefilled when you opened it from a record.
 *   - Notes and a back-date sit behind "More", so the common case is
 *     two taps and a sentence.
 */
export function QuickAdd({
  activityTypes,
  context,
}: {
  activityTypes: ActivityType[]
  context?: QuickAddContext
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [typeId, setTypeId] = useState(activityTypes[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const [target, setTarget] = useState<QuickAddContext | null>(context ?? null)
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SearchHit<PlaceKind>[]>([])
  const subjectRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Search as you type, but only once typing pauses. */
  function onTermChange(value: string) {
    setTerm(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)

    if (value.trim().length < 2) {
      setHits([])
      return
    }
    searchTimer.current = setTimeout(async () => setHits(await searchPlaces(value)), 180)
  }

  function reset() {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    setSubject('')
    setBody('')
    setOccurredAt('')
    setShowMore(false)
    setError(null)
    setTerm('')
    setHits([])
    setTarget(context ?? null)
    setTypeId(activityTypes[0]?.id ?? '')
  }

  function close() {
    setOpen(false)
    reset()
  }

  function save(andAnother: boolean) {
    setError(null)
    startTransition(async () => {
      const res = await logActivity({
        activityTypeId: typeId,
        subject,
        body,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        accountId: target?.kind === 'account' ? target.id : null,
        buildingId: target?.kind === 'building' ? target.id : null,
        contactId: target?.kind === 'contact' ? target.id : null,
      })

      if (!res.ok) {
        // The form keeps everything typed, so a failure never loses the note.
        setError(res.error)
        return
      }

      router.refresh()
      if (andAnother) {
        const keptTarget = target
        reset()
        setTarget(keptTarget)
        setSaved('Logged.')
        setTimeout(() => setSaved(null), 2000)
        subjectRef.current?.focus()
      } else {
        close()
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Log an activity"
        className="bg-primary text-primary-foreground fixed right-4 bottom-4 z-40 flex h-14 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-lg transition hover:brightness-95 md:right-8 md:bottom-8"
      >
        <span className="text-lg leading-none">+</span> Log
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cancel"
        onClick={close}
        className="absolute inset-0 bg-black/25"
      />

      <div className="bg-background relative flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-xl p-4 shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base">Log an activity</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="row-hover text-muted-foreground rounded-[3px] px-2 py-1 text-sm"
          >
            Esc
          </button>
        </div>

        {/* Type: one tap, no menu. */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {activityTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeId(t.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm transition',
                t.id === typeId
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-muted text-foreground hover:bg-hover',
              )}
            >
              {t.name}
            </button>
          ))}
        </div>

        <Input
          ref={subjectRef}
          autoFocus
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && subject.trim() && !pending) save(false)
            if (e.key === 'Escape') close()
          }}
          placeholder="What happened?"
          aria-label="What happened"
          className="mb-3 h-11 text-base"
        />

        {/* Where. Prefilled when opened from a record page. */}
        {target ? (
          <div className="bg-secondary mb-3 flex items-center justify-between gap-2 rounded-[3px] px-2.5 py-2 text-sm">
            <span className="truncate">
              <span className="text-muted-foreground">at </span>
              {target.label}
            </span>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
            >
              change
            </button>
          </div>
        ) : (
          <div className="mb-3">
            <Input
              value={term}
              onChange={(e) => onTermChange(e.target.value)}
              placeholder="Where? Account, building or person (optional)"
              aria-label="Where did this happen"
              className="h-10"
            />
            {hits.length > 0 && (
              <ul className="border-border mt-1 max-h-52 overflow-y-auto rounded-[3px] border">
                {hits.map((hit) => (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setTarget({ kind: hit.kind, id: hit.id, label: hit.label })
                        setTerm('')
                        setHits([])
                      }}
                      className="row-hover block w-full px-2.5 py-2 text-left text-sm"
                    >
                      <span className="font-medium">{hit.label}</span>
                      {hit.sublabel && (
                        <span className="text-muted-foreground"> · {hit.sublabel}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showMore ? (
          <div className="mb-3 space-y-3">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Anything worth remembering"
              aria-label="Notes"
              rows={3}
            />
            <div>
              <label htmlFor="occurred" className="text-muted-foreground mb-1 block text-[13px]">
                When, if not now
              </label>
              <Input
                id="occurred"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="max-w-60"
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="text-muted-foreground hover:text-foreground mb-3 self-start text-sm"
          >
            + Notes or a different date
          </button>
        )}

        {error && (
          <p role="alert" className="bg-destructive/10 text-destructive mb-3 rounded-[3px] px-3 py-2 text-sm">
            {error} Nothing was lost — press save again.
          </p>
        )}
        {saved && (
          <p role="status" className="bg-secondary mb-3 rounded-[3px] px-3 py-2 text-sm">
            {saved}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={() => save(false)} disabled={pending || !subject.trim()} className="h-10 px-4">
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="outline"
            onClick={() => save(true)}
            disabled={pending || !subject.trim()}
            className="h-10"
          >
            Save and add another
          </Button>
        </div>
      </div>
    </div>
  )
}
