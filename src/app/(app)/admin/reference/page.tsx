import { ReferenceEditor } from '@/app/(app)/admin/reference/reference-editor'
import { EmptyState, PageHeader } from '@/components/page-header'
import { getCurrentProfile } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

export default async function ReferenceDataPage() {
  const profile = await getCurrentProfile()

  if (profile?.role !== 'admin') {
    return (
      <div>
        <PageHeader title="Reference data" />
        <EmptyState title="Only an admin can change these lists.">
          Ask Ryan if a stage, reason or source needs adding.
        </EmptyState>
      </div>
    )
  }

  const supabase = await createClient()

  const [stages, lossReasons, winReasons, leadSources, competitors] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name, sort_order, probability, is_active').order('sort_order'),
    supabase.from('loss_reasons').select('id, name, sort_order, is_active').order('sort_order'),
    supabase.from('win_reasons').select('id, name, sort_order, is_active').order('sort_order'),
    supabase.from('lead_sources').select('id, name, sort_order, is_active').order('sort_order'),
    supabase.from('competitors').select('id, name, is_active').order('name'),
  ])

  return (
    <div>
      <PageHeader
        title="Reference data"
        subtitle="The lists behind the dropdowns. Changing one here takes effect immediately — no code, no deploy."
      />

      <ReferenceEditor
        table="pipeline_stages"
        title="Deal stages"
        description="The columns on the board, in order, and the chance of winning at each one. The weighted pipeline is these percentages applied to each deal's annual value."
        rows={stages.data ?? []}
        hasProbability
        addLabel="New stage"
      />

      <ReferenceEditor
        table="win_reasons"
        title="Why we win"
        description="Starts empty on purpose — this is your list, not a guess. Anything here is ranked in the pipeline report next to the loss reasons."
        rows={winReasons.data ?? []}
        addLabel="New win reason"
      />

      <ReferenceEditor
        table="loss_reasons"
        title="Why we lose"
        description="Offered when a deal is dragged into Closed Lost. Retiring one keeps it on the deals that already use it."
        rows={lossReasons.data ?? []}
        addLabel="New loss reason"
      />

      <ReferenceEditor
        table="lead_sources"
        title="Where deals come from"
        description="Taken from the Source column of your Pipeline tab. The retired ones are the generic placeholders from before the real list existed."
        rows={leadSources.data ?? []}
        addLabel="New source"
      />

      <ReferenceEditor
        table="competitors"
        title="Competitors"
        description="Anyone can add one while closing a deal lost, so this is mostly for tidying up spellings and retiring duplicates."
        rows={competitors.data ?? []}
        hasSortOrder={false}
        addLabel="New competitor"
      />
    </div>
  )
}
