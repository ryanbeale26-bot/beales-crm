import { money } from '@/lib/format'

/**
 * Report building blocks. These were local to the pipeline report until six
 * more screens needed them; the originals are lifted here unchanged so nothing
 * drifts apart.
 *
 * A horizontal bar is deliberately a div with a width, not a charting library:
 * almost every chart in this app is a ranked bar, and a 100kb dependency that
 * then needs overriding to look like the rest of the app earns nothing.
 */
export function Bar({
  value,
  max,
  tone = 'navy',
}: {
  value: number
  max: number
  tone?: 'navy' | 'gold' | 'muted'
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-[3px]">
      <div
        className={
          tone === 'gold'
            ? 'bg-brand-gold h-full'
            : tone === 'muted'
              ? 'h-full bg-[rgba(27,58,107,0.25)]'
              : 'bg-primary h-full'
        }
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** A single headline number. Top border, not a box — the page is a document. */
export function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: React.ReactNode
}) {
  return (
    <div className="border-border border-t pt-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold">{value}</p>
      {note && <p className="text-muted-foreground/80 mt-0.5 text-xs">{note}</p>}
    </div>
  )
}

/** A label, a number on the right, and a bar underneath. The report's row. */
export function BarRow({
  label,
  meta,
  value,
  max,
  tone = 'navy',
}: {
  label: React.ReactNode
  meta?: React.ReactNode
  value: number
  max: number
  tone?: 'navy' | 'gold' | 'muted'
}) {
  return (
    <div className="border-border border-b px-2 py-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        {meta && <span className="text-muted-foreground shrink-0 text-sm">{meta}</span>}
      </div>
      <div className="mt-1.5">
        <Bar value={value} max={max} tone={tone} />
      </div>
    </div>
  )
}

/**
 * A number that is smaller than the truth, said out loud.
 *
 * Most of the portfolio has no contract figure and most open deals have no
 * price, so nearly every total in this app is understated. The team has never
 * used a CRM: a number they later discover was wrong costs more trust than a
 * number that admitted its own gap.
 */
export function Coverage({
  have,
  total,
  noun,
}: {
  have: number
  total: number
  noun: string
}) {
  if (total === 0) return null
  if (have >= total) {
    return (
      <span className="text-muted-foreground/80 text-xs">
        All {total} {noun} counted
      </span>
    )
  }
  return (
    <span className="text-muted-foreground/80 text-xs">
      {have} of {total} {noun} priced — this total is understated
    </span>
  )
}

/**
 * A month series as vertical columns.
 *
 * Still CSS, still no library. Revenue over time is the one place in this app
 * where the shape matters more than the ranking, and 27 thin columns read as a
 * shape in a way 27 stacked horizontal bars never would.
 */
export function MonthBars({
  points,
  height = 120,
}: {
  points: { month: string; label: string; value: number }[]
  height?: number
}) {
  const max = Math.max(...points.map((p) => p.value), 1)
  return (
    <div>
      <div
        className="border-border flex items-end gap-px border-b"
        style={{ height }}
        role="img"
        aria-label={`Monthly revenue from ${points[0]?.label} to ${points.at(-1)?.label}`}
      >
        {points.map((p) => (
          <div
            key={p.month}
            className="bg-primary min-h-px flex-1 rounded-t-[2px]"
            style={{ height: `${Math.max((p.value / max) * 100, p.value > 0 ? 1 : 0)}%` }}
            title={`${p.label} — ${money(p.value)}`}
          />
        ))}
      </div>
      <div className="text-muted-foreground mt-1 flex justify-between text-xs">
        <span>{points[0]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </div>
  )
}

/** A change in money, signed and coloured. Gold never carries text, so navy. */
export function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground">no change</span>
  return (
    <span className={value > 0 ? 'text-primary font-medium' : 'text-destructive font-medium'}>
      {value > 0 ? '+' : '−'}
      {money(Math.abs(value))}
    </span>
  )
}

/**
 * The traffic light from the spreadsheet's client-health summary.
 *
 * These three are the one place in the app that uses colour semantically
 * rather than from the brand palette — a green/amber/red health signal is what
 * the team already reads, and navy-on-navy cannot carry that meaning. It stays
 * within the rules because they are dots, never text: the label sits beside
 * them in normal charcoal, so nothing depends on seeing the colour.
 */
const HEALTH_DOT: Record<string, string> = {
  healthy: '#2E7D52',
  needs_attention: 'var(--brand-gold)',
  at_risk: '#B3261E',
}

export function HealthDot({ score }: { score: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{
        backgroundColor: score ? (HEALTH_DOT[score] ?? 'transparent') : 'transparent',
        boxShadow: score ? undefined : 'inset 0 0 0 1px rgba(27,58,107,0.35)',
      }}
    />
  )
}

/** Count the rows in a list by a key, biggest first. */
export function rank<T>(rows: T[], key: (row: T) => string | null) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const k = key(row)
    if (!k) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

/** Downloads the report as it appears on screen. A plain link, not a button. */
export function ExportLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="row-hover border-border rounded-[3px] border px-2 py-1 text-sm"
      download
    >
      Export CSV
    </a>
  )
}
