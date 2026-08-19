import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The proxy already guards this, but a page should never render signed-out
  // content if that guard is ever misconfigured.
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const displayName = profile?.full_name || user.email || 'Signed in'

  const [{ data: activityTypes }, { count: reviewCount }] = await Promise.all([
    supabase
      .from('activity_types')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order'),
    // How many things the nightly job left for a person to decide. `head` so
    // no rows come back — the sidebar needs the number and nothing else. Zero
    // hides the Review item rather than showing a permanent nought.
    supabase
      .from('ingest_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
  ])

  return (
    <AppShell
      displayName={displayName}
      initial={displayName.charAt(0).toUpperCase()}
      activityTypes={activityTypes ?? []}
      reviewCount={reviewCount ?? 0}
    >
      {children}
    </AppShell>
  )
}
