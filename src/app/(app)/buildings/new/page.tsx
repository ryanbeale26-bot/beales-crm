import { BuildingForm } from '@/app/(app)/buildings/building-form'
import { PageHeader } from '@/components/page-header'
import { getOwners, getPropertyTypes, getServiceTypes } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

export default async function NewBuildingPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>
}) {
  const { account: accountId } = await searchParams
  const supabase = await createClient()

  const [{ data: accounts }, owners, propertyTypes, serviceTypes] = await Promise.all([
    supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
    getOwners(),
    getPropertyTypes(),
    getServiceTypes(),
  ])

  return (
    <div>
      <PageHeader
        title="New building"
        backHref={accountId ? `/accounts/${accountId}?tab=Buildings` : '/buildings'}
        backLabel={accountId ? 'Account' : 'Buildings'}
      />
      <BuildingForm
        accountId={accountId}
        accounts={accounts ?? []}
        owners={owners}
        propertyTypes={propertyTypes}
        serviceTypes={serviceTypes}
      />
    </div>
  )
}
