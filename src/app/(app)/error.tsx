'use client'

import Link from 'next/link'

import { Button } from '@/components/ui/button'

/** Catches anything a page throws, so the team sees a sentence rather than a
 *  blank screen — and so Ryan gets something useful to paste when reporting it. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Nothing was lost. Try again, and if it keeps happening send the message below.
      </p>
      <pre className="bg-muted mt-4 overflow-x-auto rounded-lg p-3 text-left text-xs">
        {error.message}
        {error.digest && `\n\nReference: ${error.digest}`}
      </pre>
      <div className="mt-5 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
