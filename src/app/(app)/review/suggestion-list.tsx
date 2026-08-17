'use client'

import { useState } from 'react'

import { acceptAction, rejectAction } from './actions'
import { Button } from '@/components/ui/button'
import { confidenceLabel, kindLabel, type OpenSuggestion } from '@/lib/ingest/review'

/**
 * The review queue.
 *
 * Tick and act in bulk, because one row at a time is what makes a queue a
 * chore. Nothing here is required: every suggestion has an expiry, and ignoring
 * the whole screen forever costs nothing but the links it would have made.
 * That is deliberate — an inbox nobody clears is worse than no inbox.
 */
export function SuggestionList({ suggestions }: { suggestions: OpenSuggestion[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const visible = suggestions.filter((s) => !hidden.has(s.id))
  const allSelected = visible.length > 0 && visible.every((s) => selected.has(s.id))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function run(kind: 'accept' | 'reject') {
    const ids = [...selected]
    if (ids.length === 0) return
    setBusy(true)
    setError(null)

    const result =
      kind === 'accept' ? await acceptAction(ids) : await rejectAction(ids)

    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'That did not work.')
      return
    }

    if (kind === 'accept' && 'failed' in result && result.failed.length > 0) {
      // Say which ones did not land rather than reporting a clean success and
      // letting them be discovered missing later.
      setError(
        `${result.failed.length} could not be applied: ${result.failed[0].message}` +
          (result.failed.length > 1 ? ' (and others)' : ''),
      )
    }

    setHidden((current) => new Set([...current, ...ids]))
    setSelected(new Set())
    setDone(
      kind === 'accept'
        ? `Applied ${ids.length}. Undo it from the bottom of the Import page.`
        : `Dismissed ${ids.length}. They will not come back.`,
    )
  }

  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {done ?? 'Nothing waiting.'}
      </p>
    )
  }

  return (
    <div>
      <div className="border-border flex flex-wrap items-center gap-2 border-b pb-2">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)))
            }
          />
          {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
        </label>

        <span className="flex-1" />

        <Button size="sm" disabled={busy || selected.size === 0} onClick={() => run('accept')}>
          {busy ? 'Working…' : 'Apply'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || selected.size === 0}
          onClick={() => run('reject')}
        >
          Dismiss
        </Button>
      </div>

      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
      {done && !error && <p className="text-muted-foreground mt-2 text-sm">{done}</p>}

      <div className="border-border border-t-0">
        {visible.map((suggestion) => (
          <label
            key={suggestion.id}
            className="row-hover border-border flex cursor-pointer items-start gap-3 border-b px-2 py-3"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.has(suggestion.id)}
              onChange={() => toggle(suggestion.id)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  {kindLabel(suggestion.kind)}
                </span>
                <span className="truncate font-medium">{suggestion.label}</span>
              </div>

              <p className="text-muted-foreground mt-0.5 text-sm">{suggestion.rationale}</p>

              {suggestion.quote && (
                <blockquote className="border-border text-muted-foreground mt-1.5 border-l-2 pl-2 text-sm italic">
                  “{suggestion.quote}”
                  <span className="mt-0.5 block text-xs not-italic opacity-70">
                    Those words are really in the message. What they mean is a guess.
                  </span>
                </blockquote>
              )}

              <p className="text-muted-foreground mt-1 text-xs">
                {confidenceLabel(suggestion.confidence)}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
