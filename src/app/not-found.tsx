import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

/**
 * The branded 404.
 *
 * Eight pages call `notFound()` — every detail and edit page — and until now
 * every one of them landed on Next's own default: black Helvetica on white,
 * outside the app, with no way back. This lives at the root rather than inside
 * `(app)` so an unmatched URL gets it too, which means it cannot use the shell
 * (the shell needs a session) and carries its own way home instead.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <Image
        src="/beales-logo.png"
        alt="Beale's LLC"
        width={2000}
        height={1489}
        priority
        className="mb-6 h-auto w-[150px]"
      />
      <h1 className="page-title text-2xl">Not found</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        This page does not exist, or the record was archived. Nothing is broken.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/buildings">Buildings</Link>
        </Button>
      </div>
    </main>
  )
}
