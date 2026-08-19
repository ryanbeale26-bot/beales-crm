/**
 * Shown while a page's queries run.
 *
 * Every screen in this app is server-rendered, and several run eight or more
 * queries — so on a phone, on a car park's worth of signal, a tap used to do
 * nothing visible until the whole page arrived. This is one file covering the
 * whole group; a route with a heavier load can add its own beside its page.
 *
 * Deliberately a shape rather than a spinner: the page appears to be arriving
 * rather than to be stuck.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="bg-muted mb-6 h-10 w-64 rounded-[3px]" />
      <div className="border-border border-t">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-border flex items-center gap-3 border-b px-2 py-3">
            <div className="bg-muted h-4 flex-1 rounded-[3px]" style={{ maxWidth: `${70 - i * 6}%` }} />
            <div className="bg-muted h-4 w-16 rounded-[3px]" />
          </div>
        ))}
      </div>
    </div>
  )
}
