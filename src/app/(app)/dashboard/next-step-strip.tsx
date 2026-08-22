'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { setNextStepStatus } from './actions'
import { Button } from '@/components/ui/button'
import { ago } from '@/lib/format'
import type { NextStep } from '@/lib/ingest/next-steps'

/**
 * The strip at the top of the dashboard: what slipped, what is on today, and
 * what is coming — with a way to close each line.
 *
 * The whole box is one client component rather than a server list with a button
 * island per row, because the headings carry counts and a count that disagrees
 * with the rows underneath it is worse than no count at all. Holding the rows
 * and their counts in one place means they cannot drift. The policy — which
 * sections are allowed to appear — stays in page.tsx and arrives as props.
 *
 * A closed row STAYS IN PLACE, muted, with an Undo, instead of vanishing. Three
 * reasons: nothing jumps under the cursor mid-tap; the counts stay true to what
 * is on screen; and a mis-tapped Dismiss is recoverable, which it was not
 * before this existed — the only rows ever closed were closed by hand in the
 * Supabase SQL editor.
 */

type Closed = 'done' | 'dismissed'

/**
 * "Thu 27 Aug", or "Thu 27 Aug, 7:00 AM" when there is a real time on it.
 *
 * No year, deliberately: nothing in Coming up is more than a few weeks out and
 * "2026" at text-xs is noise. Today's rows show the time alone, because the day
 * is the heading; overdue rows show how late they are, because that is the
 * question an overdue row actually raises — and `ago()` puts the year back on
 * anything older than a month, which is exactly where it starts mattering.
 */
function whenLabel(step: NextStep): string {
  if (!step.dueAt) return 'no date'
  const at = new Date(step.dueAt)
  const day = at.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  if (step.allDay) return day
  return `${day}, ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function timeLabel(step: NextStep): string {
  if (step.allDay || !step.dueAt) return 'all day'
  return new Date(step.dueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function overdueLabel(step: NextStep): string {
  return step.dueAt ? ago(step.dueAt) : 'no date'
}

/**
 * A meeting the calendar has stopped offering.
 *
 * The two are worded differently because they are not equally certain.
 * `cancelled` is a fact Graph stated — it returned the event marked cancelled —
 * so it can name Outlook. `absent` is an inference from three complete calendar
 * windows in a row not holding it, so it says only what we can see: it is not
 * there any more.
 *
 * Gold FILL with navy on top, never gold text: gold is 1.9:1 on white and fails
 * every accessibility bar as type. Same treatment as the Review count in the
 * sidebar.
 */
function VanishedTag({ vanished }: { vanished: 'cancelled' | 'absent' }) {
  return (
    <span className="bg-brand-gold text-primary shrink-0 rounded-[3px] px-1.5 py-px text-[11px] font-semibold">
      {vanished === 'cancelled' ? 'Cancelled in Outlook' : 'No longer on the calendar'}
    </span>
  )
}

/**
 * One line of the strip. Shared by all three sections so they cannot drift
 * apart; only the label differs.
 *
 * The label sits on the SECOND line beside the account, not on the right. At
 * 375px the row has about 295px to spend, two buttons take 121px of it, and
 * "Thu 27 Aug, 7:00 AM" on the right would leave the title almost nothing —
 * so the right-hand side belongs to the controls alone.
 */
function StepRow({
  step,
  when,
  closed,
  busy,
  onAct,
}: {
  step: NextStep
  when: string
  closed: Closed | null
  busy: boolean
  onAct: (id: string, status: 'open' | Closed) => void
}) {
  const place = step.accountId ? (
    <Link href={`/accounts/${step.accountId}`} className="underline">
      {step.accountName}
    </Link>
  ) : (
    (step.accountName ?? step.contactName)
  )

  return (
    <div className="border-border flex items-center justify-between gap-2 border-b px-1 py-1.5 last:border-b-0">
      <div className="min-w-0">
        {/* A block, not the inline span this used to be: `truncate` sets
            overflow:hidden, which an inline element ignores — so a long title
            pushed the controls off a narrow screen instead of ellipsing. */}
        <p className={`truncate text-sm font-medium ${closed ? 'text-muted-foreground' : ''}`}>
          {step.title}
        </p>
        {/* The tag rides the SECOND line beside the date and account, because
            the right-hand side belongs to the two buttons: at 375px the row has
            about 295px and they take 121px of it. `flex-wrap` so a long account
            name pushes the tag onto its own line rather than off the screen,
            and `min-w-0` on the text so it still ellipses. */}
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
          <span className="min-w-0 truncate">
            {when}
            {place && <> · {place}</>}
          </span>
          {step.vanished && !closed && <VanishedTag vanished={step.vanished} />}
        </div>
      </div>

      {closed ? (
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-muted-foreground text-xs">
            {closed === 'done' ? 'Marked done' : 'Dismissed'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAct(step.id, 'open')}
          >
            Undo
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAct(step.id, 'done')}>
            Done
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAct(step.id, 'dismissed')}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}

/** A heading and its rows. `first:mt-0` rather than a prop: a section that is
 *  not rendered leaves no node behind, so the first one on screen is genuinely
 *  the first child. */
function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside && <span className="text-muted-foreground text-xs">{aside}</span>}
      </div>
      <div className="border-border border-t">{children}</div>
    </div>
  )
}

export function NextStepStrip({
  overdue,
  overdueTotal,
  today,
  matched,
  upcoming,
  showUpcoming,
  waiting,
  readError,
}: {
  overdue: NextStep[]
  overdueTotal: number
  today: NextStep[]
  matched: number
  upcoming: NextStep[]
  showUpcoming: boolean
  waiting: number
  /** A section that failed to LOAD, as opposed to a section with nothing in it.
   *  All three readers have always returned this and nothing has ever rendered
   *  it, so a broken query looked exactly like a quiet week. */
  readError?: string | null
}) {
  const router = useRouter()
  const [closed, setClosed] = useState<Record<string, Closed>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(id: string, status: 'open' | Closed) {
    setBusy(id)
    setError(null)

    const result = await setNextStepStatus(id, status)

    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }

    setClosed((current) => {
      const next = { ...current }
      if (status === 'open') delete next[id]
      else next[id] = status
      return next
    })
  }

  function rows(steps: NextStep[], when: (step: NextStep) => string) {
    return steps.map((step) => (
      <StepRow
        key={step.id}
        step={step}
        when={when(step)}
        closed={closed[step.id] ?? null}
        busy={busy === step.id}
        onAct={act}
      />
    ))
  }

  const hasOverdue = overdue.length > 0
  const hasToday = today.length > 0
  // The next five are only a refresh away, but taking that refresh
  // automatically would delete the Undo on the five you just closed. So it is
  // offered, and only once there is nothing left on screen to undo into.
  const overdueCleared = hasOverdue && overdue.every((step) => closed[step.id])
  const moreOverdue = overdueTotal - overdue.length

  // It renders only when there is something to say. Four of the five people
  // have never signed in, and a permanently empty strip at the top of the first
  // screen they ever see is worse than no strip.
  //
  // A read error counts as something to say: the whole point of surfacing it is
  // the case where nothing loaded, so returning null on it would swallow it
  // exactly where it matters most.
  if (!hasOverdue && !hasToday && !showUpcoming && waiting === 0 && !readError) return null

  return (
    <div className="border-border mb-8 rounded-[3px] border p-3">
      {/*
        What slipped. Unlike Coming up, this is NOT gated on today being empty:
        the day you have five meetings is exactly the day yesterday's gets
        forgotten. It cannot become permanent furniture either, because it
        drains — closing what is on screen brings the next five within reach.
      */}
      {hasOverdue && (
        <Section
          title="Still open"
          aside={
            moreOverdue > 0
              ? `Showing ${overdue.length} of ${overdueTotal}`
              : `${overdueTotal} from before today`
          }
        >
          {rows(overdue, overdueLabel)}
          {overdueCleared && moreOverdue > 0 && (
            <p className="text-muted-foreground px-1 py-1.5 text-xs">
              {moreOverdue} more still open.{' '}
              <button type="button" className="underline" onClick={() => router.refresh()}>
                Show the next {Math.min(moreOverdue, overdue.length)}
              </button>
            </p>
          )}
        </Section>
      )}

      {/*
        Today. This is the half of Ryan's old spreadsheet dashboard that rows
        18–25 promised and never delivered — "Meetings Today" and "Client
        Matches", which were never two things: the second is how many of the
        first belong to a client we know.
      */}
      {hasToday && (
        <Section title="Today" aside={`${matched} of ${today.length} with a client we know`}>
          {rows(today, timeLabel)}
        </Section>
      )}

      {/*
        Nothing on today and nothing overdue, so the next few things instead.

        Until 2026-08-21 fetchUpcomingNextSteps() was written, exported and
        called from nowhere, which meant NO screen anywhere showed a next step
        before the morning it happened. A meeting six days out was invisible —
        which is how four wrong next steps for one weekly series sat on the
        dashboard unnoticed. It stays the fallback rather than a fourth panel,
        for the same reason it always was: the strip has to stay short.
      */}
      {showUpcoming && (
        <Section title="Coming up" aside="Nothing on today">
          {rows(upcoming, whenLabel)}
        </Section>
      )}

      {waiting > 0 && (
        <p
          className={
            hasOverdue || hasToday || showUpcoming
              ? 'text-muted-foreground mt-2.5 text-sm'
              : 'text-muted-foreground text-sm'
          }
        >
          The nightly job left {waiting} {waiting === 1 ? 'thing' : 'things'} it would not act on
          by itself.{' '}
          <Link href="/review" className="underline">
            Have a look
          </Link>{' '}
          — or don&apos;t; they expire on their own.
        </p>
      )}

      {readError && (
        <p className="text-destructive text-sm" role="alert">
          Could not load your next steps: {readError}
        </p>
      )}

      {error && (
        <p className="text-destructive mt-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
