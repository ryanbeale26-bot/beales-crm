import { PageHeader, Row, RowList } from '@/components/page-header'
import { REPORTS } from '@/lib/reports'

export default function ReportsIndexPage() {
  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Every report exports to CSV exactly as it appears on screen."
      />
      <RowList>
        {REPORTS.map((r) => (
          <Row key={r.slug} href={`/reports/${r.slug}`} title={r.title} meta={r.blurb} />
        ))}
      </RowList>
    </div>
  )
}
