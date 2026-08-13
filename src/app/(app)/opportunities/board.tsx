'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { moveOpportunityStage } from '@/app/(app)/opportunities/actions'
import { CloseDealDialog, type Reference } from '@/app/(app)/opportunities/close-deal-dialog'
import { Select } from '@/components/form-field'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

export type BoardStage = {
  id: string
  name: string
  probability: number
  is_won: boolean
  is_lost: boolean
}

export type BoardDeal = {
  id: string
  name: string
  stage_id: string
  monthly_value: number | null
  annual_value: number | null
  expected_close_date: string | null
  account_name: string | null
  owner_name: string | null
}

/**
 * The pipeline board.
 *
 * Drag is a grip on each card rather than the whole card, so the card can stay a
 * link — clicking a deal opens it, and there is no 200ms guess about whether a
 * press was a click or the start of a drag.
 *
 * Below `md` the columns are gone entirely and this renders a grouped list with
 * a stage dropdown on each row. Eight columns on a phone is not a board, it is a
 * horizontal scroll with one card visible, and the people using this are often
 * standing in a car park.
 */
export function PipelineBoard({
  stages,
  deals: initialDeals,
  lossReasons,
  competitors,
  winReasons,
}: {
  stages: BoardStage[]
  deals: BoardDeal[]
  lossReasons: Reference[]
  competitors: Reference[]
  winReasons: Reference[]
}) {
  const router = useRouter()
  const [deals, setDeals] = useState(initialDeals)
  const [dragging, setDragging] = useState<BoardDeal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [closing, setClosing] = useState<{
    id: string
    name: string
    mode: 'won' | 'lost'
  } | null>(null)

  // The board keeps its own copy so a drag lands instantly, but the server is
  // still the authority: when it sends a new set — after a refresh, an import,
  // or somebody else moving a card — that wins. Adjusted during render rather
  // than in an effect, which is React's own answer to "reset state when a prop
  // changes" and avoids rendering the stale list for a frame first.
  const [serverDeals, setServerDeals] = useState(initialDeals)
  if (serverDeals !== initialDeals) {
    setServerDeals(initialDeals)
    setDeals(initialDeals)
  }

  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so the grip can still be
    // tapped and focused without the card leaping.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function move(dealId: string, stageId: string) {
    const deal = deals.find((d) => d.id === dealId)
    if (!deal || deal.stage_id === stageId) return

    const previousStageId = deal.stage_id
    setError(null)
    // Move it on screen first. The write is one column update and almost always
    // succeeds; putting the card back is the rare path.
    setDeals((current) =>
      current.map((d) => (d.id === dealId ? { ...d, stage_id: stageId } : d)),
    )

    startTransition(async () => {
      const result = await moveOpportunityStage({ opportunityId: dealId, stageId })
      if (!result.ok) {
        setDeals((current) =>
          current.map((d) => (d.id === dealId ? { ...d, stage_id: previousStageId } : d)),
        )
        setError(result.error)
        return
      }
      if (result.isWon || result.isLost) {
        setClosing({ id: deal.id, name: deal.name, mode: result.isWon ? 'won' : 'lost' })
      }
      router.refresh()
    })
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(deals.find((d) => d.id === event.active.id) ?? null)
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null)
    const stageId = event.over?.id
    if (typeof stageId === 'string') move(String(event.active.id), stageId)
  }

  const byStage = (stageId: string) => deals.filter((d) => d.stage_id === stageId)

  return (
    <>
      {error && (
        <p role="alert" className="bg-destructive/10 text-destructive mb-4 rounded-[3px] px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* Desktop: the board */}
      <div className="hidden md:block">
        {/* A fixed id, because dnd-kit otherwise numbers its generated
            aria-describedby from a counter that starts fresh on the client and
            so never matches the server's — which React reports as a hydration
            failure on every load of this page. */}
        <DndContext
          id="pipeline-board"
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-4">
            {stages.map((stage) => (
              <Column key={stage.id} stage={stage} deals={byStage(stage.id)} />
            ))}
          </div>

          <DragOverlay>
            {dragging ? (
              <div className="bg-background w-64 rounded-[3px] border border-[rgba(27,58,107,0.12)] p-2 shadow-md">
                <p className="truncate text-sm font-medium">{dragging.name}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Phone: the same deals, grouped, with a dropdown instead of a drag */}
      <div className="md:hidden">
        {stages.map((stage) => {
          const inStage = byStage(stage.id)
          if (inStage.length === 0) return null
          return (
            <div key={stage.id} className="mb-5">
              <h2 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                {stage.name} · {inStage.length}
              </h2>
              <div className="border-border border-t">
                {inStage.map((deal) => (
                  <div key={deal.id} className="border-border border-b px-2 py-2.5">
                    <Link href={`/opportunities/${deal.id}`} className="block">
                      <span className="font-medium">{deal.name}</span>
                      <span className="text-muted-foreground block text-sm">
                        {[deal.account_name, deal.monthly_value ? `${money(deal.monthly_value)}/mo` : null]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </Link>
                    <Select
                      aria-label={`Stage for ${deal.name}`}
                      value={deal.stage_id}
                      onChange={(e) => move(deal.id, e.target.value)}
                      className="mt-2"
                    >
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {closing && (
        <CloseDealDialog
          opportunityId={closing.id}
          dealName={closing.name}
          mode={closing.mode}
          lossReasons={lossReasons}
          competitors={competitors}
          winReasons={winReasons}
          onClose={() => {
            setClosing(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function Column({ stage, deals }: { stage: BoardStage; deals: BoardDeal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  const annual = deals.reduce((sum, d) => sum + Number(d.annual_value ?? 0), 0)
  const weighted = (annual * stage.probability) / 100

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-64 shrink-0 rounded-[3px] p-2 transition-colors duration-75',
        isOver ? 'bg-[rgba(27,58,107,0.075)]' : 'bg-[rgba(27,58,107,0.028)]',
      )}
    >
      <div className="mb-2 px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-sm font-medium">{stage.name}</h2>
          <span className="text-muted-foreground text-xs">{deals.length}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {stage.probability}%
          {annual > 0 && ` · ${money(weighted)} weighted`}
        </p>
      </div>

      <div className="space-y-1.5">
        {deals.map((deal) => (
          <Card key={deal.id} deal={deal} />
        ))}
        {deals.length === 0 && (
          <p className="text-muted-foreground/60 px-1 py-3 text-xs">Nothing here.</p>
        )}
      </div>
    </div>
  )
}

function Card({ deal }: { deal: BoardDeal }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id })

  return (
    <div
      className={cn(
        'bg-background flex items-start gap-1 rounded-[3px] border border-[rgba(27,58,107,0.12)] p-2',
        isDragging && 'opacity-40',
      )}
    >
      <button
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Move ${deal.name} to another stage`}
        className="text-muted-foreground/50 hover:text-muted-foreground focus-visible:ring-ring shrink-0 cursor-grab rounded-[3px] px-0.5 leading-none focus-visible:ring-2 focus-visible:outline-none"
      >
        ⠿
      </button>

      <Link href={`/opportunities/${deal.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{deal.name}</p>
        {deal.account_name && (
          <p className="text-muted-foreground truncate text-xs">{deal.account_name}</p>
        )}
        <p className="text-muted-foreground mt-1 text-xs">
          {deal.monthly_value ? `${money(deal.monthly_value)}/mo` : 'No value yet'}
          {deal.owner_name ? ` · ${deal.owner_name.split(' ')[0]}` : ''}
        </p>
      </Link>
    </div>
  )
}
