import { notFound } from 'next/navigation'

import { BuildingForm } from '@/app/(app)/buildings/building-form'
import { PageHeader } from '@/components/page-header'
import { getOwners, getPropertyTypes, getServiceTypes } from '@/lib/reference'
import { fetchSiteOptions } from '@/lib/sites'
import { createClient } from '@/lib/supabase/server'

export default async function EditBuildingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: building },
    { data: accounts },
    owners,
    propertyTypes,
    serviceTypes,
    { data: value },
    { data: chosenServices },
    sites,
  ] = await Promise.all([
    supabase.from('buildings').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
    getOwners(),
    getPropertyTypes(),
    getServiceTypes(),
    supabase
      .from('v_building_current_value')
      .select('monthly_value')
      .eq('building_id', id)
      .maybeSingle(),
    supabase.from('building_services').select('service_type_id').eq('building_id', id),
    fetchSiteOptions(supabase),
  ])

  if (!building) notFound()

  return (
    <div>
      <PageHeader
        title={`Edit ${building.name}`}
        backHref={`/buildings/${id}`}
        backLabel={building.name}
      />
      <BuildingForm
        building={building}
        accountId={building.account_id}
        accounts={accounts ?? []}
        owners={owners}
        propertyTypes={propertyTypes}
        serviceTypes={serviceTypes}
        selectedServiceTypeIds={(chosenServices ?? []).map((s) => s.service_type_id)}
        currentMonthlyValue={value?.monthly_value ? Number(value.monthly_value) : null}
        sites={sites}
      />
    </div>
  )
}
