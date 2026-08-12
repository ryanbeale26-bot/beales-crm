import { notFound } from 'next/navigation'

import { ContactForm } from '@/app/(app)/contacts/contact-form'
import { PageHeader } from '@/components/page-header'
import { fullName } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: contact }, { data: accounts }] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    supabase.from('accounts').select('id, name').is('deleted_at', null).order('name'),
  ])

  if (!contact) notFound()

  return (
    <div>
      <PageHeader
        title={`Edit ${fullName(contact)}`}
        backHref={`/contacts/${id}`}
        backLabel={fullName(contact)}
      />
      <ContactForm contact={contact} accounts={accounts ?? []} />
    </div>
  )
}
