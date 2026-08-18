'use server'

import { revalidatePath } from 'next/cache'

import { domainOf, isPublicEmailDomain, normaliseAddress } from '@/lib/ingest/addresses'
import { isTooGenericToCurate, normaliseAlias } from '@/lib/ingest/titles'
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

/**
 * Map a phrase in a note title to exactly one record.
 *
 * The validation here is the same rule the migration enforces, said earlier and
 * in English — the pattern `addDomain` above already follows. A constraint
 * violation surfaced raw is a worse screen than a sentence explaining the rule.
 */
export async function addAlias(
  rawAlias: string,
  target: string,
  note: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can change the alias map.' }

  const alias = normaliseAlias(rawAlias)
  if (!alias) return { ok: false, error: 'Type the words as they appear in a note title.' }

  if (alias.length < 3) {
    return {
      ok: false,
      error: `“${alias}” is too short to be safe — two characters will turn up inside words that have nothing to do with the record.`,
    }
  }

  if (isTooGenericToCurate(alias)) {
    return {
      ok: false,
      error: `“${alias}” is made only of words that appear across the whole book, so it would match notes about other clients. Add something that identifies this one — a street number, or a name.`,
    }
  }

  const [kind, id] = target.split(':')
  if (!id || !['account', 'building', 'opportunity'].includes(kind)) {
    return { ok: false, error: 'Choose what this phrase should mean.' }
  }

  const { data: clash } = await supabase
    .from('match_aliases')
    .select('alias, account_id, building_id, opportunity_id')
    .eq('alias', alias)
    .maybeSingle()

  if (clash) {
    return {
      ok: false,
      error: `“${alias}” is already mapped. Remove the existing one first if it is wrong — a phrase that could mean two records has to mean neither.`,
    }
  }

  const { error } = await supabase.from('match_aliases').insert({
    alias,
    account_id: kind === 'account' ? id : null,
    building_id: kind === 'building' ? id : null,
    opportunity_id: kind === 'opportunity' ? id : null,
    note: note?.trim() || null,
    added_by: userId,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/ingest')
  return { ok: true }
}

export async function removeAlias(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can change the alias map.' }

  const { error } = await supabase.from('match_aliases').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/ingest')
  return { ok: true }
}

/**
 * Claim another email address for one of the five.
 *
 * Granola signs in as a personal Gmail address, so without this every note it
 * produces is credited to the machine account rather than to a person — and
 * Ryan's own address is filed in the list of strangers we do not know.
 *
 * This is NOT the domain map, and the difference matters: gmail.com stays on the
 * never-mappable list, because a domain says "this company" while an address
 * says "this person".
 */
export async function addProfileAlias(
  rawEmail: string,
  profileId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, admin, userId } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can claim an address for somebody.' }

  const email = normaliseAddress(rawEmail)
  if (!email) return { ok: false, error: `“${rawEmail}” does not look like an email address.` }
  if (!profileId) return { ok: false, error: 'Choose whose address this is.' }

  const { data: clash } = await supabase
    .from('profile_email_aliases')
    // The FK must be named: profile_email_aliases points at profiles TWICE, via
    // profile_id and added_by, so a bare embed fails with "more than one
    // relationship was found". Same trap as contacts -> accounts.
    .select('profile_id, profiles!profile_email_aliases_profile_id_fkey ( full_name )')
    .eq('email', email)
    .maybeSingle()

  if (clash) {
    const name = (clash.profiles as { full_name: string } | null)?.full_name ?? 'somebody else'
    return { ok: false, error: `${email} is already recorded as ${name}.` }
  }

  const { error } = await supabase
    .from('profile_email_aliases')
    .insert({ email, profile_id: profileId, added_by: userId })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/ingest')
  return { ok: true }
}

export async function removeProfileAlias(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, admin } = await requireAdmin()
  if (!admin) return { ok: false, error: 'Only an admin can claim an address for somebody.' }

  const { error } = await supabase.from('profile_email_aliases').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/ingest')
  return { ok: true }
}
