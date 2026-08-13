import Link from 'next/link'

import { PageHeader } from '@/components/page-header'
import { money } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ count: accounts }, { count: contacts }, { data: values }] = await Promise.all([
    supabase.from('accounts').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('v_building_current_value').select('building_id, monthly_value'),
  ])

  const buildings = values?.length ?? 0
  const mrr = (values ?? []).reduce((sum, v) => sum + Number(v.monthly_value ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="The real dashboard arrives in Phase 5, built to mirror your 0-Dashboard tab."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Accounts" value={accounts ?? 0} href="/accounts" />
        <Tile label="Buildings" value={buildings} href="/buildings" />
        <Tile label="Contacts" value={contacts ?? 0} href="/contacts" />
        <Tile label="Monthly revenue" value={money(mrr)} href="/buildings" />
      </div>

      <div className="border-border mt-10 border-t pt-4">
        <h2 className="text-base font-semibold">Next up — Phase 1b</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The importer: upload the spreadsheet, map the columns, check the account groupings,
          then bring the portfolio across in one go.
        </p>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  href,
}: {
  label: string
  value: React.ReactNode
  href: string
}) {
  return (
    <Link href={href} className="row-hover border-border rounded-[3px] border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </Link>
  )
}
