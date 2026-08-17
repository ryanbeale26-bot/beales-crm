'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

import {
  commitActiveClients,
  commitActivities,
  commitContacts,
  commitFill,
  commitPipeline,
  commitWonLost,
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
import type { ProposedActivity } from '@/lib/import/activities'
import type { ProposedDeal } from '@/lib/import/pipeline'
import type { ProposedOutcome } from '@/lib/import/won-lost'
import type { ProposedBuilding, ProposedContact, SkippedRow } from '@/lib/import/active-clients'
import type { ProposedFill } from '@/lib/import/fill'
import type { GapScope } from '@/lib/gaps'
import { date, money } from '@/lib/format'

type Step = 'upload' | 'map' | 'preview' | 'done'

export function Importer() {
  const fileRef = useRef<HTMLInputElement>(null)
  // The chosen File is held in state, not read back off the input: the upload
  // step unmounts once we move to mapping, taking the input with it.
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [importerKey, setImporterKey] = useState<ImporterKey>('gap-fill')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<SheetSummary[]>([])
  const [sheetName, setSheetName] = useState('')
  const [mapping, setMapping] = useState<Record<string, number>>({})

  const [buildings, setBuildings] = useState<ProposedBuilding[]>([])
  const [contacts, setContacts] = useState<ProposedContact[]>([])
  const [activities, setActivities] = useState<ProposedActivity[]>([])
  const [deals, setDeals] = useState<ProposedDeal[]>([])
  const [outcomes, setOutcomes] = useState<ProposedOutcome[]>([])
  // Which "Tipped the win" phrases to keep as rankable win reasons. Everything
  // is ticked to begin with; unticking one keeps the sentence on the deal but
  // leaves it out of the report's ranking.
  const [keptWinReasons, setKeptWinReasons] = useState<Set<string>>(new Set())
  const [fills, setFills] = useState<ProposedFill[]>([])
  const [fillScope, setFillScope] = useState<GapScope>('buildings')
  const [ignoredColumns, setIgnoredColumns] = useState<string[]>([])
  const [missingColumns, setMissingColumns] = useState<string[]>([])
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

    // A gap sheet was written by this app, so its headers are already known.
    // Offering to remap them would be friction with no upside, and one more way
    // to write a segment into an owner field.
    if (IMPORTERS[importerKey].skipMapping) {
      await runPreview(chosen, res.selectedSheet, res.mapping)
      return
    }
    setStep('map')
  }

  async function handlePreview() {
    if (!file) return setError('The file was lost — please choose it again.')
    await runPreview(file, sheetName, mapping)
  }

  /**
   * Arguments rather than state, because the skip-mapping path calls this in
   * the same tick as the setState that would have supplied them.
   */
  async function runPreview(
    useFile: File,
    useSheet: string,
    useMapping: Record<string, number>,
  ) {
    setBusy(true)
    setError(null)
    const formData = new FormData()
    formData.set('file', useFile)
    formData.set('importer', importerKey)
    formData.set('sheet', useSheet)
    formData.set('mapping', JSON.stringify(useMapping))

    const res: PreviewResult = await previewImport(formData)
    setBusy(false)

    if (!res.ok) return setError(res.error)
    setBuildings(res.kind === 'active-clients' ? res.buildings : [])
    setContacts(res.kind === 'contacts' ? res.contacts : [])
    setActivities(res.kind === 'activities' ? res.activities : [])
    setDeals(res.kind === 'pipeline' ? res.deals : [])
    setOutcomes(res.kind === 'won-lost' ? res.outcomes : [])
    setFills(res.kind === 'gap-fill' ? res.fills : [])
    setIgnoredColumns(res.kind === 'gap-fill' ? res.ignoredColumns : [])
    setMissingColumns(res.kind === 'gap-fill' ? res.missingColumns : [])
    if (res.kind === 'gap-fill') setFillScope(res.scope)
    if (res.kind === 'won-lost') {
      setKeptWinReasons(
        new Set(res.outcomes.map((o) => o.winNotes).filter((n): n is string => Boolean(n))),
      )
    }
    setSkipped(res.skipped)
    setStep('preview')
  }

  async function handleCommit() {
    setBusy(true)
    setError(null)
    // A switch rather than a chain of ternaries: the old fall-through quietly
    // ran the contacts importer for anything unrecognised.
    let res: CommitResult
    switch (importerKey) {
      case 'active-clients':
        res = await commitActiveClients({ fileName, sheetName, mapping, buildings })
        break
      case 'activities':
        res = await commitActivities({ fileName, sheetName, mapping, activities })
        break
      case 'pipeline':
        res = await commitPipeline({ fileName, sheetName, mapping, deals })
        break
      case 'won-lost':
        res = await commitWonLost({
          fileName,
          sheetName,
          mapping,
          outcomes,
          winReasonNames: [...keptWinReasons],
        })
        break
      case 'gap-fill':
        res = await commitFill({ fileName, scope: fillScope, fills })
        break
      case 'contacts':
        res = await commitContacts({ fileName, sheetName, mapping, contacts })
        break
      default: {
        // ImporterKey is a closed union, so a new importer that forgets a
        // branch fails `npm run typecheck` rather than committing as contacts.
        const never: never = importerKey
        throw new Error(`Unknown importer: ${String(never)}`)
      }
    }
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
      <Steps current={step} skipMapping={def.skipMapping} />

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

      {step === 'preview' && importerKey === 'activities' && (
        <div className="space-y-6">
          <div className="bg-muted rounded-[3px] p-3 text-sm">
            <strong>{activities.length} activities</strong> ·{' '}
            {activities.filter((a) => a.accountId).length} matched to an account ·{' '}
            {activities.filter((a) => !a.typeMatched).length} filed as a Note because the type
            did not match · {skipped.length} {skipped.length === 1 ? 'row' : 'rows'} skipped
          </div>

          <div>
            <SectionTitle>How the types were mapped</SectionTitle>
            <div className="border-border border-t text-sm">
              {typeCounts(activities).map(([name, count]) => (
                <div key={name} className="border-border flex justify-between border-b px-2 py-1.5">
                  <span>{name}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle>First 50 rows</SectionTitle>
            <div className="border-border overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-border border-b">
                    <th className="px-2 py-1.5 text-left font-normal">Row</th>
                    <th className="px-2 py-1.5 text-left font-normal">Date</th>
                    <th className="px-2 py-1.5 text-left font-normal">Type</th>
                    <th className="px-2 py-1.5 text-left font-normal">What happened</th>
                    <th className="px-2 py-1.5 text-left font-normal">Account</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.slice(0, 50).map((a) => (
                    <tr key={a.rowNumber} className="border-border border-b align-top">
                      <td className="text-muted-foreground px-2 py-1.5">{a.rowNumber}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{a.occurredAt ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        {a.typeName}
                        {!a.typeMatched && a.rawType && (
                          <div className="text-muted-foreground text-xs">was: {a.rawType}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{a.subject.slice(0, 90)}</td>
                      <td className="px-2 py-1.5">
                        {a.accountName ?? (
                          <span className="text-muted-foreground">
                            {a.companyName ? `no match: ${a.companyName.slice(0, 40)}` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {activities.length > 50 && (
              <p className="text-muted-foreground mt-2 text-sm">
                Showing 50 of {activities.length}. All of them will be imported.
              </p>
            )}
          </div>

          {skipped.length > 0 && <SkippedList skipped={skipped} />}

          <CommitBar busy={busy} onCommit={handleCommit} onBack={() => setStep('map')}>
            Import {activities.length} activities
          </CommitBar>
        </div>
      )}

      {step === 'preview' && importerKey === 'pipeline' && (
        <div className="space-y-6">
          <div className="bg-muted rounded-[3px] p-3 text-sm">
            <strong>{deals.filter((d) => !d.error).length} deals</strong> ·{' '}
            {money(deals.reduce((sum, d) => sum + (d.monthlyValue ?? 0), 0))}/mo ·{' '}
            {deals.filter((d) => d.accountId).length} matched to an account ·{' '}
            {deals.filter((d) => d.isProjectWork).length} one-off project rows ·{' '}
            {skipped.length} {skipped.length === 1 ? 'row' : 'rows'} skipped
            {deals.some((d) => d.error) && (
              <span className="text-destructive block">
                {deals.filter((d) => d.error).length} rows cannot be imported — their stage is not
                one of the stages on the board. They are listed below and will be recorded as
                errors rather than guessed at.
              </span>
            )}
          </div>

          <div>
            <SectionTitle>How the sources were mapped</SectionTitle>
            <div className="border-border border-t text-sm">
              {sourceCounts(deals).map(([name, count]) => (
                <div key={name} className="border-border flex justify-between border-b px-2 py-1.5">
                  <span>{name}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle>Every deal</SectionTitle>
            <div className="border-border overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-border border-b">
                    <th className="px-2 py-1.5 text-left font-normal">Row</th>
                    <th className="px-2 py-1.5 text-left font-normal">Deal</th>
                    <th className="px-2 py-1.5 text-left font-normal">Stage</th>
                    <th className="px-2 py-1.5 text-left font-normal">Value</th>
                    <th className="px-2 py-1.5 text-left font-normal">Account</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => (
                    <tr key={d.rowNumber} className="border-border border-b align-top">
                      <td className="text-muted-foreground px-2 py-1.5">{d.rowNumber}</td>
                      <td className="px-2 py-1.5">
                        {d.name}
                        {d.warnings.map((w, i) => (
                          <div key={i} className="text-muted-foreground text-xs">
                            {w}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {d.error ? (
                          <span className="text-destructive">{d.error}</span>
                        ) : (
                          d.stageName
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {d.monthlyValue ? `${money(d.monthlyValue)}/mo` : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        {d.accountName ?? <span className="text-muted-foreground">new</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {skipped.length > 0 && <SkippedList skipped={skipped} />}

          <CommitBar busy={busy} onCommit={handleCommit} onBack={() => setStep('map')}>
            Import {deals.filter((d) => !d.error).length} deals
          </CommitBar>
        </div>
      )}

      {step === 'preview' && importerKey === 'won-lost' && (
        <div className="space-y-6">
          <div className="bg-muted rounded-[3px] p-3 text-sm">
            <strong>{outcomes.length} closed deals</strong> · {outcomes.filter((o) => o.won).length}{' '}
            won, {outcomes.filter((o) => !o.won).length} lost ·{' '}
            {outcomes.filter((o) => o.opportunityId).length} update a deal that already exists ·{' '}
            {outcomes.filter((o) => !o.opportunityId).length} will be created ·{' '}
            {skipped.length} {skipped.length === 1 ? 'row' : 'rows'} skipped
            <span className="text-muted-foreground block">
              Undo removes the {outcomes.filter((o) => !o.opportunityId).length} deals this
              creates. The {outcomes.filter((o) => o.opportunityId).length} it only fills in were
              already here, so they are not deleted and keep their close details.
            </span>
            {outcomes.filter((o) => !o.won).length < 5 && (
              <span className="text-muted-foreground block">
                Only {outcomes.filter((o) => !o.won).length} recorded{' '}
                {outcomes.filter((o) => !o.won).length === 1 ? 'loss' : 'losses'} in the whole tab,
                so the loss report will be thin — that is the data, not a bug.
              </span>
            )}
          </div>

          {winNoteOptions(outcomes).length > 0 && (
            <div>
              <SectionTitle>Turn these into win reasons?</SectionTitle>
              <p className="text-muted-foreground mb-2 text-sm">
                Each one becomes a reason you can rank in the pipeline report. Untick anything
                that is a one-off — the sentence still stays on the deal either way.
              </p>
              <div className="border-border border-t text-sm">
                {winNoteOptions(outcomes).map(([phrase, count]) => (
                  <label
                    key={phrase}
                    className="border-border flex items-start gap-2 border-b px-2 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={keptWinReasons.has(phrase)}
                      onChange={(e) =>
                        setKeptWinReasons((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(phrase)
                          else next.delete(phrase)
                          return next
                        })
                      }
                      className="mt-1"
                    />
                    <span className="flex-1">{phrase}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionTitle>Every row</SectionTitle>
            <div className="border-border overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-border border-b">
                    <th className="px-2 py-1.5 text-left font-normal">Row</th>
                    <th className="px-2 py-1.5 text-left font-normal">Company</th>
                    <th className="px-2 py-1.5 text-left font-normal">Outcome</th>
                    <th className="px-2 py-1.5 text-left font-normal">Closed</th>
                    <th className="px-2 py-1.5 text-left font-normal">Lands on</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o) => (
                    <tr key={o.rowNumber} className="border-border border-b align-top">
                      <td className="text-muted-foreground px-2 py-1.5">{o.rowNumber}</td>
                      <td className="px-2 py-1.5">
                        {o.company}
                        {o.warnings.map((w, i) => (
                          <div key={i} className="text-muted-foreground text-xs">
                            {w}
                          </div>
                        ))}
                      </td>
                      <td className="px-2 py-1.5">
                        {o.won ? 'Won' : 'Lost'}
                        {o.competitorName && (
                          <div className="text-muted-foreground text-xs">to {o.competitorName}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {o.closeDate ?? '—'}
                        {o.openedOn && (
                          <div className="text-muted-foreground text-xs">from {o.openedOn}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {o.matchedName ?? <span className="text-muted-foreground">a new deal</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {skipped.length > 0 && <SkippedList skipped={skipped} />}

          <CommitBar busy={busy} onCommit={handleCommit} onBack={() => setStep('map')}>
            Update {outcomes.filter((o) => o.opportunityId).length} and create{' '}
            {outcomes.filter((o) => !o.opportunityId).length}
          </CommitBar>
        </div>
      )}

      {step === 'preview' && importerKey === 'gap-fill' && (
        <GapFillPreview
          scope={fillScope}
          fills={fills}
          skipped={skipped}
          ignoredColumns={ignoredColumns}
          missingColumns={missingColumns}
          busy={busy}
          onCommit={handleCommit}
          onBack={() => window.location.reload()}
        />
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
              {result.activitiesCreated > 0 && (
                <li>{result.activitiesCreated} activities imported</li>
              )}
              {result.contactsCreated > 0 && <li>{result.contactsCreated} contacts created</li>}
              {result.contactsReused > 0 && (
                <li>{result.contactsReused} contacts already existed and were left alone</li>
              )}
              {result.dealsCreated > 0 && <li>{result.dealsCreated} deals created</li>}
              {result.dealsUpdated > 0 && (
                <li>{result.dealsUpdated} existing deals had their close details filled in</li>
              )}
              {(result.recordsUpdated ?? 0) > 0 && (
                <li>
                  {plural(result.recordsUpdated ?? 0, 'record')} updated,{' '}
                  {plural(result.fieldsChanged ?? 0, 'field')} filled in
                </li>
              )}
              {(result.contractValuesSet ?? 0) > 0 && (
                <li>
                  {result.contractValuesSet}{' '}
                  {result.contractValuesSet === 1 ? 'contract value' : 'contract values'} set for
                  the first time
                </li>
              )}
              {result.errors > 0 && (
                <li className="text-destructive">
                  {plural(result.errors, 'row')} failed — see below
                </li>
              )}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={importerKey === 'gap-fill' ? '/dashboard' : '/accounts'}>
                {importerKey === 'gap-fill' ? 'See the numbers' : 'See the accounts'}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Import something else
            </Button>
          </div>

          <p className="text-muted-foreground text-sm">
            {importerKey === 'gap-fill'
              ? 'Not right? Undo it from the list below — that puts every field back the way it was, and leaves alone anything edited by hand since.'
              : 'Not right? Undo it from the list of imports below — that removes everything this run created, and nothing else.'}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The gap-fill preview.
 *
 * One line per record per field, because the whole promise of this screen is
 * that nothing gets committed unread. A change that overwrites something that
 * was already there is separated out and listed first: filling a blank is
 * always safe, replacing a value is the line worth reading twice.
 */
function GapFillPreview({
  scope,
  fills,
  skipped,
  ignoredColumns,
  missingColumns,
  busy,
  onCommit,
  onBack,
}: {
  scope: GapScope
  fills: ProposedFill[]
  skipped: SkippedRow[]
  ignoredColumns: string[]
  missingColumns: string[]
  busy: boolean
  onCommit: () => void
  onBack: () => void
}) {
  const failed = fills.filter((f) => f.error)
  const usable = fills.filter((f) => !f.error && (f.changes.length > 0 || f.contract))
  const unchanged = fills.filter((f) => !f.error && f.changes.length === 0 && !f.contract)

  const fieldCount = usable.reduce((n, f) => n + f.changes.length, 0)
  const overwrites = usable.filter((f) => f.changes.some((c) => c.overwrite))
  const contracts = usable.filter((f) => f.contract)
  const warned = usable.filter((f) => f.warnings.length > 0)

  const noun = scope === 'deals' ? 'open deals' : scope
  const singular = { buildings: 'building', deals: 'open deal', contacts: 'contact', accounts: 'account' }[scope]

  return (
    <div className="space-y-5">
      <div className="bg-muted rounded-[3px] p-3 text-sm">
        <p>
          <strong>{fieldCount}</strong> {fieldCount === 1 ? 'field' : 'fields'} will change across{' '}
          <strong>{usable.length}</strong> {usable.length === 1 ? singular : noun}.
          {contracts.length > 0 && (
            <>
              {' '}
              <strong>{contracts.length}</strong>{' '}
              {contracts.length === 1 ? 'contract value' : 'contract values'} will be set for the
              first time.
            </>
          )}
        </p>
        <p className="text-muted-foreground mt-1">
          {unchanged.length} {unchanged.length === 1 ? 'row is' : 'rows are'} unchanged.
          {failed.length > 0 && (
            <>
              {' '}
              <span className="text-destructive">
                {failed.length} {failed.length === 1 ? 'row has' : 'rows have'} a problem and will
                be skipped.
              </span>
            </>
          )}
        </p>
      </div>

      {(ignoredColumns.length > 0 || missingColumns.length > 0) && (
        <div className="border-border rounded-[3px] border p-3 text-sm">
          {missingColumns.length > 0 && (
            <p>
              This sheet has no <strong>{missingColumns.join(', ')}</strong> column, so{' '}
              {missingColumns.length === 1 ? 'that field' : 'those fields'} will not be filled in.
            </p>
          )}
          {ignoredColumns.length > 0 && (
            <p className="text-muted-foreground mt-1">
              Columns this import does not write: {ignoredColumns.join(', ')}.
            </p>
          )}
        </div>
      )}

      {failed.length > 0 && (
        <div>
          <SectionTitle>Rows that will be skipped</SectionTitle>
          <div className="border-border border-t">
            {failed.map((f) => (
              <div key={f.rowNumber} className="border-border border-b px-2 py-2 text-sm">
                <span className="text-muted-foreground">Row {f.rowNumber}</span>{' '}
                <span className="font-medium">{f.label}</span>
                <div className="text-destructive mt-0.5">{f.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {overwrites.length > 0 && (
        <div>
          <SectionTitle>Changes to values that are already there</SectionTitle>
          <p className="text-muted-foreground mb-2 text-sm">
            These replace something rather than fill a blank. If the sheet is an old download,
            this is where that shows up — read them before committing.
          </p>
          <div className="border-border border-t">
            {overwrites.map((f) => (
              <div key={`o-${f.rowNumber}`} className="border-border border-b px-2 py-2 text-sm">
                <div className="font-medium">{f.label}</div>
                {f.changes
                  .filter((c) => c.overwrite)
                  .map((c) => (
                    <ChangeLine key={c.column} label={c.label} from={c.from} to={c.to} />
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {contracts.length > 0 && (
        <div>
          <SectionTitle>Contract values</SectionTitle>
          <p className="text-muted-foreground mb-2 text-sm">
            Each of these opens the building&rsquo;s first contract period, so it starts counting
            towards MRR from the date shown. A value that starts today shows in the revenue report
            as new business this month; one that is backdated fills in the history that was
            actually there.
          </p>
          <div className="border-border border-t">
            {contracts.map((f) => (
              <div
                key={`c-${f.rowNumber}`}
                className="border-border flex flex-wrap items-baseline justify-between gap-2 border-b px-2 py-2 text-sm"
              >
                <span className="font-medium">{f.label}</span>
                <span className="text-muted-foreground">
                  {money(f.contract!.monthlyValue)} a month, billing from{' '}
                  {date(f.contract!.effectiveDate)}
                  {f.contract!.backdated ? '' : ' — new business this month'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Every change</SectionTitle>
        <div className="border-border border-t">
          {usable.map((f) => (
            <div key={f.rowNumber} className="border-border border-b px-2 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{f.label}</span>
                <span className="text-muted-foreground text-xs">
                  row {f.rowNumber} ·{' '}
                  {f.changes.length + (f.contract ? 1 : 0)}{' '}
                  {f.changes.length + (f.contract ? 1 : 0) === 1 ? 'change' : 'changes'}
                </span>
              </div>
              {f.contract && (
                <ChangeLine
                  label="Monthly value"
                  from=""
                  to={`${money(f.contract.monthlyValue)} from ${date(f.contract.effectiveDate)}`}
                />
              )}
              {f.changes.map((c) => (
                <ChangeLine
                  key={c.column}
                  label={c.label}
                  from={c.from}
                  to={c.to}
                  derived={c.derived}
                />
              ))}
              {f.warnings.map((w) => (
                <div key={w} className="text-muted-foreground mt-0.5 text-xs">
                  {w}
                </div>
              ))}
            </div>
          ))}
        </div>
        {warned.length > 0 && (
          <p className="text-muted-foreground mt-2 text-xs">
            {warned.length} {warned.length === 1 ? 'row has' : 'rows have'} a note above — usually
            an edit to a reference column, which is not saved.
          </p>
        )}
      </div>

      {skipped.length > 0 && <SkippedList skipped={skipped} />}

      <CommitBar busy={busy} onCommit={onCommit} onBack={onBack}>
        Fill in {fieldCount + contracts.length}{' '}
        {fieldCount + contracts.length === 1 ? 'field' : 'fields'}
      </CommitBar>
    </div>
  )
}

/** "1 record" / "2 records", so a summary never reads "1 records updated". */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** was → now, with an empty value shown as a dash rather than nothing. */
function ChangeLine({
  label,
  from,
  to,
  derived,
}: {
  label: string
  from: string
  to: string
  derived?: boolean
}) {
  return (
    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 pl-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-muted-foreground/70 text-xs">{from === '' ? '—' : from}</span>
      <span className="text-muted-foreground/70 text-xs">&rarr;</span>
      <span className="text-xs font-medium">{to}</span>
      {derived && (
        <span className="text-muted-foreground/70 text-xs">(so the hours actually count)</span>
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

function Steps({ current, skipMapping }: { current: Step; skipMapping?: boolean }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Choose a file' },
    // A gap sheet came from this app, so there is nothing to match.
    ...(skipMapping ? [] : [{ key: 'map' as Step, label: 'Match columns' }]),
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

/** How each free-text Source landed, so nothing maps silently. */
function sourceCounts(deals: ProposedDeal[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const d of deals) {
    const key = d.sourceName ?? (d.rawSource ? `Left blank (was "${d.rawSource}")` : 'Left blank')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

/** The distinct "Tipped the win" phrases, biggest first. */
function winNoteOptions(outcomes: ProposedOutcome[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const o of outcomes) {
    if (!o.winNotes) continue
    counts.set(o.winNotes, (counts.get(o.winNotes) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function typeCounts(activities: ProposedActivity[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const a of activities) counts.set(a.typeName, (counts.get(a.typeName) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    map.set(k, [...(map.get(k) ?? []), item])
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
}
