'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export type FormState = { error?: string }

/** '' from an unfilled input means "no value", not empty string. */
function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? '').trim()
  return value === '' ? null : value
}

function number(formData: FormData, key: string): number | null {
  const value = text(formData, key)
  if (value === null) return null
  const n = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

export async function saveAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, 'id')
  const name = text(formData, 'name')

  // The only genuinely required field: a customer without a name is unusable.
  if (!name) return { error: 'Give the account a name.' }

  const values = {
    name,
    account_type: text(formData, 'account_type'),
    status: (text(formData, 'status') ?? 'prospect') as 'prospect' | 'active' | 'former',
    owner_id: text(formData, 'owner_id'),
    secondary_owner_id: text(formData, 'secondary_owner_id'),
    hq_address_line1: text(formData, 'hq_address_line1'),
    hq_city: text(formData, 'hq_city'),
    hq_state: text(formData, 'hq_state'),
    hq_postal_code: text(formData, 'hq_postal_code'),
    notes: text(formData, 'notes'),
  }

  const supabase = await createClient()

  if (id) {
    const { error } = await supabase.from('accounts').update(values).eq('id', id)
    if (error) return { error: `Could not save: ${error.message}` }
    revalidatePath('/accounts')
    revalidatePath(`/accounts/${id}`)
    redirect(`/accounts/${id}`)
  }

  const { data, error } = await supabase.from('accounts').insert(values).select('id').single()
  if (error) return { error: `Could not create the account: ${error.message}` }

  revalidatePath('/accounts')
  redirect(`/accounts/${data.id}`)
}

export async function saveBuilding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, 'id')
  const accountId = text(formData, 'account_id')
  const name = text(formData, 'name')

  if (!accountId) return { error: 'A building has to belong to an account.' }
  if (!name) return { error: 'Give the building a name.' }

  const status = (text(formData, 'status') ?? 'pending') as 'pending' | 'active' | 'lost'

  const values = {
    account_id: accountId,
    name,
    address_line1: text(formData, 'address_line1'),
    city: text(formData, 'city'),
    state: text(formData, 'state'),
    postal_code: text(formData, 'postal_code'),
    property_type_id: text(formData, 'property_type_id'),
    square_footage: number(formData, 'square_footage'),
    entity: (text(formData, 'entity') ?? 'beales') as 'beales' | 'afs',
    contract_start_date: text(formData, 'contract_start_date'),
    contract_end_date: text(formData, 'contract_end_date'),
    day_porter: formData.get('day_porter') === 'on',
    day_porter_hours_per_day: number(formData, 'day_porter_hours_per_day'),
    day_porter_days_per_week: number(formData, 'day_porter_days_per_week'),
    night_hours_per_night: number(formData, 'night_hours_per_night'),
    night_days_per_week: number(formData, 'night_days_per_week'),
    weekend_service: formData.get('weekend_service') === 'on',
    weekend_hours_per_week: number(formData, 'weekend_hours_per_week'),
    scope_notes: text(formData, 'scope_notes'),
    status,
    health_score: text(formData, 'health_score') as
      | 'healthy'
      | 'needs_attention'
      | 'at_risk'
      | null,
    owner_id: text(formData, 'owner_id'),
    secondary_owner_id: text(formData, 'secondary_owner_id'),
    lost_date: status === 'lost' ? (text(formData, 'lost_date') ?? new Date().toISOString().slice(0, 10)) : null,
  }

  const supabase = await createClient()

  let buildingId = id
  if (id) {
    const { error } = await supabase.from('buildings').update(values).eq('id', id)
    if (error) return { error: `Could not save: ${error.message}` }
  } else {
    const { data, error } = await supabase.from('buildings').insert(values).select('id').single()
    if (error) return { error: `Could not create the building: ${error.message}` }
    buildingId = data.id
  }

  // Service types are a join table, because a site is often janitorial and
  // maintenance both. Replace the set rather than diffing it.
  if (buildingId) {
    const chosen = formData.getAll('service_type_ids').map(String).filter(Boolean)
    await supabase.from('building_services').delete().eq('building_id', buildingId)
    if (chosen.length > 0) {
      const { error } = await supabase
        .from('building_services')
        .insert(chosen.map((service_type_id) => ({ building_id: buildingId, service_type_id })))
      if (error) return { error: `Saved the building, but not its services: ${error.message}` }
    }
  }

  // Monthly value never gets written straight into a column. This closes the
  // current contract period and opens a new one, so the revenue history that
  // the MRR reports depend on builds itself.
  //
  // Unless it was simply the wrong number. A correction amends the open period
  // in place: putting a corrected figure through set_building_monthly_value()
  // records an expansion or a contraction in the revenue report that never
  // happened, and there is no screen anywhere to take it back.
  const monthlyValue = number(formData, 'monthly_value')
  const isCorrection = formData.get('value_is_correction') === 'on'
  if (monthlyValue !== null && buildingId) {
    const { error } = isCorrection
      ? await supabase.rpc('correct_open_contract_value', {
          p_building_id: buildingId,
          p_monthly_value: monthlyValue,
        })
      : await supabase.rpc('set_building_monthly_value', {
          p_building_id: buildingId,
          p_monthly_value: monthlyValue,
          p_effective_date:
            text(formData, 'value_effective_date') ??
            values.contract_start_date ??
            new Date().toISOString().slice(0, 10),
        })
    if (error) return { error: `Saved the building, but not its value: ${error.message}` }
  }

  // Marking a building lost has to stop its revenue too, or it bills forever.
  if (status === 'lost' && buildingId) {
    const { error } = await supabase.rpc('close_building_contract', {
      p_building_id: buildingId,
      p_lost_date: values.lost_date!,
    })
    if (error) return { error: `Saved, but could not close the contract: ${error.message}` }
  }

  revalidatePath('/buildings')
  revalidatePath(`/accounts/${accountId}`)
  redirect(`/buildings/${buildingId}`)
}

export async function saveContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, 'id')
  const firstName = text(formData, 'first_name')
  const lastName = text(formData, 'last_name')

  if (!firstName && !lastName) return { error: 'Give the contact a name.' }

  const values = {
    first_name: firstName ?? '',
    last_name: lastName ?? '',
    title: text(formData, 'title'),
    account_id: text(formData, 'account_id'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    mobile: text(formData, 'mobile'),
    contact_role: text(formData, 'contact_role'),
    notes: text(formData, 'notes'),
  }

  const supabase = await createClient()

  if (id) {
    const { error } = await supabase.from('contacts').update(values).eq('id', id)
    if (error) return { error: `Could not save: ${error.message}` }
    revalidatePath('/contacts')
    revalidatePath(`/contacts/${id}`)
    redirect(`/contacts/${id}`)
  }

  const { data, error } = await supabase.from('contacts').insert(values).select('id').single()
  if (error) return { error: `Could not create the contact: ${error.message}` }

  revalidatePath('/contacts')
  redirect(`/contacts/${data.id}`)
}

export async function saveEmployee(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, 'id')
  const firstName = text(formData, 'first_name')
  const lastName = text(formData, 'last_name')

  if (!firstName && !lastName) return { error: 'Give the employee a name.' }

  const values = {
    first_name: firstName ?? '',
    last_name: lastName ?? '',
    title: text(formData, 'title'),
    phone: text(formData, 'phone'),
    email: text(formData, 'email'),
    employment_type: text(formData, 'employment_type'),
    start_date: text(formData, 'start_date'),
    status: (text(formData, 'status') ?? 'active') as 'active' | 'terminated' | 'leave',
    paychex_employee_id: text(formData, 'paychex_employee_id'),
  }

  const supabase = await createClient()

  if (id) {
    const { error } = await supabase.from('employees').update(values).eq('id', id)
    if (error) return { error: `Could not save: ${error.message}` }
    revalidatePath('/employees')
    redirect(`/employees`)
  }

  const { data, error } = await supabase.from('employees').insert(values).select('id').single()
  if (error) return { error: `Could not create the employee: ${error.message}` }

  // Created from a building page? Put them straight to work there.
  const buildingId = text(formData, 'assign_to_building')
  if (buildingId) {
    await supabase.from('employee_assignments').insert({
      employee_id: data.id,
      building_id: buildingId,
      role: (text(formData, 'role') ?? 'other') as AssignmentRole,
      scheduled_hours_per_week: number(formData, 'scheduled_hours_per_week'),
      start_date: text(formData, 'start_date') ?? new Date().toISOString().slice(0, 10),
    })
    revalidatePath(`/buildings/${buildingId}`)
    redirect(`/buildings/${buildingId}`)
  }

  revalidatePath('/employees')
  redirect('/employees')
}

type AssignmentRole = 'day_porter' | 'night_cleaner' | 'lead_cleaner' | 'supervisor' | 'other'

/** Put an existing employee to work at a building. */
export async function assignEmployee(formData: FormData) {
  const buildingId = String(formData.get('building_id'))
  const employeeId = String(formData.get('employee_id'))
  if (!buildingId || !employeeId) return

  const supabase = await createClient()
  await supabase.from('employee_assignments').insert({
    building_id: buildingId,
    employee_id: employeeId,
    role: (String(formData.get('role') || 'other') as AssignmentRole) ?? 'other',
    scheduled_hours_per_week: number(formData, 'scheduled_hours_per_week'),
    start_date: String(formData.get('start_date') || new Date().toISOString().slice(0, 10)),
  })

  revalidatePath(`/buildings/${buildingId}`)
}

/**
 * End an assignment rather than deleting it. An assignment that ended plus
 * another that began is how the staff-movement report sees a move — deleting
 * the row would erase that history.
 */
export async function endAssignment(formData: FormData) {
  const id = String(formData.get('assignment_id'))
  const buildingId = String(formData.get('building_id'))

  const supabase = await createClient()
  await supabase
    .from('employee_assignments')
    .update({
      end_date: new Date().toISOString().slice(0, 10),
      end_reason: String(formData.get('end_reason') || '') || null,
    })
    .eq('id', id)

  revalidatePath(`/buildings/${buildingId}`)
}

/** Link or unlink a contact and a building. */
export async function linkContactToBuilding(formData: FormData) {
  const contactId = String(formData.get('contact_id'))
  const buildingId = String(formData.get('building_id'))
  if (!contactId || !buildingId) return

  const supabase = await createClient()
  await supabase
    .from('contact_buildings')
    .upsert({ contact_id: contactId, building_id: buildingId }, { onConflict: 'contact_id,building_id' })

  revalidatePath(`/contacts/${contactId}`)
  revalidatePath(`/buildings/${buildingId}`)
}

export async function unlinkContactFromBuilding(formData: FormData) {
  const contactId = String(formData.get('contact_id'))
  const buildingId = String(formData.get('building_id'))

  const supabase = await createClient()
  await supabase
    .from('contact_buildings')
    .delete()
    .eq('contact_id', contactId)
    .eq('building_id', buildingId)

  revalidatePath(`/contacts/${contactId}`)
  revalidatePath(`/buildings/${buildingId}`)
}
