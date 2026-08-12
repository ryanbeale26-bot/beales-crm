'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { saveContact, type FormState } from '@/app/(app)/actions'
import { Field, FormError, Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Contact = {
  id: string
  first_name: string
  last_name: string
  title: string | null
  account_id: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  contact_role: string | null
  notes: string | null
}

/** From the Relationship Type column of the sheet, tidied into a short list. */
const ROLES = [
  'Decision maker',
  'EVS / facilities manager',
  'AP / billing',
  'On-site day-to-day',
  'Property manager',
  'Vendor',
  'Union partner',
  'Other',
]

export function ContactForm({
  contact,
  accountId,
  accounts,
}: {
  contact?: Contact
  accountId?: string
  accounts: { id: string; name: string }[]
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveContact, {})

  return (
    <form action={action} className="max-w-2xl space-y-5">
      {contact && <input type="hidden" name="id" value={contact.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" htmlFor="first_name">
          <Input id="first_name" name="first_name" defaultValue={contact?.first_name ?? ''} autoFocus />
        </Field>
        <Field label="Last name" htmlFor="last_name">
          <Input id="last_name" name="last_name" defaultValue={contact?.last_name ?? ''} />
        </Field>
      </div>

      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" defaultValue={contact?.title ?? ''} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Account" htmlFor="account_id" hint="Leave blank for vendors and other outsiders.">
          <Select id="account_id" name="account_id" defaultValue={contact?.account_id ?? accountId ?? ''}>
            <option value="">No account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Role" htmlFor="contact_role">
          <Select id="contact_role" name="contact_role" defaultValue={contact?.contact_role ?? ''}>
            <option value="">Not set</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={contact?.email ?? ''} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={contact?.phone ?? ''} />
        </Field>
        <Field label="Mobile" htmlFor="mobile">
          <Input id="mobile" name="mobile" type="tel" defaultValue={contact?.mobile ?? ''} />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={4} defaultValue={contact?.notes ?? ''} />
      </Field>

      <FormError message={state.error} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : contact ? 'Save changes' : 'Create contact'}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={contact ? `/contacts/${contact.id}` : '/contacts'}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
