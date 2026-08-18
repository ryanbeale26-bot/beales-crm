'use client'

import { useState } from 'react'

import { addProfileAlias, removeProfileAlias } from './actions'
import { Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type ProfileAliasRow = { id: string; email: string; name: string }

/**
 * Other addresses that belong to one of us.
 *
 * Granola signs in as a personal Gmail address, so without an entry here every
 * note it produces reads "logged by Nightly ingest" instead of by the person who
 * captured it — and that person's own address is filed in the strangers list.
 *
 * Not the domain map: gmail.com stays permanently unmappable, because a domain
 * claims a company and an address claims a person.
 */
export function ProfileAliases({
  rows,
  people,
}: {
  rows: ProfileAliasRow[]
  people: { id: string; name: string }[]
}) {
  const [email, setEmail] = useState('')
  const [profileId, setProfileId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1 block text-sm">Email address</label>
          <Input
            value={email}
            placeholder="ryanbeale26@gmail.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1 block text-sm">Is</label>
          <Select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            <option value="">Choose…</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const result = await addProfileAlias(email, profileId)
            setBusy(false)
            if (!result.ok) return setError(result.error ?? 'That did not work.')
            setEmail('')
            setProfileId('')
          }}
        >
          Add
        </Button>
      </div>

      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}

      {rows.length > 0 && (
        <div className="border-border mt-4 border-t">
          {rows.map((row) => (
            <div
              key={row.id}
              className="border-border flex items-center justify-between gap-4 border-b px-2 py-2 text-sm"
            >
              <span className="truncate">
                {row.email} <span className="text-muted-foreground">→ {row.name}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const result = await removeProfileAlias(row.id)
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
