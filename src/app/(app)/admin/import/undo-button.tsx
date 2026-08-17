'use client'

import { useState } from 'react'

import { rollbackImport } from './actions'
import { Button } from '@/components/ui/button'

/**
 * Two clicks, because this changes records.
 *
 * The two kinds of batch undo very differently and the button has to say which:
 * an import created records and undoing it deletes them, while a gap fill only
 * changed fields on records that already existed and undoing it puts those
 * fields back. Deleting a building because someone filled in its square footage
 * would be the worst bug this app could have.
 */
export function UndoButton({ batchId, isFill }: { batchId: string; isFill?: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  if (error) return <span className="text-destructive text-xs">{error}</span>
  if (note) return <span className="text-muted-foreground text-xs">{note}</span>

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Undo
      </Button>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">
        {isFill
          ? 'Put these fields back the way they were?'
          : 'Delete everything this import created?'}
      </span>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const res = await rollbackImport(batchId)
          setBusy(false)
          if (!res.ok) return setError(res.error ?? 'Could not undo that.')
          // A field somebody edited by hand since the import is left as they
          // edited it, so say so rather than let them find out later.
          setNote(res.note ?? 'Undone.')
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
