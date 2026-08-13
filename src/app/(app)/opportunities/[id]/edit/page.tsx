import { notFound } from 'next/navigation'

import { OpportunityForm } from '@/app/(app)/opportunities/opportunity-form'
import { PageHeader } from '@/components/page-header'
import { getLeadSources, getOwners, getPipelineStages, getPropertyTypes } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: opportunity, error }, stages, propertyTypes, leadSources, owners, { data: accounts }] =
    await Promise.all([
      supabase.from('opportunities').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
      getPipelineStages(),
      getPropertyTypes(),
      getLeadSources(),
      getOwners(),
      supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
    ])

  if (error) throw new Error(`Could not load this deal: ${error.message}`)
  if (!opportunity) notFound()

  return (
    <div>
      <PageHeader
        title={`Edit ${opportunity.name}`}
        backHref={`/opportunities/${id}`}
        backLabel="Back to the deal"
      />
      <OpportunityForm
        opportunity={opportunity}
        stages={stages}
        accounts={accounts ?? []}
        propertyTypes={propertyTypes}
        leadSources={leadSources}
        owners={owners}
      />
    </div>
  )
}
