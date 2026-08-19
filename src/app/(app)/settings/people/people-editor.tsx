'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { saveProfile, type Role } from '@/app/(app)/settings/people/actions'
import { Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type PersonRow = {
  id: string
  full_name: string
  email: string
  role: Role
  sees_rates: boolean
  is_active: boolean
  is_service: boolean
}

type Draft = { fullName: string; role: Role; seesRates: boolean; isActive: boolean }

function draftOf(p: PersonRow): Draft {
  return {
    fullName: p.full_name,
    role: p.role,
    seesRates: p.sees_rates,
    isActive: p.is_active,
  }
}

/**
 * One row per profile, edited in place — the same shape as the reference-data
 * editor, because this is the same job: a short list that changes twice a year.
 * A row saves only when something actually changed, so Save stays quiet.
 */
export function PeopleEditor({ people, meId }: { people: PersonRow[]; meId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(people.map((p) => [p.id, draftOf(p)])),
  )

  function set(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  function save(person: PersonRow) {
    const d = drafts[person.id]
    setError(null)
    startTransition(async () => {
      const result = await saveProfile({
        id: person.id,
        fullName: d.fullName,
        role: d.role,
        seesRates: d.seesRates,
        isActive: d.isActive,
      })
      if (!result.ok) {
        setError(result.error)
        // Put the row back to what the database still says, so the screen never
        // shows a change that did not happen.
        setDrafts((all) => ({ ...all, [person.id]: draftOf(person) }))
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      {error && (
        <p role="alert" className="bg-destructive/10 text-destructive mb-3 rounded-[3px] px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="border-border border-t">
        {people.map((person) => {
          const d = drafts[person.id]
          const me = person.id === meId
          const changed =
            d.fullName !== person.full_name ||
            d.role !== person.role ||
            d.seesRates !== person.sees_rates ||
            d.isActive !== person.is_active

          return (
            <div
              key={person.id}
              className={cn('border-border border-b px-2 py-3', !person.is_active && 'opacity-60')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={d.fullName}
                  onChange={(e) => set(person.id, { fullName: e.target.value })}
                  className="min-w-40 flex-1"
                  aria-label={`Name of ${person.full_name || person.email}`}
                />
                <Select
                  value={d.role}
                  onChange={(e) => set(person.id, { role: e.target.value as Role })}
                  disabled={me}
                  aria-label={`Role of ${person.full_name || person.email}`}
                  className="w-36"
                >
                  <option value="admin">Admin</option>
                  <option value="leadership">Leadership</option>
                  <option value="field">Field</option>
                </Select>
                <Button size="sm" variant="outline" onClick={() => save(person)} disabled={pending || !changed}>
                  Save
                </Button>
              </div>

              <p className="text-muted-foreground mt-1 text-sm">{person.email}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.seesRates}
                    onChange={(e) => set(person.id, { seesRates: e.target.checked })}
                    className="size-4"
                  />
                  Sees pay rates
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.isActive}
                    onChange={(e) => set(person.id, { isActive: e.target.checked })}
                    disabled={me || person.is_service}
                    className="size-4"
                  />
                  Can sign in
                </label>
                {me && <span className="text-muted-foreground text-sm">This is you</span>}
                {person.is_service && (
                  <span className="text-muted-foreground text-sm">
                    Machine account — the nightly job signs in as this
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
