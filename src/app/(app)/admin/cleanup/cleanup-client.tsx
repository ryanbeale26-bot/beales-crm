'use client'

import { useState, useTransition } from 'react'

import {
  archiveRecord,
  mergeAccount,
  moveContracts,
  restoreRecord,
  type ArchivableTable,
  type CleanupResult,
} from '@/app/(app)/admin/cleanup/actions'
import { RowList, SectionTitle } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/form-field'

type AccountRow = {
  id: string
  name: string
  buildings: number
  contacts: number
  deals: number
  activities: number
  monthlyValue: number
}

type BuildingRow = {
  id: string
  name: string
  address: string | null
  accountId: string
  accountName: string
  activities: number
  monthlyValue: number
}

type ContactRow = {
  id: string
  name: string
  email: string | null
  role: string | null
  accountName: string | null
  activities: number
}

type Archived = { id: string; name: string; deleted_at: string | null }

const money = (n: number) => (n ? `$${n.toLocaleString()}/mo` : '')

export function CleanupClient({
  accounts,
  buildings,
  contacts,
  archivedAccounts,
  archivedBuildings,
  archivedContacts,
}: {
  accounts: AccountRow[]
  buildings: BuildingRow[]
  contacts: ContactRow[]
  archivedAccounts: Archived[]
  archivedBuildings: Archived[]
  archivedContacts: Archived[]
}) {
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [pending, startTransition] = useTransition()
  // Accounts and buildings are 22 and 53 rows and read fine as a plain list.
  // Contacts is 99 and climbing, and the reason to open this section is always
  // one named person, so it gets a filter rather than a scroll.
  const [contactFilter, setContactFilter] = useState('')

  const run = (fn: () => Promise<CleanupResult>) => {
    setResult(null)
    startTransition(async () => setResult(await fn()))
  }

  const needle = contactFilter.trim().toLowerCase()
  const visibleContacts = needle
    ? contacts.filter((c) =>
        [c.name, c.email, c.accountName, c.role]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      )
    : contacts

  // --- merge an account -----------------------------------------------------
  const [fromAccount, setFromAccount] = useState('')
  const [intoAccount, setIntoAccount] = useState('')
  const [tagBuilding, setTagBuilding] = useState('')

  const from = accounts.find((a) => a.id === fromAccount)
  const intoBuildings = buildings.filter((b) => b.accountId === intoAccount)

  // --- consolidate two buildings -------------------------------------------
  const [fromBuilding, setFromBuilding] = useState('')
  const [toBuilding, setToBuilding] = useState('')

  return (
    <div className="space-y-10">
      {result && (
        <p
          className={`rounded-[3px] px-3 py-2 text-sm ${
            result.ok ? 'bg-brand-light-blue text-foreground' : 'bg-destructive/10 text-destructive'
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionTitle>Merge an account into another</SectionTitle>
        <p className="text-muted-foreground mb-4 text-sm">
          Moves every building, contact, deal, next step and activity across. Contract values
          travel with their building, so nothing changes in MRR. The emptied account can then be
          archived.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Move everything from" htmlFor="from-account">
            <Select
              id="from-account"
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
            >
              <option value="">Choose an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Into" htmlFor="into-account">
            <Select
              id="into-account"
              value={intoAccount}
              onChange={(e) => {
                setIntoAccount(e.target.value)
                setTagBuilding('')
              }}
            >
              <option value="">Choose an account…</option>
              {accounts
                .filter((a) => a.id !== fromAccount)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>

          <Field
            label="Tag those activities to"
            htmlFor="tag-building"
            hint="Optional. Files every moved activity against one building."
          >
            <Select
              id="tag-building"
              value={tagBuilding}
              onChange={(e) => setTagBuilding(e.target.value)}
              disabled={!intoAccount}
            >
              <option value="">Leave activities as they are</option>
              {intoBuildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {from && (
          <p className="text-muted-foreground mt-3 text-sm">
            <strong className="text-foreground">{from.name}</strong> currently holds{' '}
            {from.buildings} building{from.buildings === 1 ? '' : 's'}, {from.contacts} contact
            {from.contacts === 1 ? '' : 's'}, {from.deals} deal{from.deals === 1 ? '' : 's'} and{' '}
            {from.activities} activit{from.activities === 1 ? 'y' : 'ies'}
            {from.monthlyValue ? ` worth ${money(from.monthlyValue)}` : ''}.
          </p>
        )}

        <Button
          className="mt-4"
          disabled={!fromAccount || !intoAccount || pending}
          onClick={() =>
            run(() =>
              mergeAccount({
                fromAccountId: fromAccount,
                intoAccountId: intoAccount,
                buildingId: tagBuilding || null,
              }),
            )
          }
        >
          Move everything across
        </Button>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionTitle>Consolidate two buildings at one address</SectionTitle>
        <p className="text-muted-foreground mb-4 text-sm">
          Repoints the contract history from one building to another. Company MRR is unchanged and
          no churn or new business is recorded — this is a correction, not a price change. The
          destination must have no open contract of its own.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Take the contract from" htmlFor="from-building">
            <Select
              id="from-building"
              value={fromBuilding}
              onChange={(e) => setFromBuilding(e.target.value)}
            >
              <option value="">Choose a building…</option>
              {buildings
                .filter((b) => b.monthlyValue > 0)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {money(b.monthlyValue)}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Give it to" htmlFor="to-building">
            <Select
              id="to-building"
              value={toBuilding}
              onChange={(e) => setToBuilding(e.target.value)}
            >
              <option value="">Choose a building…</option>
              {buildings
                .filter((b) => b.id !== fromBuilding && b.monthlyValue === 0)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.accountName})
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <Button
          className="mt-4"
          disabled={!fromBuilding || !toBuilding || pending}
          onClick={() => run(() => moveContracts(fromBuilding, toBuilding))}
        >
          Move the contract
        </Button>
      </section>

      {/* ------------------------------------------------------------------ */}
      <section>
        <SectionTitle>Archive</SectionTitle>
        <p className="text-muted-foreground mb-4 text-sm">
          Archiving hides a record everywhere and deletes nothing. An account still holding
          buildings, or a building still billing, is refused — that is what stops a tidy-up from
          quietly changing the revenue reports. An archived contact also stops being matched by
          the nightly ingest, which is the way to take a former colleague back out of it.
        </p>

        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
          Accounts
        </p>
        <RowList>
          {accounts.map((a) => (
            <CleanupRow
              key={a.id}
              title={a.name}
              meta={`${a.buildings} buildings · ${a.contacts} contacts · ${a.deals} deals · ${a.activities} activities ${money(a.monthlyValue)}`}
              right={
                <ArchiveButton
                  table="accounts"
                  id={a.id}
                  disabled={pending}
                  onRun={run}
                  hint={a.buildings > 0 ? `${a.buildings} building(s) first` : null}
                />
              }
            />
          ))}
        </RowList>

        <p className="text-muted-foreground mt-6 mb-2 text-xs font-medium tracking-wide uppercase">
          Buildings
        </p>
        <RowList>
          {buildings.map((b) => (
            <CleanupRow
              key={b.id}
              title={b.name}
              meta={`${b.accountName}${b.address ? ` · ${b.address}` : ''} · ${b.activities} activities ${money(b.monthlyValue)}`}
              right={
                <ArchiveButton
                  table="buildings"
                  id={b.id}
                  disabled={pending}
                  onRun={run}
                  hint={b.monthlyValue > 0 ? 'still billing' : null}
                />
              }
            />
          ))}
        </RowList>

        <p className="text-muted-foreground mt-6 mb-2 text-xs font-medium tracking-wide uppercase">
          Contacts
        </p>
        <input
          type="search"
          value={contactFilter}
          onChange={(event) => setContactFilter(event.target.value)}
          placeholder="Filter by name, email or company"
          className="bg-secondary focus-visible:ring-ring/50 mb-2 h-8 w-full rounded-[3px] px-2 text-sm outline-none focus-visible:ring-2"
        />
        <RowList>
          {visibleContacts.map((c) => (
            <CleanupRow
              key={c.id}
              title={c.name}
              meta={[c.email, c.accountName ?? 'No account', c.role, `${c.activities} activities`]
                .filter(Boolean)
                .join(' · ')}
              right={
                <ArchiveButton table="contacts" id={c.id} disabled={pending} onRun={run} hint={null} />
              }
            />
          ))}
        </RowList>
        {visibleContacts.length < contacts.length && (
          <p className="text-muted-foreground mt-2 text-xs">
            Showing {visibleContacts.length} of {contacts.length}.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {(archivedAccounts.length > 0 ||
        archivedBuildings.length > 0 ||
        archivedContacts.length > 0) && (
        <section>
          <SectionTitle>Archived</SectionTitle>
          <p className="text-muted-foreground mb-4 text-sm">
            Still in the database, hidden from every screen. Restoring puts a record back exactly
            as it was.
          </p>
          <RowList>
            {archivedAccounts.map((a) => (
              <CleanupRow
                key={a.id}
                title={a.name}
                meta="Account"
                right={
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => restoreRecord('accounts', a.id))}
                  >
                    Restore
                  </Button>
                }
              />
            ))}
            {archivedBuildings.map((b) => (
              <CleanupRow
                key={b.id}
                title={b.name}
                meta="Building"
                right={
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => restoreRecord('buildings', b.id))}
                  >
                    Restore
                  </Button>
                }
              />
            ))}
            {archivedContacts.map((c) => (
              <CleanupRow
                key={c.id}
                title={c.name}
                meta="Contact"
                right={
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => restoreRecord('contacts', c.id))}
                  >
                    Restore
                  </Button>
                }
              />
            ))}
          </RowList>
        </section>
      )}
    </div>
  )
}

function ArchiveButton({
  table,
  id,
  disabled,
  hint,
  onRun,
}: {
  table: ArchivableTable
  id: string
  disabled: boolean
  hint: string | null
  onRun: (fn: () => Promise<CleanupResult>) => void
}) {
  return (
    <span className="flex items-center gap-2">
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      <Button variant="ghost" disabled={disabled} onClick={() => onRun(() => archiveRecord(table, id))}>
        Archive
      </Button>
    </span>
  )
}

/**
 * The same hairline row as `Row` in page-header, minus the Link wrapper —
 * these rows carry a button, and a button inside an anchor navigates instead
 * of doing its job.
 */
function CleanupRow({
  title,
  meta,
  right,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="border-border flex items-center justify-between gap-4 border-b px-2 py-2.5">
      <div className="min-w-0">
        <span className="truncate font-medium">{title}</span>
        {meta && <p className="text-muted-foreground mt-0.5 truncate text-sm">{meta}</p>}
      </div>
      {right && <div className="shrink-0 text-right text-sm">{right}</div>}
    </div>
  )
}
