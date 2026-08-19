import { AliasMap, type Ambiguity, type AliasCandidate, type AliasRow, type TargetOption } from './alias-map'
import { DomainMap, type Candidate, type DomainRow } from './domain-map'
import { ProfileAliases, type ProfileAliasRow } from './profile-aliases'
import { RelinkUpload } from './relink-upload'
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { died, fetchRunHealth } from '@/lib/ingest/run-health'
import { ago } from '@/lib/format'
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

  const [
    domains,
    candidates,
    accounts,
    mirror,
    suggestions,
    aliases,
    aliasCandidates,
    buildings,
    deals,
    stages,
    profileAliases,
    people,
    ambiguous,
    health,
  ] = await Promise.all([
    supabase.from('account_domains').select('id, domain, account_id, accounts ( name )').order('domain'),
    supabase.from('v_domain_candidates').select('*').order('contact_count', { ascending: false }).limit(12),
    supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('ingested_items').select('status, last_seen_at').order('last_seen_at', { ascending: false }).limit(1000),
    supabase.from('ingest_suggestions').select('status'),
    supabase
      .from('match_aliases')
      // One string literal, not a concatenation: supabase-js parses the select
      // at the TYPE level, which needs a literal — `'a' + 'b'` widens to string
      // and every column comes back as GenericStringError.
      .select('id, alias, note, account_id, building_id, opportunity_id, accounts ( name ), buildings ( name ), opportunities ( name )')
      .order('alias'),
    supabase.from('v_alias_candidates').select('*').order('alias').limit(40),
    supabase.from('buildings').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('opportunities').select('id, name, stage_id').is('deleted_at', null).order('name'),
    supabase.from('pipeline_stages').select('id, is_won, is_lost'),
    supabase
      .from('profile_email_aliases')
      .select('id, email, profiles!profile_email_aliases_profile_id_fkey ( full_name )')
      .order('email'),
    // Deliberately includes the service profile: an address alias for the
    // machine account is a legitimate thing to want, and unlike an owner picker
    // this list is not about assigning work.
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    // Titles that named two records. The subject IS kept for these, because the
    // note is demonstrably about the business — unlike the ones that matched
    // nothing, where only the id and the date are stored.
    supabase
      .from('ingested_items')
      .select('subject, matched_on, last_seen_at')
      .eq('status', 'needs_review')
      .order('last_seen_at', { ascending: false })
      .limit(30),
    fetchRunHealth(supabase),
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

  const aliasRows: AliasRow[] = (aliases.data ?? []).map((row) => ({
    id: row.id,
    alias: row.alias,
    note: row.note,
    kind: row.opportunity_id ? 'deal' : row.building_id ? 'building' : 'account',
    label:
      (row.opportunities as { name: string } | null)?.name ??
      (row.buildings as { name: string } | null)?.name ??
      (row.accounts as { name: string } | null)?.name ??
      'Unknown',
  }))

  const openStages = new Set(
    (stages.data ?? []).filter((stage) => !stage.is_won && !stage.is_lost).map((stage) => stage.id),
  )

  const targets: TargetOption[] = [
    ...(accounts.data ?? []).map((row) => ({
      value: `account:${row.id}`,
      label: row.name,
      group: 'Accounts' as const,
    })),
    ...(buildings.data ?? []).map((row) => ({
      value: `building:${row.id}`,
      label: row.name,
      group: 'Buildings' as const,
    })),
    ...(deals.data ?? [])
      .filter((row) => openStages.has(row.stage_id))
      .map((row) => ({
        value: `opportunity:${row.id}`,
        label: row.name,
        group: 'Open deals' as const,
      })),
  ]

  const aliasCandidateRows: AliasCandidate[] = (aliasCandidates.data ?? []).flatMap((row) => {
    if (!row.alias) return []
    const target = row.opportunity_id
      ? `opportunity:${row.opportunity_id}`
      : row.building_id
        ? `building:${row.building_id}`
        : row.account_id
          ? `account:${row.account_id}`
          : null
    if (!target) return []
    return [{ alias: row.alias, kind: row.kind ?? '', label: row.label ?? '', target }]
  })

  const profileAliasRows: ProfileAliasRow[] = (profileAliases.data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    name: (row.profiles as { full_name: string } | null)?.full_name ?? 'Unknown',
  }))

  // One row per distinct title: the same note re-seen every night is one thing to
  // fix, not thirty.
  const ambiguityRows: Ambiguity[] = Object.values(
    (ambiguous.data ?? []).reduce<Record<string, Ambiguity>>((acc, row) => {
      const key = row.subject
      if (!acc[key]) {
        acc[key] = {
          subject: row.subject,
          matchedOn: row.matched_on,
          lastSeen: row.last_seen_at,
          count: 0,
        }
      }
      acc[key].count += 1
      return acc
    }, {}),
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

      {/* Whether the job ran at all comes before what it found. Until
          ingest_runs existed nothing could answer it: "last seen" only moves
          when there is something to ingest, so a quiet week and a dead cron
          looked exactly alike. */}
      <SectionTitle>Last run</SectionTitle>
      {health.neverRun ? (
        <EmptyState title="The nightly job has not recorded a run yet.">
          It records one every time it fires, whether or not it finds anything.
        </EmptyState>
      ) : (
        <>
          {health.stale && (
            <p className="border-border mb-3 rounded-[3px] border p-3 text-sm">
              <strong>Nothing has run for {Math.floor(health.hoursSince ?? 0)} hours.</strong> It
              should run twice a night. Either the schedule is not firing, or the job cannot sign
              in — a sign-in failure leaves no record here at all, because writing one needs the
              session that failed. Check the Vercel cron log.
            </p>
          )}
          <ol className="border-border border-t text-sm">
            {health.runs.map((run) => (
              <li key={run.id} className="border-border border-b px-2 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {died(run)
                      ? 'Never finished'
                      : run.ok === null
                        ? 'Running now'
                        : run.ok
                          ? 'Clean'
                          : 'Finished with errors'}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {ago(run.startedAt)}
                    {run.ranForMs !== null && ` · ${(run.ranForMs / 1000).toFixed(1)}s`}
                    {run.sources.length > 0 && ` · ${run.sources.join(', ')}`}
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  {run.seen} seen · {run.ingested} new · {run.alreadySeen} already known ·{' '}
                  {run.activitiesCreated} activities · {run.nextStepsCreated} next steps ·{' '}
                  {run.suggestionsWritten} suggestions
                  {run.stoppedEarly && ' · stopped at the deadline'}
                  {run.truncated.length > 0 && ` · ${run.truncated.join(', ')} read only part`}
                </div>
                {run.errors.map((error) => (
                  <p key={error} className="text-destructive mt-1 text-xs">
                    {error}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </>
      )}

      <SectionTitle>What it has found</SectionTitle>
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

      <SectionTitle
        aside={<span className="text-muted-foreground text-sm">{aliasRows.length} mapped</span>}
      >
        What a phrase in a meeting note means
      </SectionTitle>

      <p className="text-muted-foreground mb-3 text-sm">
        Granola notes carry no client email addresses — they are mostly solo site inspections
        dictated into a phone — so they are matched on their <strong>title</strong>. Street
        addresses and deal names are found automatically. Phrases like{' '}
        <em>wound center</em> are not a building name, an address or a deal name, so they have to
        be said once, here. A phrase can mean one record only: one that could mean two means
        neither. Run <code>npm run granola:probe</code> to see what every note would match, and
        what still matches nothing.
      </p>

      <AliasMap
        aliases={aliasRows}
        candidates={aliasCandidateRows}
        targets={targets}
        ambiguities={ambiguityRows}
      />

      <SectionTitle>Other addresses that are one of us</SectionTitle>
      <p className="text-muted-foreground mb-3 text-sm">
        Granola signs in with a personal address rather than a <code>@bealesllc.com</code> one.
        Without an entry here, every note it produces is logged by <em>Nightly ingest</em> instead
        of by the person who captured it, and their own address is treated as a stranger&apos;s.
      </p>

      <ProfileAliases
        rows={profileAliasRows}
        people={(people.data ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
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
