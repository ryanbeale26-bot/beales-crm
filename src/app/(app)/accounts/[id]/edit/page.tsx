import { notFound } from 'next/navigation'

import { AccountForm } from '@/app/(app)/accounts/account-form'
import { PageHeader } from '@/components/page-header'
import { getOwners } from '@/lib/reference'
import { createClient } from '@/lib/supabase/server'

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: account }, owners] = await Promise.all([
    supabase.from('accounts').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    getOwners(),
  ])

  if (!account) notFound()

  return (
    <div>
      <PageHeader
        title={`Edit ${account.name}`}
        backHref={`/accounts/${id}`}
        backLabel={account.name}
      />
      <AccountForm account={account} owners={owners} />
    </div>
  )
}
