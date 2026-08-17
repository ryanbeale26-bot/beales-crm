'use server'

import { revalidatePath } from 'next/cache'

import { domainOf, isPublicEmailDomain, normaliseAddress } from '@/lib/ingest/addresses'
import { propose, type Proposal } from '@/lib/ingest/suggestions'
import { buildRelinkProposal } from '@/lib/import/relink'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, admin: false, userId: null }

  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { supabase, admin: data?.role === 'admin', userId: user.id }
}

/**
 * Map a domain to an account.
 *
 * The validation here is the same rule the migration enforces, said earlier and
 * in English: a public domain is a person not a company, and a domain already
 * mapped elsewhere would mean two accounts, which is exactly what unique(domain)
 * refuses. Better to say so than to surface a constraint violation.
 */
export async function addDomain(
  rawDomain: string,
  accountId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can change the domain map.' }

  // Accept a whole address as well as a bare domain — pasting the address is
  // what anyone would actually do.
  const input = rawDomain.trim().toLowerCase().replace(/^@/, '')
  const domain = input.includes('@') ? domainOf(input) : input

  if (!domain || !domain.includes('.') || /\s/.test(domain)) {
    return { ok: false, error: `"${rawDomain}" does not look like a domain.` }
  }

  if (isPublicEmailDomain(domain)) {
    return {
      ok: false,
      error: `${domain} is a personal email provider, so it identifies a person rather than a company. Mapping it would file every private message against a client.`,
    }
  }

  const { data: clash } = await supabase
    .from('account_domains')
    .select('account_id, accounts ( name )')
    .eq('domain', domain)
    .maybeSingle()

  if (clash) {
    const name = (clash.accounts as { name: string } | null)?.name ?? 'another account'
    return { ok: false, error: `${domain} is already mapped to ${name}.` }
  }

  const { error } = await supabase
    .from('account_domains')
    .insert({ domain, account_id: accountId, added_by: userId })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/ingest')
  revalidatePath('/review')
  return { ok: true }
}

export async function removeDomain(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can change the domain map.' }

  const { error } = await supabase.from('account_domains').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/ingest')
  return { ok: true }
}

/**
 * Re-attach the activities that came across the spreadsheet linked to nothing.
 *
 * This writes suggestions, not links — which means it needs none of the
 * five-place importer framework. The review screen is the preview, and
 * accepting a batch there is what creates the undoable `import_batches` row.
 */
export async function proposeRelink(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; written?: number; matched?: number; unmatched?: { company: string; count: number }[]; orphans?: number }> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can do this.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose the workbook first.' }
  }

  const [activities, opportunities] = await Promise.all([
    supabase
      .from('activities')
      .select('id, subject, occurred_at, account_id, building_id, opportunity_id')
      .limit(5000),
    supabase.from('opportunities').select('id, name, account_id').is('deleted_at', null),
  ])

  if (activities.error) return { ok: false, error: activities.error.message }
  if (opportunities.error) return { ok: false, error: opportunities.error.message }

  let result
  try {
    result = await buildRelinkProposal(await file.arrayBuffer(), file.name, {
      activities: activities.data ?? [],
      opportunities: opportunities.data ?? [],
    })
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : String(caught) }
  }

  const proposals: Proposal[] = result.proposals.map((p) => ({
    kind: 'link_activity',
    // An exact equality between the sheet's Company cell and a deal's name.
    // Not a model reading prose — which is why it needs no quote and why the
    // review screen can say what actually matched.
    confidence: 'exact',
    subjectTable: 'activities',
    subjectId: p.activityId,
    payload: {
      opportunity_id: p.opportunityId,
      // Resolved here rather than left to set_activity_account(). That trigger
      // would fill account_id behind apply_gap_fill's back, and the journal
      // only records what apply_gap_fill itself wrote — so undo would put the
      // deal back and leave the account stamped, in a state the row was never
      // in. Naming it in the payload makes the trigger a no-op and the journal
      // complete.
      ...(p.accountId ? { account_id: p.accountId } : {}),
    },
    rationale: `The spreadsheet filed this under "${p.company}", which is the deal ${p.opportunityName}.`,
  }))

  const { written, error } = await propose(supabase, proposals)
  if (error) return { ok: false, error }

  revalidatePath('/review')
  revalidatePath('/dashboard')
  revalidatePath('/admin/ingest')

  return {
    ok: true,
    written,
    matched: result.proposals.length,
    unmatched: result.unmatched.slice(0, 10),
    orphans: result.orphans,
  }
}

/** Normalise an address the same way the matcher does, so the screen can show
 *  what a given address would be understood as before anything is mapped. */
export async function explainAddress(raw: string) {
  const address = normaliseAddress(raw)
  return { address, domain: domainOf(raw), isPublic: isPublicEmailDomain(domainOf(raw)) }
}
