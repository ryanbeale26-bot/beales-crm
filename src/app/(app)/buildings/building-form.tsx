'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { saveBuilding, type FormState } from '@/app/(app)/actions'
import { Field, FormError, Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  BUILDING_STATUS_LABELS,
  ENTITY_LABELS,
  HEALTH_LABELS,
  dateInputValue,
} from '@/lib/format'

type Building = {
  id: string
  account_id: string
  name: string
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  property_type_id: string | null
  square_footage: number | null
  entity: 'beales' | 'afs'
  contract_start_date: string | null
  contract_end_date: string | null
  service_days: boolean
  service_nights: boolean
  scope_notes: string | null
  status: 'pending' | 'active' | 'lost'
  health_score: 'healthy' | 'needs_attention' | 'at_risk' | null
  owner_id: string | null
  secondary_owner_id: string | null
  lost_date: string | null
}

export function BuildingForm({
  building,
  accountId,
  accounts,
  owners,
  propertyTypes,
  currentMonthlyValue,
}: {
  building?: Building
  accountId?: string
  accounts: { id: string; name: string }[]
  owners: { id: string; full_name: string; email: string; is_active: boolean }[]
  propertyTypes: { id: string; name: string }[]
  currentMonthlyValue?: number | null
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBuilding, {})
  const [status, setStatus] = useState(building?.status ?? 'pending')

  return (
    <form action={action} className="max-w-2xl space-y-5">
      {building && <input type="hidden" name="id" value={building.id} />}

      <Field label="Account" htmlFor="account_id" required>
        <Select
          id="account_id"
          name="account_id"
          required
          defaultValue={building?.account_id ?? accountId ?? ''}
        >
          <option value="">Choose an account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Building name" htmlFor="name" required hint="What your team calls it, e.g. 1 Brookline Place">
        <Input id="name" name="name" defaultValue={building?.name ?? ''} required autoFocus />
      </Field>

      <Field label="Street address" htmlFor="address_line1">
        <Input id="address_line1" name="address_line1" defaultValue={building?.address_line1 ?? ''} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={building?.city ?? ''} />
        </Field>
        <Field label="State" htmlFor="state">
          <Input id="state" name="state" defaultValue={building?.state ?? ''} maxLength={2} />
        </Field>
        <Field label="ZIP" htmlFor="postal_code">
          <Input id="postal_code" name="postal_code" defaultValue={building?.postal_code ?? ''} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Property type" htmlFor="property_type_id">
          <Select id="property_type_id" name="property_type_id" defaultValue={building?.property_type_id ?? ''}>
            <option value="">Not set</option>
            {propertyTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Square footage" htmlFor="square_footage">
          <Input
            id="square_footage"
            name="square_footage"
            inputMode="numeric"
            defaultValue={building?.square_footage ?? ''}
          />
        </Field>

        <Field label="Operating entity" htmlFor="entity" hint="Revenue reports split by this.">
          <Select id="entity" name="entity" defaultValue={building?.entity ?? 'beales'}>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Health" htmlFor="health_score">
          <Select id="health_score" name="health_score" defaultValue={building?.health_score ?? ''}>
            <option value="">Not set</option>
            {Object.entries(HEALTH_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="bg-muted/40 space-y-5 rounded-xl border p-4">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Monthly value"
            htmlFor="monthly_value"
            hint={
              currentMonthlyValue
                ? 'Changing this keeps the old figure in the revenue history.'
                : 'Annual value is worked out from this.'
            }
          >
            <Input
              id="monthly_value"
              name="monthly_value"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={currentMonthlyValue ?? ''}
            />
          </Field>

          <Field
            label="Value effective from"
            htmlFor="value_effective_date"
            hint="Leave blank to use today, or the contract start."
          >
            <Input id="value_effective_date" name="value_effective_date" type="date" />
          </Field>

          <Field label="Contract start" htmlFor="contract_start_date">
            <Input
              id="contract_start_date"
              name="contract_start_date"
              type="date"
              defaultValue={dateInputValue(building?.contract_start_date)}
            />
          </Field>

          <Field label="Renewal date" htmlFor="contract_end_date">
            <Input
              id="contract_end_date"
              name="contract_end_date"
              type="date"
              defaultValue={dateInputValue(building?.contract_end_date)}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Status" htmlFor="status">
          <Select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            {Object.entries(BUILDING_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {status === 'lost' && (
          <Field label="Lost on" htmlFor="lost_date" hint="Revenue stops from this date.">
            <Input
              id="lost_date"
              name="lost_date"
              type="date"
              defaultValue={dateInputValue(building?.lost_date) || new Date().toISOString().slice(0, 10)}
            />
          </Field>
        )}

        <Field label="Owner" htmlFor="owner_id">
          <Select id="owner_id" name="owner_id" defaultValue={building?.owner_id ?? ''}>
            <option value="">Nobody yet</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name || o.email}
                {!o.is_active && ' (no longer here)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Second owner" htmlFor="secondary_owner_id">
          <Select id="secondary_owner_id" name="secondary_owner_id" defaultValue={building?.secondary_owner_id ?? ''}>
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Service times</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="service_days" defaultChecked={building?.service_days} className="size-4" />
          Days
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="service_nights" defaultChecked={building?.service_nights} className="size-4" />
          Nights
        </label>
      </fieldset>

      <Field label="Scope of work" htmlFor="scope_notes">
        <Textarea id="scope_notes" name="scope_notes" rows={4} defaultValue={building?.scope_notes ?? ''} />
      </Field>

      <FormError message={state.error} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : building ? 'Save changes' : 'Create building'}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={building ? `/buildings/${building.id}` : `/accounts/${accountId ?? ''}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
