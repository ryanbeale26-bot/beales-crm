import Link from 'next/link'

import { EmptyState, PageHeader } from '@/components/page-header'

/**
 * Not found, inside the app.
 *
 * The eight `notFound()` calls all live in this group, so they land here and
 * keep the sidebar — which is the whole point: the fastest thing after a dead
 * link is the nav you were already using. `src/app/not-found.tsx` is the other
 * half, for a URL that matches no route at all and therefore has no shell.
 */
export default function AppNotFound() {
  return (
    <div>
      <PageHeader title="Not found" />
      <EmptyState title="This page does not exist, or the record was archived.">
        Nothing is broken.{' '}
        <Link href="/dashboard" className="underline">
          Back to the dashboard
        </Link>
        , or press &#8984;K to search for it.
      </EmptyState>
    </div>
  )
}
