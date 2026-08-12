'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { saveAccount, type FormState } from '@/app/(app)/actions'
import { Field, FormError, Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ACCOUNT_STATUS_LABELS } from '@/lib/format'

type Account = {
  id: string
  name: string
  account_type: string | null
  status: 'prospect' | 'active' | 'former'
  owner_id: string | null
  secondary_owner_id: string | null
  hq_address_line1: string | null
  hq_city: string | null
  hq_state: string | null
  hq_postal_code: string | null
  notes: string | null
}

export function AccountForm({
  account,
  owners,
}: {
  account?: Account
  owners: { id: string; full_name: string; email: string; is_active: boolean }[]
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccount, {})

  return (
    <form action={action} className="max-w-2xl space-y-5">
      {account && <input type="hidden" name="id" value={account.id} />}

      <Field label="Account name" htmlFor="name" required hint="The customer, not the site. Buildings go underneath.">
        <Input id="name" name="name" defaultValue={account?.name ?? ''} required autoFocus />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={account?.status ?? 'prospect'}>
            {Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Account type" htmlFor="account_type" hint="e.g. Healthcare, Property Mgmt">
          <Input id="account_type" name="account_type" defaultValue={account?.account_type ?? ''} />
        </Field>

        <Field label="Owner" htmlFor="owner_id" hint="Reports group by this person.">
          <Select id="owner_id" name="owner_id" defaultValue={account?.owner_id ?? ''}>
            <option value="">Nobody yet</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name || o.email}
                {!o.is_active && ' (no longer here)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Second owner" htmlFor="secondary_owner_id" hint="Optional. Not counted twice in reports.">
          <Select
            id="secondary_owner_id"
            name="secondary_owner_id"
            defaultValue={account?.secondary_owner_id ?? ''}
          >
            <option value="">None</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name || o.email}
                {!o.is_active && ' (no longer here)'}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Head office address" htmlFor="hq_address_line1">
        <Input
          id="hq_address_line1"
          name="hq_address_line1"
          defaultValue={account?.hq_address_line1 ?? ''}
          placeholder="Street"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="City" htmlFor="hq_city">
          <Input id="hq_city" name="hq_city" defaultValue={account?.hq_city ?? ''} />
        </Field>
        <Field label="State" htmlFor="hq_state">
          <Input id="hq_state" name="hq_state" defaultValue={account?.hq_state ?? ''} maxLength={2} />
        </Field>
        <Field label="ZIP" htmlFor="hq_postal_code">
          <Input id="hq_postal_code" name="hq_postal_code" defaultValue={account?.hq_postal_code ?? ''} />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={4} defaultValue={account?.notes ?? ''} />
      </Field>

      <FormError message={state.error} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : account ? 'Save changes' : 'Create account'}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={account ? `/accounts/${account.id}` : '/accounts'}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
