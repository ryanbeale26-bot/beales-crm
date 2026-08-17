'use client'

import { useState } from 'react'

import { addDomain, removeDomain } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/form-field'

export type DomainRow = { id: string; domain: string; accountId: string; accountName: string }
export type Candidate = { domain: string; accountId: string; accountName: string; contactCount: number }

/**
 * The domain map.
 *
 * This is the one piece of the ingest a person has to maintain, and everything
 * the middle confidence tier can do depends on it — so the candidates are
 * offered rather than left to be typed. Each is derived from contacts already
 * held, and any domain whose contacts span two accounts is never offered at
 * all, because it could only ever be wrong.
 */
export function DomainMap({
  domains,
  candidates,
  accounts,
}: {
  domains: DomainRow[]
  candidates: Candidate[]
  accounts: { id: string; name: string }[]
}) {
  const [domain, setDomain] = useState('')
  const [accountId, setAccountId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(nextDomain: string, nextAccount: string) {
    if (!nextDomain || !nextAccount) {
      setError('Pick a domain and an account.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await addDomain(nextDomain, nextAccount)
    setBusy(false)
    if (!result.ok) return setError(result.error ?? 'That did not work.')
    setDomain('')
    setAccountId('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1 block text-sm">Domain</label>
          <Input
            value={domain}
            placeholder="tuftsmedicine.org"
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="text-muted-foreground mb-1 block text-sm">Account</label>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose…</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" disabled={busy} onClick={() => add(domain, accountId)}>
          Add
        </Button>
      </div>

      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}

      {candidates.length > 0 && (
        <div className="mt-4">
          <p className="text-muted-foreground mb-1 text-sm">
            Suggested from contacts you already have — each of these appears under one account and
            one account only:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((candidate) => (
              <button
                key={candidate.domain}
                type="button"
                disabled={busy}
                onClick={() => add(candidate.domain, candidate.accountId)}
                className="border-border row-hover rounded-[3px] border px-2 py-1 text-sm"
              >
                {candidate.domain}
                <span className="text-muted-foreground"> → {candidate.accountName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {domains.length > 0 && (
        <div className="border-border mt-6 border-t">
          {domains.map((row) => (
            <div
              key={row.id}
              className="border-border flex items-center justify-between gap-4 border-b px-2 py-2 text-sm"
            >
              <span className="truncate">
                {row.domain} <span className="text-muted-foreground">→ {row.accountName}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const result = await removeDomain(row.id)
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
