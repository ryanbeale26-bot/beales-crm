import { DomainMap, type Candidate, type DomainRow } from './domain-map'
import { RelinkUpload } from './relink-upload'
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { Stat } from '@/components/report'
import { hasIngestEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Ingest' }

export default async function IngestAdminPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: me } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null }

  if (me?.role !== 'admin') {
    return (
      <div>
        <PageHeader title="Ingest" />
        <EmptyState title="Admins only.">
          Ask Ryan if you need something changed here.
        </EmptyState>
      </div>
    )
  }

  const [domains, candidates, accounts, mirror, suggestions] = await Promise.all([
    supabase.from('account_domains').select('id, domain, account_id, accounts ( name )').order('domain'),
    supabase.from('v_domain_candidates').select('*').order('contact_count', { ascending: false }).limit(12),
    supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('ingested_items').select('status, last_seen_at').order('last_seen_at', { ascending: false }).limit(1000),
    supabase.from('ingest_suggestions').select('status'),
  ])

  const items = mirror.data ?? []
  const linked = items.filter((i) => i.status === 'linked').length
  const ignored = items.filter((i) => i.status === 'ignored').length
  const lastSeen = items[0]?.last_seen_at ?? null

  const open = (suggestions.data ?? []).filter((s) => s.status === 'open').length
  const accepted = (suggestions.data ?? []).filter((s) => s.status === 'accepted').length

  const domainRows: DomainRow[] = (domains.data ?? []).map((row) => ({
    id: row.id,
    domain: row.domain,
    accountId: row.account_id,
    accountName: (row.accounts as { name: string } | null)?.name ?? 'Unknown',
  }))

  const candidateRows: Candidate[] = (candidates.data ?? []).flatMap((row) =>
    row.domain && row.account_id
      ? [
          {
            domain: row.domain,
            accountId: row.account_id,
            accountName: row.account_name ?? 'Unknown',
            contactCount: Number(row.contact_count ?? 0),
          },
        ]
      : [],
  )

  return (
    <div>
      <PageHeader
        title="Ingest"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Ingest' }]}
        subtitle="What the nightly job has seen, and the one table it needs you to keep."
      />

      {!hasIngestEnv() && (
        <p className="border-border text-muted-foreground mb-6 rounded-[3px] border p-3 text-sm">
          The nightly job is not configured on this machine yet — <code>INGEST_USER_EMAIL</code>,{' '}
          <code>INGEST_USER_PASSWORD</code> and <code>CRON_SECRET</code> are not all set. The
          screens below still work; nothing will arrive in them until it is.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Items logged" value={String(linked)} note="Matched to an account" />
        <Stat
          label="Left unread"
          value={String(ignored)}
          note="Address only — no subject, no text"
        />
        <Stat label="Waiting for review" value={String(open)} note="Expires on its own" />
        <Stat label="Applied so far" value={String(accepted)} />
      </div>

      <p className="text-muted-foreground mt-3 text-sm">
        {lastSeen
          ? `Last saw something on ${new Date(lastSeen).toLocaleString()}.`
          : 'Nothing has been ingested yet.'}
      </p>

      <SectionTitle
        aside={<span className="text-muted-foreground text-sm">{domainRows.length} mapped</span>}
      >
        Which company an email domain belongs to
      </SectionTitle>

      <p className="text-muted-foreground mb-3 text-sm">
        This is what lets a message from somebody who is not yet a contact still reach the right
        account. A domain can point at one account only — so a managing agent like CBRE or JLL,
        whose buildings sit under several accounts, cannot be mapped here at all, and mail from
        them will keep relying on the contacts themselves being right.
      </p>

      <DomainMap
        domains={domainRows}
        candidates={candidateRows}
        accounts={accounts.data ?? []}
      />

      <SectionTitle>Activities that came across attached to nothing</SectionTitle>
      <p className="text-muted-foreground mb-3 text-sm">
        The Activity Log import kept each activity&apos;s subject and date but not the company it
        was filed under, so the company has to come back out of the workbook. Upload{' '}
        <code>Beales_CRM.xlsx</code> and each row is keyed back to its activity on subject and
        date.
        <br />
        Most of what is left over turns out to be <strong>deals</strong> rather than clients — which
        matters, because not one activity in the database currently points at an opportunity, and
        that is why no report can say whether a deal has gone quiet.
      </p>

      <RelinkUpload />
    </div>
  )
}
