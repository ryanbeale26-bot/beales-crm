import 'server-only'

import { isPublicEmailDomain, normaliseAddress } from '@/lib/ingest/addresses'
import type { Supabase } from '@/lib/ingest'

/**
 * Which mailboxes Graph should be asked for.
 *
 * There is no table for this and there should not be one. The mail-enabled
 * security group in Entra is the source of truth for who is actually readable,
 * and the app cannot read that group: doing so needs `Group.Read.All`, which
 * was deliberately not consented — it would let this client id enumerate every
 * group in the company, on an app registration whose whole design is minimum
 * access.
 *
 * So the app asks for all five and lets the ApplicationAccessPolicy answer.
 * A mailbox outside the group comes back **403**, which is recorded as "not in
 * the ingest group" rather than treated as a failure. Two things follow:
 *
 *   - The policy stays the security boundary. This list only says what we try.
 *   - `.env.local.example`'s promise stays literally true — adding a colleague
 *     is a group membership change, with no code and no redeploy.
 *
 * The consequence is worth stating rather than discovering: the day somebody is
 * added to that group, their client mail begins being logged, with no further
 * decision taken inside this app.
 *
 * Service accounts are excluded — the ingest profile has no mailbox — and so
 * are deactivated profiles, which covers the QA logins and anybody who has
 * left.
 */

export type Mailbox = {
  /** The address to ask Graph for. */
  address: string
  /** The profile it belongs to, so an item can be credited without a lookup. */
  profileId: string
  fullName: string
}

export async function fetchMailboxes(supabase: Supabase): Promise<Mailbox[]> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('is_active', true)
    .eq('is_service', false)
    .order('full_name')

  const mailboxes: Mailbox[] = []

  for (const profile of profiles ?? []) {
    const address = normaliseAddress(profile.email)
    if (!address) continue

    // Graph only knows addresses in this tenant, so a profile signed up with a
    // personal address would produce the same error every night forever.
    // `profile_email_aliases` is where those belong and already works there —
    // it is what stops Granola's Gmail address being read as a stranger — but
    // an alias is not a mailbox to poll.
    if (isPublicEmailDomain(address)) continue

    mailboxes.push({ address, profileId: profile.id, fullName: profile.full_name })
  }

  return mailboxes
}
