import { EmployeeForm } from '@/app/(app)/employees/employee-form'
import { PageHeader } from '@/components/page-header'
import { createClient } from '@/lib/supabase/server'

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string }>
}) {
  const { building: buildingId } = await searchParams

  let buildingName: string | undefined
  if (buildingId) {
    const supabase = await createClient()
    const { data } = await supabase.from('buildings').select('name').eq('id', buildingId).maybeSingle()
    buildingName = data?.name
  }

  return (
    <div>
      <PageHeader
        title="New employee"
        backHref={buildingId ? `/buildings/${buildingId}` : '/employees'}
        backLabel={buildingName ?? 'Employees'}
      />
      <EmployeeForm assignToBuilding={buildingId} buildingName={buildingName} />
    </div>
  )
}
