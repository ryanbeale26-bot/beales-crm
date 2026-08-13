'use client'

import { useEffect, useState, useTransition } from 'react'

import {
  convertWonDeal,
  proposeConversion,
  recordLoss,
  recordWin,
  type AccountMatch,
} from '@/app/(app)/opportunities/actions'
import { Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export type Reference = { id: string; name: string }

/**
 * The panel that appears after a deal is dragged into Closed Won or Closed Lost.
 *
 * The deal has already moved by the time this opens, and everything in here is
 * optional. A card that snapped back because someone dismissed a dialog would be
 * worse than a deal missing its loss reason — and this team has never used a CRM,
 * so a form that blocks is a form that stops the board being used.
 */
export function CloseDealDialog({
  opportunityId,
  dealName,
  mode,
  lossReasons,
  competitors,
  winReasons,
  onClose,
}: {
  opportunityId: string
  dealName: string
  mode: 'won' | 'lost'
  lossReasons: Reference[]
  competitors: Reference[]
  winReasons: Reference[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Lost
  const [lossReasonId, setLossReasonId] = useState('')
  const [competitorId, setCompetitorId] = useState('')
  const [newCompetitor, setNewCompetitor] = useState('')
  const [lossNotes, setLossNotes] = useState('')

  // Won
  const [winReasonId, setWinReasonId] = useState('')
  const [winNotes, setWinNotes] = useState('')

  // Won → building
  const [proposal, setProposal] = useState<{
    accountId: string | null
    accountName: string
    buildingName: string
    monthlyValue: number | null
    matches: AccountMatch[]
    alreadyConverted: boolean
  } | null>(null)
  const [makeBuilding, setMakeBuilding] = useState(true)
  const [accountChoice, setAccountChoice] = useState('')
  const [accountName, setAccountName] = useState('')
  const [buildingName, setBuildingName] = useState('')
  const [monthlyValue, setMonthlyValue] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))

  // The account guess is made on the server, using the same name-splitting the
  // importer uses, and shown here before anything is written.
  useEffect(() => {
    if (mode !== 'won') return
    let live = true
    proposeConversion(opportunityId).then((result) => {
      if (!live || !result.ok) return
      setProposal(result)
      setAccountChoice(result.accountId ?? '')
      setAccountName(result.accountName)
      setBuildingName(result.buildingName)
      setMonthlyValue(result.monthlyValue === null ? '' : String(result.monthlyValue))
      if (result.alreadyConverted) setMakeBuilding(false)
    })
    return () => {
      live = false
    }
  }, [mode, opportunityId])

  function save() {
    setError(null)
    startTransition(async () => {
      if (mode === 'lost') {
        const result = await recordLoss({
          opportunityId,
          lossReasonId: lossReasonId || null,
          competitorId: competitorId || null,
          newCompetitorName: competitorId ? null : newCompetitor.trim() || null,
          notes: lossNotes.trim() || null,
        })
        if (!result.ok) {
          setError(result.error)
          return
        }
        onClose()
        return
      }

      const won = await recordWin({
        opportunityId,
        winReasonId: winReasonId || null,
        winNotes: winNotes.trim() || null,
      })
      if (!won.ok) {
        setError(won.error)
        return
      }

      if (makeBuilding && !proposal?.alreadyConverted) {
        const usingExisting = accountChoice !== ''
        if (!usingExisting && !accountName.trim()) {
          setError('Choose an existing account, or give a name for a new one.')
          return
        }
        const converted = await convertWonDeal({
          opportunityId,
          accountId: usingExisting ? accountChoice : null,
          accountName: usingExisting ? null : accountName.trim(),
          buildingName: buildingName.trim() || null,
          monthlyValue: monthlyValue.trim() === '' ? null : Number(monthlyValue.replace(/[$,\s]/g, '')),
          effectiveDate: startDate || null,
        })
        if (!converted.ok) {
          setError(converted.error)
          return
        }
      }

      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 bg-black/25"
        type="button"
      />

      <div className="bg-background relative max-h-[92vh] w-full overflow-y-auto rounded-t-xl p-5 shadow-lg sm:max-w-lg sm:rounded-xl">
        <h2 className="font-medium">{mode === 'won' ? 'Deal won' : 'Deal lost'}</h2>
        <p className="text-muted-foreground mt-0.5 truncate text-sm">{dealName}</p>

        {mode === 'lost' ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-1">
              <label htmlFor="loss-reason" className="text-muted-foreground text-[13px]">
                Why did we lose it?
              </label>
              <Select
                id="loss-reason"
                value={lossReasonId}
                onChange={(e) => setLossReasonId(e.target.value)}
              >
                <option value="">Not sure yet</option>
                {lossReasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label htmlFor="competitor" className="text-muted-foreground text-[13px]">
                Who won it?
              </label>
              <Select
                id="competitor"
                value={competitorId}
                onChange={(e) => setCompetitorId(e.target.value)}
              >
                <option value="">Not listed / don&rsquo;t know</option>
                {competitors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {competitorId === '' && (
                <Input
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  placeholder="Or type a new competitor's name"
                  className="mt-2"
                />
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="loss-notes" className="text-muted-foreground text-[13px]">
                Anything worth remembering
              </label>
              <Textarea
                id="loss-notes"
                rows={3}
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="space-y-1">
              <label htmlFor="win-reason" className="text-muted-foreground text-[13px]">
                What tipped it?
              </label>
              {winReasons.length > 0 ? (
                <Select
                  id="win-reason"
                  value={winReasonId}
                  onChange={(e) => setWinReasonId(e.target.value)}
                >
                  <option value="">Not sure yet</option>
                  {winReasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-muted-foreground/80 text-xs">
                  No win reasons set up yet — add them in Admin, and they&rsquo;ll be ranked in
                  the pipeline report.
                </p>
              )}
              <Textarea
                rows={2}
                value={winNotes}
                onChange={(e) => setWinNotes(e.target.value)}
                placeholder="In your own words — the referral, the price, the incumbent slipping…"
                className="mt-2"
              />
            </div>

            <div className="border-border border-t pt-4">
              {proposal?.alreadyConverted ? (
                <p className="text-muted-foreground text-sm">
                  This deal is already linked to a building, so nothing new will be created.
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={makeBuilding}
                      onChange={(e) => setMakeBuilding(e.target.checked)}
                    />
                    Add this as a building now
                  </label>

                  {makeBuilding && (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1">
                        <label htmlFor="conv-account" className="text-muted-foreground text-[13px]">
                          Account
                        </label>
                        <Select
                          id="conv-account"
                          value={accountChoice}
                          onChange={(e) => setAccountChoice(e.target.value)}
                        >
                          <option value="">Create a new account</option>
                          {(proposal?.matches ?? []).map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </Select>
                        {accountChoice === '' && (
                          <Input
                            value={accountName}
                            onChange={(e) => setAccountName(e.target.value)}
                            placeholder="New account name"
                            className="mt-2"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="conv-building" className="text-muted-foreground text-[13px]">
                          Building
                        </label>
                        <Input
                          id="conv-building"
                          value={buildingName}
                          onChange={(e) => setBuildingName(e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label htmlFor="conv-value" className="text-muted-foreground text-[13px]">
                            Monthly value
                          </label>
                          <Input
                            id="conv-value"
                            value={monthlyValue}
                            onChange={(e) => setMonthlyValue(e.target.value)}
                            inputMode="decimal"
                            placeholder="Leave blank if unknown"
                          />
                        </div>
                        <div className="space-y-1">
                          <label htmlFor="conv-start" className="text-muted-foreground text-[13px]">
                            Starts
                          </label>
                          <Input
                            id="conv-start"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                          />
                        </div>
                      </div>

                      <p className="text-muted-foreground/80 text-xs">
                        The address, square footage and scope carry over from the deal. Nothing is
                        written until you press Save.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="bg-destructive/10 text-destructive mt-4 rounded-[3px] px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  )
}
