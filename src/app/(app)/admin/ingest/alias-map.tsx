'use client'

import { useState } from 'react'

import { addAlias, removeAlias } from './actions'
import { Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type AliasRow = { id: string; alias: string; label: string; kind: string; note: string | null }
export type AliasCandidate = { alias: string; kind: string; label: string; target: string }
export type TargetOption = { value: string; label: string; group: 'Accounts' | 'Buildings' | 'Open deals' }
export type Ambiguity = { subject: string; matchedOn: string | null; lastSeen: string; count: number }

/**
 * What a note title means.
 *
 * The one table the Granola ingest cannot work without, and the reason is
 * measured rather than assumed: "wound center" and "cancer center" are not
 * building names, not addresses, and not deal names, so nothing already in the
 * database can produce them. A person has to say it once.
 */
export function AliasMap({
  aliases,
  candidates,
  targets,
  ambiguities,
}: {
  aliases: AliasRow[]
  candidates: AliasCandidate[]
  targets: TargetOption[]
  ambiguities: Ambiguity[]
}) {
  const [alias, setAlias] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groups: TargetOption['group'][] = ['Accounts', 'Buildings', 'Open deals']

  async function add(nextAlias: string, nextTarget: string) {
    if (!nextAlias.trim() || !nextTarget) {
      setError('Type the phrase, and pick what it should mean.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await addAlias(nextAlias, nextTarget, null)
    setBusy(false)
    if (!result.ok) return setError(result.error ?? 'That did not work.')
    setAlias('')
    setTarget('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1 block text-sm">
            Words as they appear in a title
          </label>
          <Input
            value={alias}
            placeholder="wound center"
            onChange={(event) => setAlias(event.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1 block text-sm">Means</label>
          <Select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="">Choose…</option>
            {groups.map((group) => {
              const options = targets.filter((option) => option.group === group)
              if (options.length === 0) return null
              return (
                <optgroup key={group} label={group}>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </Select>
        </div>
        <Button size="sm" disabled={busy} onClick={() => add(alias, target)}>
          Add
        </Button>
      </div>

      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}

      {ambiguities.length > 0 && (
        <div className="border-border mt-6 border-t pt-4">
          <p className="text-muted-foreground mb-2 text-sm">
            <strong className="text-foreground">
              {ambiguities.length} note {ambiguities.length === 1 ? 'title names' : 'titles name'} more
              than one record
            </strong>
            , so nothing was linked. Each one is fixed by adding a phrase above that says which —
            and that fixes every future note shaped the same way.
          </p>
          {ambiguities.map((row) => (
            <div key={row.subject} className="border-border border-b px-2 py-2 text-sm">
              <div className="truncate">{row.subject}</div>
              {row.matchedOn && (
                <div className="text-muted-foreground">
                  matched on {row.matchedOn} · last seen{' '}
                  {new Date(row.lastSeen).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-4">
          <p className="text-muted-foreground mb-1 text-sm">
            Suggested from records you already have — each of these belongs to one record and one
            only:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((candidate) => (
              <button
                key={`${candidate.alias}-${candidate.target}`}
                type="button"
                disabled={busy}
                onClick={() => add(candidate.alias, candidate.target)}
                className="border-border row-hover rounded-[3px] border px-2 py-1 text-sm"
              >
                {candidate.alias}
                <span className="text-muted-foreground"> → {candidate.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {aliases.length > 0 && (
        <div className="border-border mt-6 border-t">
          {aliases.map((row) => (
            <div
              key={row.id}
              className="border-border flex items-center justify-between gap-4 border-b px-2 py-2 text-sm"
            >
              <span className="truncate">
                {row.alias}{' '}
                <span className="text-muted-foreground">
                  → {row.label} ({row.kind})
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const result = await removeAlias(row.id)
                  setBusy(false)
                  if (!result.ok) setError(result.error ?? 'Could not remove that.')
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
