import { CleanupClient } from '@/app/(app)/admin/cleanup/cleanup-client'
import { EmptyState, PageHeader } from '@/components/page-header'
import { getCurrentProfile } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin clean-up.
 *
 * The spreadsheet import created duplicates it had no way to avoid — one row
 * per building with the account encoded in a free-text field — and the only way
 * to resolve them until now was editing rows in the Supabase table editor,
 * where "Delete row" cascades and takes every activity with it. This is the
 * safe version of that job.
 */
export default async function CleanupPage() {
  const profile = await getCurrentProfile()

  if (profile?.role !== 'admin') {
    return (
      <div>
        <PageHeader title="Clean up" />
        <EmptyState title="Only an admin can archive or merge records.">
          Archiving hides a record everywhere at once, so it is deliberately kept to one person.
        </EmptyState>
      </div>
    )
  }

  const supabase = await createClient()

  const [accounts, buildings, periods, activities, contacts, deals, archived] = await Promise.all([
    supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
    supabase
      .from('buildings')
      .select('id, name, address_line1, city, account_id')
      .is('deleted_at', null)
      .order('name'),
    supabase.from('building_contract_periods').select('building_id, monthly_value').is('end_date', null),
    supabase.from('activities').select('account_id, building_id').limit(5000),
    supabase.from('contacts').select('account_id').is('deleted_at', null),
    supabase.from('opportunities').select('account_id').is('deleted_at', null),
    Promise.all([
      supabase.from('accounts').select('id, name, deleted_at').not('deleted_at', 'is', null),
      supabase.from('buildings').select('id, name, deleted_at').not('deleted_at', 'is', null),
    ]),
  ])

  const openValue = new Map<string, number>()
  for (const p of periods.data ?? []) {
    openValue.set(p.building_id, (openValue.get(p.building_id) ?? 0) + Number(p.monthly_value ?? 0))
  }

  const countBy = <T,>(rows: T[] | null, key: (row: T) => string | null) => {
    const out = new Map<string, number>()
    for (const row of rows ?? []) {
      const k = key(row)
      if (k) out.set(k, (out.get(k) ?? 0) + 1)
    }
    return out
  }

  const activityByAccount = countBy(activities.data, (a) => a.account_id)
  const activityByBuilding = countBy(activities.data, (a) => a.building_id)
  const contactByAccount = countBy(contacts.data, (c) => c.account_id)
  const dealByAccount = countBy(deals.data, (d) => d.account_id)
  const buildingByAccount = countBy(buildings.data, (b) => b.account_id)

  const accountRows = (accounts.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    buildings: buildingByAccount.get(a.id) ?? 0,
    contacts: contactByAccount.get(a.id) ?? 0,
    deals: dealByAccount.get(a.id) ?? 0,
    activities: activityByAccount.get(a.id) ?? 0,
    monthlyValue: (buildings.data ?? [])
      .filter((b) => b.account_id === a.id)
      .reduce((sum, b) => sum + (openValue.get(b.id) ?? 0), 0),
  }))

  const buildingRows = (buildings.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    address: [b.address_line1, b.city].filter(Boolean).join(', ') || null,
    accountId: b.account_id,
    accountName: (accounts.data ?? []).find((a) => a.id === b.account_id)?.name ?? '—',
    activities: activityByBuilding.get(b.id) ?? 0,
    monthlyValue: openValue.get(b.id) ?? 0,
  }))

  const [archivedAccounts, archivedBuildings] = archived

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Admin', href: '/admin/import' }]}
        title="Clean up"
      />
      <CleanupClient
        accounts={accountRows}
        buildings={buildingRows}
        archivedAccounts={archivedAccounts.data ?? []}
        archivedBuildings={archivedBuildings.data ?? []}
      />
    </div>
  )
}
