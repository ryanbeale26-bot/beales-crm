import { Bar } from '@/components/report'
import { SectionTitle } from '@/components/page-header'
import { fetchCensus, SCOPES } from '@/lib/gaps'
import { createClient } from '@/lib/supabase/server'

/**
 * What is still missing, and the file that fixes it.
 *
 * This sits above the importer so the whole round trip is one page: download
 * here, upload below, undo at the bottom. It also replaces re-counting the gaps
 * by hand, which is how every previous session started.
 *
 * The counts come from v_gap_census, which reads v_mrr_coverage and
 * v_pipeline_coverage for the two numbers those views already own — so this can
 * never quietly disagree with the revenue and pipeline reports.
 */
export async function GapCensus() {
  const supabase = await createClient()
  const { rows, error } = await fetchCensus(supabase)

  if (error) {
    return (
      <p className="text-destructive text-sm">Could not read the gap census: {error.message}</p>
    )
  }

  return (
    <div>
      <SectionTitle>Fill the gaps</SectionTitle>
      <p className="text-muted-foreground mb-4 text-sm">
        Download a sheet, fill in what you know in Excel, then upload it below. Every record
        carries its own ID in the first column, so nothing is matched by name.{' '}
        <strong className="text-foreground font-medium">A cell you leave blank is left alone</strong>{' '}
        — an import can never empty a field, so a half-filled sheet is safe to upload.
      </p>

      {SCOPES.map((scope) => {
        const fields = rows.filter((r) => r.scope === scope.slug)
        const worst = fields.reduce((n, f) => Math.max(n, f.missing), 0)

        return (
          <div key={scope.slug} className="border-border mb-5 border-t pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-medium">{scope.title}</h3>
                <p className="text-muted-foreground text-xs">{scope.blurb}</p>
              </div>
              <a
                href={`/admin/import/blanks/${scope.slug}`}
                className="row-hover border-border shrink-0 rounded-[3px] border px-2 py-1 text-sm"
                download
              >
                Download sheet
              </a>
            </div>

            <div className="mt-3">
              {fields.map((f) => {
                const filled = f.total - f.missing
                return (
                  <div key={f.field} className="border-border border-b px-1 py-2">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="min-w-0 truncate text-sm">{f.label}</span>
                      <span
                        className={
                          f.missing === 0
                            ? 'text-muted-foreground shrink-0 text-sm'
                            : 'shrink-0 text-sm font-medium'
                        }
                      >
                        {f.missing === 0 ? 'all filled in' : `${f.missing} of ${f.total} missing`}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      {/* The bar shows what is done, so a full bar means no gap. */}
                      <Bar value={filled} max={f.total} tone={f.missing === worst ? 'gold' : 'navy'} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
