/**
 * The dashboard's own skeleton. It is the heaviest screen in the app and the
 * first thing anybody sees after signing in, so it is worth showing its actual
 * shape — two personal panels over six tiles — rather than the generic list.
 *
 * Deliberately no longer says how many queries it runs. It said "eight" from
 * the day it was written and the page was on twelve before anybody noticed,
 * which is the same dead number this app refuses on every screen it renders.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the dashboard…</span>
      <div className="bg-muted mb-6 h-10 w-56 rounded-[3px]" />

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="bg-muted mb-3 h-4 w-32 rounded-[3px]" />
            <div className="bg-muted h-16 rounded-[3px]" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <div className="bg-muted mb-2 h-3 w-24 rounded-[3px]" />
            <div className="bg-muted h-7 w-20 rounded-[3px]" />
          </div>
        ))}
      </div>
    </div>
  )
}
