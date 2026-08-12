export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-slate-600">
        Scaffold is working. The real dashboard arrives in Phase 5, built to mirror the
        <span className="whitespace-nowrap"> 0-Dashboard </span>
        tab of the spreadsheet.
      </p>

      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-6">
        <p className="text-sm font-medium text-slate-900">Next up — Phase 1a</p>
        <p className="mt-1 text-sm text-slate-600">
          Full database schema, the five user accounts, and accounts / buildings / contacts
          screens.
        </p>
      </div>
    </div>
  )
}
