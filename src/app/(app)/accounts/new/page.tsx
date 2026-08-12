import { AccountForm } from '@/app/(app)/accounts/account-form'
import { PageHeader } from '@/components/page-header'
import { getOwners } from '@/lib/reference'

export default async function NewAccountPage() {
  const owners = await getOwners()

  return (
    <div>
      <PageHeader title="New account" backHref="/accounts" backLabel="Accounts" />
      <AccountForm owners={owners} />
    </div>
  )
}
