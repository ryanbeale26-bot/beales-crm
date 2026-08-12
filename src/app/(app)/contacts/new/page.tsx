import { ContactForm } from '@/app/(app)/contacts/contact-form'
import { PageHeader } from '@/components/page-header'
import { createClient } from '@/lib/supabase/server'

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>
}) {
  const { account: accountId } = await searchParams
  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .is('deleted_at', null)
    .order('name')

  return (
    <div>
      <PageHeader
        title="New contact"
        backHref={accountId ? `/accounts/${accountId}?tab=Contacts` : '/contacts'}
        backLabel={accountId ? 'Account' : 'Contacts'}
      />
      <ContactForm accountId={accountId} accounts={accounts ?? []} />
    </div>
  )
}
