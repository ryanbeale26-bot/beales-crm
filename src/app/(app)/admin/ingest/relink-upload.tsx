'use client'

import { useRef, useState } from 'react'

import { proposeRelink } from './actions'
import { Button } from '@/components/ui/button'

type Result = Awaited<ReturnType<typeof proposeRelink>>

/**
 * Re-attaching the activities that arrived linked to nothing.
 *
 * Upload the same workbook the Activity Log was imported from. The company each
 * activity was filed under is still in that file and nowhere in the database,
 * which is the whole reason this needs a file rather than a button.
 */
export function RelinkUpload() {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv"
          className="text-sm"
          onChange={() => setResult(null)}
        />
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            const file = input.current?.files?.[0]
            if (!file) return setResult({ ok: false, error: 'Choose the workbook first.' })
            setBusy(true)
            const form = new FormData()
            form.set('file', file)
            setResult(await proposeRelink(form))
            setBusy(false)
          }}
        >
          {busy ? 'Reading…' : 'Find the links'}
        </Button>
      </div>

      {result && !result.ok && <p className="text-destructive mt-2 text-sm">{result.error}</p>}

      {result?.ok && (
        <div className="mt-3 text-sm">
          <p>
            {result.matched} of {result.orphans} unattached activities match a deal by name.{' '}
            {result.written === 0
              ? 'All of them have been proposed before — nothing new was added.'
              : `${result.written} are waiting on the Review page.`}
          </p>

          {result.unmatched && result.unmatched.length > 0 && (
            <details className="mt-2">
              <summary className="text-muted-foreground cursor-pointer">
                What still matches nothing
              </summary>
              <p className="text-muted-foreground mt-1">
                These company names are in the spreadsheet but are not the name of any account,
                building or deal. Most are vendors, one-offs, or spelled differently — they need a
                person, not a matcher.
              </p>
              <ul className="text-muted-foreground mt-1.5 space-y-0.5">
                {result.unmatched.map((row) => (
                  <li key={row.company}>
                    {row.company} <span className="opacity-70">× {row.count}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
