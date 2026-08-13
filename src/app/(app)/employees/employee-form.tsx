'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { saveEmployee, type FormState } from '@/app/(app)/actions'
import { Field, FormError, Select } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ASSIGNMENT_ROLE_LABELS, dateInputValue } from '@/lib/format'

type Employee = {
  id: string
  first_name: string
  last_name: string
  title: string | null
  phone: string | null
  email: string | null
  employment_type: string | null
  start_date: string | null
  status: 'active' | 'terminated' | 'leave'
  paychex_employee_id: string | null
}

export function EmployeeForm({
  employee,
  assignToBuilding,
  buildingName,
}: {
  employee?: Employee
  assignToBuilding?: string
  buildingName?: string
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEmployee, {})

  return (
    <form action={action} className="max-w-2xl space-y-5">
      {employee && <input type="hidden" name="id" value={employee.id} />}
      {assignToBuilding && <input type="hidden" name="assign_to_building" value={assignToBuilding} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" htmlFor="first_name">
          <Input id="first_name" name="first_name" defaultValue={employee?.first_name ?? ''} autoFocus />
        </Field>
        <Field label="Last name" htmlFor="last_name">
          <Input id="last_name" name="last_name" defaultValue={employee?.last_name ?? ''} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={employee?.title ?? ''} />
        </Field>
        <Field label="Employment type" htmlFor="employment_type" hint="Full-time, part-time, subcontractor…">
          <Input id="employment_type" name="employment_type" defaultValue={employee?.employment_type ?? ''} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={employee?.phone ?? ''} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={employee?.email ?? ''} />
        </Field>
        <Field label="Start date" htmlFor="start_date">
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={dateInputValue(employee?.start_date)}
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={employee?.status ?? 'active'}>
            <option value="active">Active</option>
            <option value="leave">On leave</option>
            <option value="terminated">Terminated</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Paychex ID"
        htmlFor="paychex_employee_id"
        hint="Optional. Used later to match the weekly payroll emails."
      >
        <Input
          id="paychex_employee_id"
          name="paychex_employee_id"
          defaultValue={employee?.paychex_employee_id ?? ''}
        />
      </Field>

      {assignToBuilding && (
        <fieldset className="bg-muted/40 space-y-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">
            Assign to {buildingName ?? 'this building'}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Designation" htmlFor="role">
              <Select id="role" name="role" defaultValue="night_cleaner">
                {Object.entries(ASSIGNMENT_ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Scheduled hours per week" htmlFor="scheduled_hours_per_week">
              <Input id="scheduled_hours_per_week" name="scheduled_hours_per_week" inputMode="decimal" />
            </Field>
          </div>
        </fieldset>
      )}

      <FormError message={state.error} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : employee ? 'Save changes' : 'Create employee'}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={assignToBuilding ? `/buildings/${assignToBuilding}` : '/employees'}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
