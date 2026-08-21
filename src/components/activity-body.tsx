import { excerpt } from '@/lib/format'

/**
 * An activity's note, with a disclosure when it is long.
 *
 * Shared rather than copied. This markup existed twice, byte for byte, in the
 * activity timeline and the activity feed; Granola notes are now stored whole,
 * so both would have had to grow the same clamp on the same day, and the two
 * would have drifted the first time only one of them was touched.
 *
 * Nothing is put out of reach. There is no activity detail page in this app, so
 * this paragraph is the ONLY place a note can be read — a clamp without an
 * expander would store 1,400 characters and show 240 of them for ever. The
 * search on /activity is a Postgres ilike over the whole body, so a term hiding
 * in the collapsed part still finds its row; the row simply arrives shut.
 */
export function ActivityBody({ body }: { body: string | null }) {
  if (!body) return null

  const opening = excerpt(body)
  if (!opening) {
    return <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{body}</p>
  }

  return (
    <details className="group mt-1">
      {/* The excerpt goes in the summary and the note goes below it, rather
          than the whole note going in the summary under a line-clamp. A
          summary's text content is its accessible name, so that version would
          have a screen reader announce the entire note as the button's label,
          every time, with no way past it. This way the label is bounded, and
          the copy people select and paste is an ordinary paragraph that does
          not toggle when clicked.

          No disclosure triangle: a marker on a summary this tall hangs off the
          first line and indents the whole block, which breaks the row's
          hairline. The underlined words carry the affordance instead. */}
      <summary className="text-muted-foreground cursor-pointer list-none text-sm whitespace-pre-wrap [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">
          {opening} <span className="underline">Show all</span>
        </span>
        <span className="hidden underline group-open:inline">Show less</span>
      </summary>
      <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{body}</p>
    </details>
  )
}
