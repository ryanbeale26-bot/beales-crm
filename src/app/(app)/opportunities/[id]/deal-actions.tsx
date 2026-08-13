'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { unlinkConvertedBuilding } from '@/app/(app)/opportunities/actions'
import { CloseDealDialog, type Reference } from '@/app/(app)/opportunities/close-deal-dialog'
import { Button } from '@/components/ui/button'

/**
 * The buttons on a closed deal's page. Everything they open is the same dialog
 * the board uses after a drag, so there is one place that captures why a deal
 * was won or lost.
 */
export function DealActions({
  opportunityId,
  dealName,
  mode,
  converted,
  lossReasons,
  competitors,
  winReasons,
}: {
  opportunityId: string
  dealName: string
  mode: 'won' | 'lost'
  converted: boolean
  lossReasons: Reference[]
  competitors: Reference[]
  winReasons: Reference[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function unlink() {
    setError(null)
    startTransition(async () => {
      const result = await unlinkConvertedBuilding(opportunityId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {mode === 'won' ? (converted ? 'Edit why we won' : 'Add the building') : 'Edit why we lost'}
      </Button>

      {mode === 'won' && converted && (
        <Button variant="ghost" onClick={unlink} disabled={pending}>
          {pending ? 'Unlinking…' : 'Unlink building'}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-destructive w-full text-sm">
          {error}
        </p>
      )}

      {open && (
        <CloseDealDialog
          opportunityId={opportunityId}
          dealName={dealName}
          mode={mode}
          lossReasons={lossReasons}
          competitors={competitors}
          winReasons={winReasons}
          onClose={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
