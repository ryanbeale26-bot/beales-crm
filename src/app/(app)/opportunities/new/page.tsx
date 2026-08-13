import { OpportunityForm } from '@/app/(app)/opportunities/opportunity-form'
import { PageHeader } from '@/components/page-header'
import { getLeadSources, getOwners, getPipelineStages, getPropertyTypes } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>
}) {
  const { account } = await searchParams
  const supabase = await createClient()

  const [stages, propertyTypes, leadSources, owners, { data: accounts }] = await Promise.all([
    getPipelineStages(),
    getPropertyTypes(),
    getLeadSources(),
    getOwners(),
    supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
  ])

  return (
    <div>
      <PageHeader title="New deal" backHref="/opportunities" backLabel="Pipeline" />
      <OpportunityForm
        stages={stages}
        accounts={accounts ?? []}
        propertyTypes={propertyTypes}
        leadSources={leadSources}
        owners={owners}
        defaultAccountId={account}
      />
    </div>
  )
}
