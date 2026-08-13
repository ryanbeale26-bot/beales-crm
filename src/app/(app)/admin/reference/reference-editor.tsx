'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import {
  saveReferenceRow,
  setReferenceRowActive,
  type ReferenceTable,
} from '@/app/(app)/admin/reference/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type ReferenceRow = {
  id: string
  name: string
  sort_order?: number
  probability?: number
  is_active: boolean
}

/**
 * One list, edited in place. Deliberately plain: these are five short lists that
 * change once a year, so a row of inputs and a Save beats anything cleverer.
 */
export function ReferenceEditor({
  table,
  title,
  description,
  rows,
  hasProbability = false,
  hasSortOrder = true,
  addLabel,
}: {
  table: ReferenceTable
  title: string
  description: string
  rows: ReferenceRow[]
  hasProbability?: boolean
  hasSortOrder?: boolean
  addLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { name: string; probability: string; sortOrder: string }>>(
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          name: r.name,
          probability: r.probability === undefined ? '' : String(r.probability),
          sortOrder: r.sort_order === undefined ? '' : String(r.sort_order),
        },
      ]),
    ),
  )
  const [newName, setNewName] = useState('')

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) {
        setError(result.error ?? 'That did not save.')
        return
      }
      router.refresh()
    })
  }

  function save(row: ReferenceRow) {
    const d = draft[row.id]
    run(() =>
      saveReferenceRow({
        table,
        id: row.id,
        name: d.name,
        probability: hasProbability && d.probability !== '' ? Number(d.probability) : undefined,
        sortOrder: hasSortOrder && d.sortOrder !== '' ? Number(d.sortOrder) : undefined,
      }),
    )
  }

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-0.5 mb-3 text-sm">{description}</p>

      {error && (
        <p role="alert" className="bg-destructive/10 text-destructive mb-3 rounded-[3px] px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="border-border border-t">
        {rows.length === 0 && (
          <p className="text-muted-foreground border-border border-b px-2 py-3 text-sm">
            Nothing here yet.
          </p>
        )}

        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              'border-border flex flex-wrap items-center gap-2 border-b px-2 py-2',
              !row.is_active && 'opacity-55',
            )}
          >
            <Input
              value={draft[row.id]?.name ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [row.id]: { ...d[row.id], name: e.target.value } }))
              }
              className="h-8 min-w-40 flex-1"
              aria-label={`Name of ${row.name}`}
            />

            {hasProbability && (
              <label className="text-muted-foreground flex items-center gap-1 text-xs">
                <Input
                  value={draft[row.id]?.probability ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [row.id]: { ...d[row.id], probability: e.target.value },
                    }))
                  }
                  inputMode="numeric"
                  className="h-8 w-14"
                  aria-label={`Win probability for ${row.name}`}
                />
                %
              </label>
            )}

            {hasSortOrder && (
              <Input
                value={draft[row.id]?.sortOrder ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [row.id]: { ...d[row.id], sortOrder: e.target.value } }))
                }
                inputMode="numeric"
                className="h-8 w-14"
                aria-label={`Order of ${row.name}`}
              />
            )}

            <Button size="sm" variant="outline" onClick={() => save(row)} disabled={pending}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(() => setReferenceRowActive({ table, id: row.id, isActive: !row.is_active }))
              }
            >
              {row.is_active ? 'Retire' : 'Bring back'}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={addLabel}
          className="h-8 w-64"
        />
        <Button
          size="sm"
          disabled={pending || newName.trim() === ''}
          onClick={() =>
            run(async () => {
              const result = await saveReferenceRow({
                table,
                name: newName,
                sortOrder: hasSortOrder ? rows.length + 1 : undefined,
                probability: hasProbability ? 0 : undefined,
              })
              if (result.ok) setNewName('')
              return result
            })
          }
        >
          Add
        </Button>
      </div>
    </section>
  )
}
