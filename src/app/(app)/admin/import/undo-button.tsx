'use client'

import { useState } from 'react'

import { rollbackImport } from './actions'
import { Button } from '@/components/ui/button'

/**
 * Two clicks, because this deletes records. It only removes what that import
 * created — accounts that already existed were reused, not stamped, so they
 * are untouched.
 */
export function UndoButton({ batchId }: { batchId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (error) return <span className="text-destructive text-xs">{error}</span>

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Undo
      </Button>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">Delete everything this import created?</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const res = await rollbackImport(batchId)
          setBusy(false)
          if (!res.ok) setError(res.error ?? 'Could not undo that.')
        }}
      >
        {busy ? 'Undoing…' : 'Yes, undo'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
        Keep
      </Button>
    </span>
  )
}
