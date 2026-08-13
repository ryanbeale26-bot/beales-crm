'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { saveOpportunity, type FormState } from '@/app/(app)/opportunities/actions'
import { Field, FormError, Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ENTITY_LABELS, dateInputValue } from '@/lib/format'

type Reference = { id: string; name: string }

export type OpportunityFormValues = {
  id: string
  name: string
  stage_id: string
  account_id: string | null
  property_type_id: string | null
  lead_source_id: string | null
  owner_id: string | null
  secondary_owner_id: string | null
  entity: 'beales' | 'afs'
  monthly_value: number | string | null
  square_footage: number | null
  current_staff_count: number | null
  incumbent_provider: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  opened_on: string | null
  expected_close_date: string | null
  scope_notes: string | null
}

export function OpportunityForm({
  opportunity,
  stages,
  accounts,
  propertyTypes,
  leadSources,
  owners,
  defaultAccountId,
}: {
  opportunity?: OpportunityFormValues
  stages: Reference[]
  accounts: Reference[]
  propertyTypes: Reference[]
  leadSources: Reference[]
  owners: { id: string; full_name: string; email: string; is_active: boolean }[]
  defaultAccountId?: string
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveOpportunity, {})

  return (
    <form action={action} className="max-w-2xl space-y-5">
      {opportunity && <input type="hidden" name="id" value={opportunity.id} />}

      <Field
        label="Deal name"
        htmlFor="name"
        required
        hint="Company — site, the way the spreadsheet writes it. e.g. Boston Scientific — Quincy"
      >
        <Input id="name" name="name" defaultValue={opportunity?.name ?? ''} required autoFocus />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Stage" htmlFor="stage_id" required>
          <Select id="stage_id" name="stage_id" defaultValue={opportunity?.stage_id ?? stages[0]?.id ?? ''} required>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Account"
          htmlFor="account_id"
          hint="Leave blank for a brand-new customer — the account is created when it's won."
        >
          <Select
            id="account_id"
            name="account_id"
            defaultValue={opportunity?.account_id ?? defaultAccountId ?? ''}
          >
            <option value="">New customer</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Monthly value" htmlFor="monthly_value" hint="The annual figure is worked out from this.">
          <Input
            id="monthly_value"
            name="monthly_value"
            inputMode="decimal"
            defaultValue={opportunity?.monthly_value ?? ''}
          />
        </Field>

        <Field label="Segment" htmlFor="property_type_id">
          <Select id="property_type_id" name="property_type_id" defaultValue={opportunity?.property_type_id ?? ''}>
            <option value="">Not set</option>
            {propertyTypes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Source" htmlFor="lead_source_id">
          <Select id="lead_source_id" name="lead_source_id" defaultValue={opportunity?.lead_source_id ?? ''}>
            <option value="">Not set</option>
            {leadSources.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Entity" htmlFor="entity">
          <Select id="entity" name="entity" defaultValue={opportunity?.entity ?? 'beales'}>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Owner" htmlFor="owner_id">
          <Select id="owner_id" name="owner_id" defaultValue={opportunity?.owner_id ?? ''}>
            <option value="">Nobody yet</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name || o.email}
                {!o.is_active && ' (no longer here)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Second owner" htmlFor="secondary_owner_id" hint="For the deals you and Robert share.">
          <Select
            id="secondary_owner_id"
            name="secondary_owner_id"
            defaultValue={opportunity?.secondary_owner_id ?? ''}
          >
            <option value="">None</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name || o.email}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Opened" htmlFor="opened_on" hint="When the deal started. Leave blank if you don't know — the report counts those separately rather than guessing.">
          <Input
            id="opened_on"
            name="opened_on"
            type="date"
            defaultValue={dateInputValue(opportunity?.opened_on)}
          />
        </Field>

        <Field label="Expected close" htmlFor="expected_close_date">
          <Input
            id="expected_close_date"
            name="expected_close_date"
            type="date"
            defaultValue={dateInputValue(opportunity?.expected_close_date)}
          />
        </Field>
      </div>

      <Field label="Address" htmlFor="address_line1" hint="Carried over to the building if the deal is won.">
        <Input id="address_line1" name="address_line1" defaultValue={opportunity?.address_line1 ?? ''} placeholder="Street" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={opportunity?.city ?? ''} />
        </Field>
        <Field label="State" htmlFor="state">
          <Input id="state" name="state" defaultValue={opportunity?.state ?? ''} maxLength={2} />
        </Field>
        <Field label="ZIP" htmlFor="postal_code">
          <Input id="postal_code" name="postal_code" defaultValue={opportunity?.postal_code ?? ''} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Square footage" htmlFor="square_footage">
          <Input id="square_footage" name="square_footage" inputMode="numeric" defaultValue={opportunity?.square_footage ?? ''} />
        </Field>
        <Field label="Staff on site now" htmlFor="current_staff_count">
          <Input id="current_staff_count" name="current_staff_count" inputMode="numeric" defaultValue={opportunity?.current_staff_count ?? ''} />
        </Field>
        <Field label="Who has it now" htmlFor="incumbent_provider" hint="The incumbent.">
          <Input id="incumbent_provider" name="incumbent_provider" defaultValue={opportunity?.incumbent_provider ?? ''} />
        </Field>
      </div>

      <Field label="Scope and notes" htmlFor="scope_notes">
        <Textarea id="scope_notes" name="scope_notes" rows={4} defaultValue={opportunity?.scope_notes ?? ''} />
      </Field>

      <FormError message={state.error} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : opportunity ? 'Save changes' : 'Create deal'}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={opportunity ? `/opportunities/${opportunity.id}` : '/opportunities'}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
