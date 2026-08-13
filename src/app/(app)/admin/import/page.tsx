import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { date } from '@/lib/format'
import { getCurrentProfile } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

import { Importer } from './importer'
import { UndoButton } from './undo-button'

export default async function ImportPage() {
  const profile = await getCurrentProfile()

  if (profile?.role !== 'admin') {
    return (
      <div>
        <PageHeader title="Import" />
        <EmptyState title="Only an admin can import data.">
          Ask Ryan if you need something brought in from a spreadsheet.
        </EmptyState>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: batches } = await supabase
    .from('import_batches')
    .select('id, source_tab, file_name, row_count, status, created_at, committed_at')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div>
      <PageHeader
        title="Import"
        subtitle="Bring accounts, buildings and contacts across from a spreadsheet. Nothing is written until you have seen the preview."
      />

      <Importer />

      <SectionTitle>Previous imports</SectionTitle>
      {batches && batches.length > 0 ? (
        <div className="border-border border-t">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-2 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{batch.source_tab}</div>
                <div className="text-muted-foreground text-xs">
                  {date(batch.created_at)} · {batch.row_count} rows · {batch.status.replace('_', ' ')}
                </div>
              </div>
              {batch.status === 'committed' && <UndoButton batchId={batch.id} />}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Nothing imported yet.</p>
      )}
    </div>
  )
}
