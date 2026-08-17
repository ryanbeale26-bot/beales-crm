import { SuggestionList } from './suggestion-list'
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { fetchReview, fetchUnknownSenders } from '@/lib/ingest/review'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Review' }

export default async function ReviewPage() {
  const supabase = await createClient()

  const [review, unknown] = await Promise.all([
    fetchReview(supabase),
    fetchUnknownSenders(supabase),
  ])

  if (review.error) throw new Error(review.error)

  return (
    <div>
      <PageHeader
        title="Review"
        subtitle={
          <>
            Things the nightly job noticed but would not act on by itself. Applying a batch can be
            undone from the bottom of the Import page. Ignoring this screen costs nothing —
            everything here expires on its own.
          </>
        }
      />

      {review.suggestions.length === 0 ? (
        <EmptyState title="Nothing waiting.">
          The nightly job links what it is certain about and leaves the rest here. An empty screen
          means it was certain about everything it saw.
        </EmptyState>
      ) : (
        <>
          {review.total > review.suggestions.length && (
            // Never let a page imply it is showing everything. Applying the
            // batch reveals the next one.
            <p className="text-muted-foreground mb-2 text-sm">
              Showing the newest {review.suggestions.length} of {review.total}. Deal with these and
              the rest appear.
            </p>
          )}
          <SuggestionList suggestions={review.suggestions} />
        </>
      )}

      {unknown.length > 0 && (
        <>
          <SectionTitle aside={<span className="text-muted-foreground text-sm">Not read</span>}>
            People writing in from somewhere we don&apos;t know
          </SectionTitle>
          <p className="text-muted-foreground mb-2 text-sm">
            Their messages were left alone — no subject and no text reached the database, only the
            address. If one of these is a client, map their domain to an account on the{' '}
            <a className="underline" href="/admin/ingest">
              ingest settings
            </a>{' '}
            page and the next message from them will be logged properly.
          </p>
          <div className="border-border border-t">
            {unknown.map((sender) => (
              <div
                key={sender.address}
                className="border-border flex items-center justify-between gap-4 border-b px-2 py-2 text-sm"
              >
                <span className="truncate">{sender.address}</span>
                <span className="text-muted-foreground shrink-0">
                  {new Date(sender.lastSeen).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
