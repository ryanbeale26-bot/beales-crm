'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

import {
  commitActiveClients,
  commitContacts,
  parseUpload,
  previewImport,
  type CommitResult,
  type ParseResult,
  type PreviewResult,
  type SheetSummary,
} from './actions'
import { Field, Select } from '@/components/form-field'
import { SectionTitle } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IMPORTERS, type ImporterKey } from '@/lib/import/definitions'
import type { ProposedBuilding, ProposedContact, SkippedRow } from '@/lib/import/active-clients'
import { money } from '@/lib/format'

type Step = 'upload' | 'map' | 'preview' | 'done'

export function Importer() {
  const fileRef = useRef<HTMLInputElement>(null)
  // The chosen File is held in state, not read back off the input: the upload
  // step unmounts once we move to mapping, taking the input with it.
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [importerKey, setImporterKey] = useState<ImporterKey>('active-clients')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<SheetSummary[]>([])
  const [sheetName, setSheetName] = useState('')
  const [mapping, setMapping] = useState<Record<string, number>>({})

  const [buildings, setBuildings] = useState<ProposedBuilding[]>([])
  const [contacts, setContacts] = useState<ProposedContact[]>([])
  const [skipped, setSkipped] = useState<SkippedRow[]>([])
  const [result, setResult] = useState<CommitResult | null>(null)

  const def = IMPORTERS[importerKey]
  const sheet = sheets.find((s) => s.name === sheetName)

  async function handleUpload(formData: FormData) {
    const chosen = formData.get('file')
    if (!(chosen instanceof File)) return setError('Choose a file.')

    setBusy(true)
    setError(null)
    const res: ParseResult = await parseUpload(formData)
    setBusy(false)

    if (!res.ok) return setError(res.error)
    setFile(chosen)
    setFileName(res.fileName)
    setSheets(res.sheets)
    setSheetName(res.selectedSheet)
    setMapping(res.mapping)
    setStep('map')
  }

  async function handlePreview() {
    if (!file) return setError('The file was lost — please choose it again.')

    setBusy(true)
    setError(null)
    const formData = new FormData()
    formData.set('file', file)
    formData.set('importer', importerKey)
    formData.set('sheet', sheetName)
    formData.set('mapping', JSON.stringify(mapping))

    const res: PreviewResult = await previewImport(formData)
    setBusy(false)

    if (!res.ok) return setError(res.error)
    if (res.kind === 'active-clients') {
      setBuildings(res.buildings)
      setContacts([])
    } else {
      setContacts(res.contacts)
      setBuildings([])
    }
    setSkipped(res.skipped)
    setStep('preview')
  }

  async function handleCommit() {
    setBusy(true)
    setError(null)
    const res =
      importerKey === 'active-clients'
        ? await commitActiveClients({ fileName, sheetName, mapping, buildings })
        : await commitContacts({ fileName, sheetName, mapping, contacts })
    setBusy(false)

    if (!res.ok) return setError(res.error)
    setResult(res)
    setStep('done')
  }

  /** Renaming a group here is how two proposed accounts become one. */
  function renameAccount(from: string, to: string) {
    setBuildings((prev) =>
      prev.map((b) => (b.accountName === from ? { ...b, accountName: to } : b)),
    )
  }

  const accountGroups = groupBy(buildings, (b) => b.accountName)
  const totalValue = buildings.reduce((sum, b) => sum + (b.monthlyValue ?? 0), 0)
  const warningCount = buildings.filter((b) => b.warnings.length > 0).length

  return (
    <div>
      <Steps current={step} />

      {error && (
        <p className="bg-destructive/10 text-destructive mb-4 rounded-[3px] px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {step === 'upload' && (
        <form action={handleUpload} className="max-w-lg space-y-5">
          <Field label="What are you importing?" htmlFor="importer">
            <Select
              id="importer"
              name="importer"
              value={importerKey}
              onChange={(e) => setImporterKey(e.target.value as ImporterKey)}
            >
              {Object.values(IMPORTERS).map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-muted-foreground -mt-2 text-sm">{def.description}</p>

          <Field label="Spreadsheet" htmlFor="file" hint="Excel (.xlsx) or CSV. Nothing is written until you confirm.">
            <input
              ref={fileRef}
              id="file"
              name="file"
              type="file"
              accept=".xlsx,.xls,.csv"
              required
              className="text-sm file:mr-3 file:rounded-[3px] file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm"
            />
          </Field>

          <Button type="submit" disabled={busy}>
            {busy ? 'Reading…' : 'Read the file'}
          </Button>
        </form>
      )}

      {step === 'map' && sheet && (
        <div className="space-y-6">
          <div className="max-w-lg">
            <Field label="Sheet" htmlFor="sheet" hint={`Headers found on row ${sheet.headerRow}.`}>
              <Select
                id="sheet"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
              >
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} — {s.rowCount} rows
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <SectionTitle>Match the columns</SectionTitle>
            <p className="text-muted-foreground mb-3 text-sm">
              Guessed from your headers. Change anything that looks wrong, or set it to
              &ldquo;not imported&rdquo;.
            </p>
            <div className="border-border border-t">
              {def.fields.map((field) => (
                <div
                  key={field.key}
                  className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-2 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{field.label}</div>
                    {field.hint && (
                      <div className="text-muted-foreground text-xs">{field.hint}</div>
                    )}
                  </div>
                  <Select
                    aria-label={`Column for ${field.label}`}
                    className="max-w-56"
                    value={mapping[field.key] ?? -1}
                    onChange={(e) =>
                      setMapping({ ...mapping, [field.key]: Number(e.target.value) })
                    }
                  >
                    <option value={-1}>Not imported</option>
                    {sheet.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handlePreview} disabled={busy}>
              {busy ? 'Working…' : 'Preview'}
            </Button>
            <Button variant="ghost" onClick={() => setStep('upload')}>
              Back
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && importerKey === 'active-clients' && (
        <div className="space-y-6">
          <div className="bg-muted rounded-[3px] p-3 text-sm">
            <strong>{buildings.length} buildings</strong> under{' '}
            <strong>{accountGroups.length} accounts</strong> · {money(totalValue)} per month ·{' '}
            {skipped.length} {skipped.length === 1 ? 'row' : 'rows'} skipped
            {warningCount > 0 && ` · ${warningCount} ${warningCount === 1 ? 'row needs' : 'rows need'} a look`}
          </div>

          <div>
            <SectionTitle>Accounts</SectionTitle>
            <p className="text-muted-foreground mb-3 text-sm">
              Two groups with the same name become one account. Rename them here to merge —
              for example if a customer is spelled two ways.
            </p>
            <div className="border-border border-t">
              {accountGroups.map(([name, group]) => (
                <div
                  key={name}
                  className="border-border flex flex-wrap items-center gap-3 border-b px-2 py-2"
                >
                  <Input
                    aria-label={`Account name for ${name}`}
                    defaultValue={name}
                    onBlur={(e) => {
                      const next = e.target.value.trim()
                      if (next && next !== name) renameAccount(name, next)
                    }}
                    className="max-w-xs"
                  />
                  <span className="text-muted-foreground text-sm">
                    {group.length} {group.length === 1 ? 'building' : 'buildings'} ·{' '}
                    {money(group.reduce((s, b) => s + (b.monthlyValue ?? 0), 0))}/mo
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle>Buildings</SectionTitle>
            <div className="border-border overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-border border-b">
                    <th className="px-2 py-1.5 text-left font-normal">Row</th>
                    <th className="px-2 py-1.5 text-left font-normal">Account</th>
                    <th className="px-2 py-1.5 text-left font-normal">Building</th>
                    <th className="px-2 py-1.5 text-left font-normal">Address</th>
                    <th className="px-2 py-1.5 text-right font-normal">SF</th>
                    <th className="px-2 py-1.5 text-right font-normal">Monthly</th>
                    <th className="px-2 py-1.5 text-left font-normal">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {buildings.map((b) => (
                    <tr key={b.rowNumber} className="border-border border-b align-top">
                      <td className="text-muted-foreground px-2 py-1.5">{b.rowNumber}</td>
                      <td className="px-2 py-1.5">{b.accountName}</td>
                      <td className="px-2 py-1.5">{b.buildingName}</td>
                      <td className="px-2 py-1.5">
                        {[b.addressLine1, b.city, b.state].filter(Boolean).join(', ') || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {b.squareFootage?.toLocaleString('en-US') ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {b.monthlyValue === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          money(b.monthlyValue)
                        )}
                      </td>
                      <td className="text-muted-foreground px-2 py-1.5 text-xs">
                        {b.warnings.join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {skipped.length > 0 && <SkippedList skipped={skipped} />}

          <CommitBar busy={busy} onCommit={handleCommit} onBack={() => setStep('map')}>
            Create {accountGroups.length} accounts and {buildings.length} buildings
          </CommitBar>
        </div>
      )}

      {step === 'preview' && importerKey === 'contacts' && (
        <div className="space-y-6">
          <div className="bg-muted rounded-[3px] p-3 text-sm">
            <strong>{contacts.length} people</strong> ·{' '}
            {contacts.filter((c) => c.looksInternal).length} look internal or vendor ·{' '}
            {skipped.length} {skipped.length === 1 ? 'row' : 'rows'} skipped
          </div>

          <div className="border-border overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-border border-b">
                  <th className="px-2 py-1.5 text-left font-normal">Row</th>
                  <th className="px-2 py-1.5 text-left font-normal">Name</th>
                  <th className="px-2 py-1.5 text-left font-normal">Company</th>
                  <th className="px-2 py-1.5 text-left font-normal">Email</th>
                  <th className="px-2 py-1.5 text-left font-normal">Relationship</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.rowNumber} className="border-border border-b">
                    <td className="text-muted-foreground px-2 py-1.5">{c.rowNumber}</td>
                    <td className="px-2 py-1.5">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-2 py-1.5">{c.companyName ?? '—'}</td>
                    <td className="px-2 py-1.5">{c.email ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      {c.relationship ?? '—'}
                      {c.looksInternal && (
                        <span className="bg-accent text-accent-foreground ml-2 rounded-[3px] px-1.5 py-0.5 text-xs">
                          not a client contact
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {skipped.length > 0 && <SkippedList skipped={skipped} />}

          <CommitBar busy={busy} onCommit={handleCommit} onBack={() => setStep('map')}>
            Create {contacts.length} contacts
          </CommitBar>
        </div>
      )}

      {step === 'done' && result?.ok && (
        <div className="space-y-4">
          <div className="bg-secondary rounded-[3px] p-4">
            <p className="font-medium">Import finished.</p>
            <ul className="text-muted-foreground mt-2 space-y-0.5 text-sm">
              {result.accountsCreated > 0 && <li>{result.accountsCreated} accounts created</li>}
              {result.accountsReused > 0 && (
                <li>{result.accountsReused} rows joined an account that already existed</li>
              )}
              {result.buildingsCreated > 0 && <li>{result.buildingsCreated} buildings created</li>}
              {result.contactsCreated > 0 && <li>{result.contactsCreated} contacts created</li>}
              {result.contactsReused > 0 && (
                <li>{result.contactsReused} contacts already existed and were left alone</li>
              )}
              {result.errors > 0 && (
                <li className="text-destructive">{result.errors} rows failed — see below</li>
              )}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/accounts">See the accounts</Link>
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Import something else
            </Button>
          </div>

          <p className="text-muted-foreground text-sm">
            Not right? Undo it from the list of imports below — that removes everything this
            run created, and nothing else.
          </p>
        </div>
      )}
    </div>
  )
}

function CommitBar({
  busy,
  onCommit,
  onBack,
  children,
}: {
  busy: boolean
  onCommit: () => void
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
      <Button onClick={onCommit} disabled={busy}>
        {busy ? 'Importing…' : children}
      </Button>
      <Button variant="ghost" onClick={onBack} disabled={busy}>
        Back
      </Button>
      <span className="text-muted-foreground text-sm">This can be undone afterwards.</span>
    </div>
  )
}

function SkippedList({ skipped }: { skipped: SkippedRow[] }) {
  return (
    <details>
      <summary className="text-muted-foreground cursor-pointer text-sm">
        {skipped.length} {skipped.length === 1 ? 'row' : 'rows'} skipped
      </summary>
      <ul className="text-muted-foreground mt-2 space-y-0.5 text-sm">
        {skipped.map((s) => (
          <li key={s.rowNumber}>
            Row {s.rowNumber}: {s.reason} {s.raw && <span className="opacity-70">({s.raw})</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

function Steps({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Choose a file' },
    { key: 'map', label: 'Match columns' },
    { key: 'preview', label: 'Check it' },
    { key: 'done', label: 'Done' },
  ]
  const index = steps.findIndex((s) => s.key === current)

  return (
    <ol className="text-muted-foreground mb-6 flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          {i > 0 && <span className="opacity-40">→</span>}
          <span className={i === index ? 'text-foreground font-medium' : i < index ? '' : 'opacity-50'}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    map.set(k, [...(map.get(k) ?? []), item])
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
}
