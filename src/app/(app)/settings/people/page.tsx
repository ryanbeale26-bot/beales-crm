import { PeopleEditor, type PersonRow } from '@/app/(app)/settings/people/people-editor'
import { EmptyState, PageHeader, SectionTitle } from '@/components/page-header'
import { getCurrentProfile } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'People' }

/**
 * The profiles, and what each person can do.
 *
 * Everything on this screen works with the signed-in admin's own session —
 * `profiles_admin_all` allows it. The two jobs that DO need the service role
 * key, which bypasses every policy and is deliberately not deployed, are
 * printed as commands at the bottom rather than offered as forms that could
 * never work.
 */
export default async function PeoplePage() {
  const profile = await getCurrentProfile()

  if (profile?.role !== 'admin') {
    return (
      <div>
        <PageHeader title="People" breadcrumbs={[{ label: 'Settings', href: '/settings' }]} />
        <EmptyState title="Only an admin can change what people can do.">
          Ask Ryan if your access is wrong.
        </EmptyState>
      </div>
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, sees_rates, is_active, is_service')
    .order('full_name')

  // A failed query must never read as an empty team.
  if (error) throw new Error(error.message)

  return (
    <div>
      <PageHeader
        title="People"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }]}
        subtitle="Who can sign in, what they can do, and who sees pay rates. Changes take effect the next time that person loads a page."
      />

      <PeopleEditor people={(data ?? []) as PersonRow[]} meId={profile.id} />

      <p className="text-muted-foreground mt-3 text-sm">
        Turning off <em>Can sign in</em> blocks someone and hides every record from them, but keeps
        their name on the accounts and buildings they used to own. That is on purpose, and it is why
        nobody is ever deleted: the edit history points at these rows, so removing a person would
        erase who changed what.
      </p>

      <SectionTitle>Two things that have to be done in the terminal</SectionTitle>
      <p className="text-muted-foreground mb-3 text-sm">
        Adding a person and setting someone else&rsquo;s password both need the service role key,
        which switches off every security rule in the database. It is deliberately not deployed with
        the app, so these run from Ryan&rsquo;s laptop, in the project folder.
      </p>

      <div className="border-border border-t py-3">
        <p className="text-sm font-medium">Add someone</p>
        <pre className="bg-muted mt-1 overflow-x-auto rounded-[3px] px-2 py-1.5 text-xs">
{`npm run user:create -- --email name@bealesllc.com --name "Full Name" --role leadership`}
        </pre>
        <p className="text-muted-foreground mt-1 text-sm">
          Role is <code>admin</code>, <code>leadership</code> or <code>field</code>. Add{' '}
          <code>--rates</code> if they should see pay rates. It prints a strong password once — send
          it to them by a route that is not email, and they can change it on their own Settings page.
        </p>
      </div>

      <div className="border-border border-b py-3">
        <p className="text-sm font-medium">Reset someone else&rsquo;s password</p>
        <pre className="bg-muted mt-1 overflow-x-auto rounded-[3px] px-2 py-1.5 text-xs">
{`npm run user:password -- --email name@bealesllc.com`}
        </pre>
        <p className="text-muted-foreground mt-1 text-sm">
          It asks for the new password twice, without showing it. Use this rather than a recovery
          email: Defender on Exchange Online opens links to scan them, which burns the one-time
          token before the person clicks it.
        </p>
      </div>
    </div>
  )
}
