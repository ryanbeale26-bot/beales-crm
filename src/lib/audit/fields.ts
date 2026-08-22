import {
  ACCOUNT_STATUS_LABELS,
  ASSIGNMENT_ROLE_LABELS,
  BUILDING_STATUS_LABELS,
  ENTITY_LABELS,
  HEALTH_LABELS,
} from '@/lib/format'

/**
 * What the history screens are allowed to say.
 *
 * Everything here is an ALLOWLIST, twice over — which tables are rendered, and
 * which of their fields. Same argument as `gap_fill_allows()`: a denylist
 * starts printing a new column the day somebody adds one, and the column that
 * eventually gets added is always the one you would not have wanted printed.
 *
 * The pay-rate case is the reason it matters. `employee_compensation` and
 * `employee_assignment_rates` are audited, so every rate ever set is in
 * `audit_log`. Migration 20260821092000 stops the database handing those rows
 * to anyone without `sees_rates`; leaving both tables off this list as well
 * means the screen would still not print a rate if that policy were ever
 * reverted. Two independent layers, on purpose.
 */

export const AUDIT_TABLES = [
  'accounts',
  'buildings',
  'building_contract_periods',
  'contacts',
  'opportunities',
  'activities',
  'sites',
  'employees',
  'employee_assignments',
  'next_steps',
  'profiles',
] as const

export type AuditTable = (typeof AUDIT_TABLES)[number]

export function isAuditTable(name: string): name is AuditTable {
  return (AUDIT_TABLES as readonly string[]).includes(name)
}

/** Tables a uuid field can point at. Each needs a lookup in `names.ts`. */
export type RefTable =
  | 'profiles'
  | 'accounts'
  | 'buildings'
  | 'contacts'
  | 'sites'
  | 'employees'
  | 'pipeline_stages'
  | 'property_types'
  | 'loss_reasons'
  | 'competitors'
  | 'lead_sources'
  | 'win_reasons'
  | 'activity_types'

export type FieldSpec = {
  /** "Monthly value", never "monthly_value". */
  label: string
  format?: 'money' | 'date' | 'datetime' | 'sqft' | 'bool' | 'hours' | 'days'
  /** For an enum whose raw value would mislead. Anything else falls back to
   *  `humanise()`, which is honest for values like `scope_add`. */
  labels?: Readonly<Record<string, string>>
  /** A uuid to resolve to somebody's or something's name. */
  ref?: RefTable
}

type Fields = Record<string, FieldSpec>

/**
 * Never shown, on any table.
 *
 * `annual_value` is the one worth explaining: it is a generated column, so it
 * changes on every single edit to `monthly_value` and would print the same
 * change twice, once in dollars per month and once in dollars per year.
 */
const ALWAYS_HIDDEN = new Set([
  'id',
  'created_at',
  'updated_at',
  'import_batch_id',
  'annual_value',
  'external_id',
])

const OWNER: FieldSpec = { label: 'Owner', ref: 'profiles' }
const SECOND_OWNER: FieldSpec = { label: 'Second owner', ref: 'profiles' }
const ARCHIVED: FieldSpec = { label: 'Archived', format: 'datetime' }

const FIELDS: Record<AuditTable, Fields> = {
  accounts: {
    name: { label: 'Name' },
    account_type: { label: 'Type' },
    status: { label: 'Status', labels: ACCOUNT_STATUS_LABELS },
    owner_id: OWNER,
    secondary_owner_id: SECOND_OWNER,
    primary_contact_id: { label: 'Primary contact', ref: 'contacts' },
    hq_address_line1: { label: 'Address' },
    hq_address_line2: { label: 'Address line 2' },
    hq_city: { label: 'City' },
    hq_state: { label: 'State' },
    hq_postal_code: { label: 'Postcode' },
    notes: { label: 'Notes' },
    deleted_at: ARCHIVED,
  },

  buildings: {
    name: { label: 'Name' },
    account_id: { label: 'Account', ref: 'accounts' },
    site_id: { label: 'Physical building', ref: 'sites' },
    tenancy: { label: 'We contract with' },
    address_line1: { label: 'Address' },
    address_line2: { label: 'Address line 2' },
    city: { label: 'City' },
    state: { label: 'State' },
    postal_code: { label: 'Postcode' },
    property_type_id: { label: 'Property type', ref: 'property_types' },
    square_footage: { label: 'Square footage', format: 'sqft' },
    floors: { label: 'Floors' },
    entity: { label: 'Operating entity', labels: ENTITY_LABELS },
    status: { label: 'Status', labels: BUILDING_STATUS_LABELS },
    health_score: { label: 'Health', labels: HEALTH_LABELS },
    contract_start_date: { label: 'Contract start', format: 'date' },
    contract_end_date: { label: 'Contract end', format: 'date' },
    lost_date: { label: 'Lost on', format: 'date' },
    loss_reason_id: { label: 'Loss reason', ref: 'loss_reasons' },
    lost_to_competitor_id: { label: 'Lost to', ref: 'competitors' },
    owner_id: OWNER,
    secondary_owner_id: SECOND_OWNER,
    day_porter: { label: 'Day porter', format: 'bool' },
    day_porter_hours_per_day: { label: 'Day porter hours a day', format: 'hours' },
    day_porter_days_per_week: { label: 'Day porter days a week', format: 'days' },
    night_hours_per_night: { label: 'Night hours a night', format: 'hours' },
    night_days_per_week: { label: 'Night days a week', format: 'days' },
    weekend_service: { label: 'Weekend service', format: 'bool' },
    weekend_hours_per_week: { label: 'Weekend hours a week', format: 'hours' },
    scope_notes: { label: 'Scope of work' },
    inspectqa_site_id: { label: 'InspectQA site' },
    deleted_at: ARCHIVED,
  },

  building_contract_periods: {
    monthly_value: { label: 'Monthly value', format: 'money' },
    effective_date: { label: 'In effect from', format: 'date' },
    end_date: { label: 'In effect until', format: 'date' },
    change_reason: { label: 'Reason' },
    notes: { label: 'Notes' },
    building_id: { label: 'Building', ref: 'buildings' },
  },

  contacts: {
    first_name: { label: 'First name' },
    last_name: { label: 'Last name' },
    title: { label: 'Job title' },
    account_id: { label: 'Account', ref: 'accounts' },
    email: { label: 'Email' },
    phone: { label: 'Phone' },
    mobile: { label: 'Mobile' },
    contact_role: { label: 'Role' },
    address_line1: { label: 'Address' },
    city: { label: 'City' },
    state: { label: 'State' },
    postal_code: { label: 'Postcode' },
    notes: { label: 'Notes' },
    deleted_at: ARCHIVED,
  },

  opportunities: {
    name: { label: 'Name' },
    stage_id: { label: 'Stage', ref: 'pipeline_stages' },
    account_id: { label: 'Account', ref: 'accounts' },
    building_id: { label: 'Building', ref: 'buildings' },
    monthly_value: { label: 'Monthly value', format: 'money' },
    opened_on: { label: 'Opened', format: 'date' },
    expected_close_date: { label: 'Expected close', format: 'date' },
    actual_close_date: { label: 'Closed on', format: 'date' },
    owner_id: OWNER,
    secondary_owner_id: SECOND_OWNER,
    lead_source_id: { label: 'Lead source', ref: 'lead_sources' },
    loss_reason_id: { label: 'Loss reason', ref: 'loss_reasons' },
    win_reason_id: { label: 'Win reason', ref: 'win_reasons' },
    win_notes: { label: 'Win notes' },
    competitor_id: { label: 'Competitor', ref: 'competitors' },
    incumbent_provider: { label: 'Incumbent' },
    property_type_id: { label: 'Property type', ref: 'property_types' },
    square_footage: { label: 'Square footage', format: 'sqft' },
    current_staff_count: { label: 'Current staff' },
    entity: { label: 'Operating entity', labels: ENTITY_LABELS },
    address_line1: { label: 'Address' },
    city: { label: 'City' },
    state: { label: 'State' },
    scope_notes: { label: 'Scope of work' },
    deleted_at: ARCHIVED,
  },

  activities: {
    subject: { label: 'Subject' },
    body: { label: 'Notes' },
    activity_type_id: { label: 'Type', ref: 'activity_types' },
    occurred_at: { label: 'Happened', format: 'datetime' },
    logged_by: { label: 'Logged by', ref: 'profiles' },
    account_id: { label: 'Account', ref: 'accounts' },
    building_id: { label: 'Building', ref: 'buildings' },
    contact_id: { label: 'Contact', ref: 'contacts' },
    opportunity_id: { label: 'Deal' },
    employee_id: { label: 'Employee', ref: 'employees' },
    source: { label: 'Came from' },
  },

  sites: {
    name: { label: 'Name' },
    address_line1: { label: 'Address' },
    address_line2: { label: 'Address line 2' },
    city: { label: 'City' },
    state: { label: 'State' },
    postal_code: { label: 'Postcode' },
    square_footage: { label: 'Square footage', format: 'sqft' },
    floors: { label: 'Floors' },
    notes: { label: 'Notes' },
    deleted_at: ARCHIVED,
  },

  // No pay rate here: base_pay_rate lives in employee_compensation, which is
  // deliberately not a table this file knows about.
  employees: {
    first_name: { label: 'First name' },
    last_name: { label: 'Last name' },
    title: { label: 'Job title' },
    email: { label: 'Email' },
    phone: { label: 'Phone' },
    employment_type: { label: 'Employment type' },
    status: { label: 'Status' },
    start_date: { label: 'Started', format: 'date' },
    end_date: { label: 'Left', format: 'date' },
    termination_reason: { label: 'Reason for leaving' },
    supervisor_id: { label: 'Supervisor', ref: 'employees' },
    paychex_employee_id: { label: 'Paychex id' },
    deleted_at: ARCHIVED,
  },

  // Hours and dates only. pay_rate and bill_rate are in
  // employee_assignment_rates, which is off the table list above.
  employee_assignments: {
    employee_id: { label: 'Employee', ref: 'employees' },
    building_id: { label: 'Building', ref: 'buildings' },
    role: { label: 'Designation', labels: ASSIGNMENT_ROLE_LABELS },
    scheduled_hours_per_week: { label: 'Scheduled hours a week', format: 'hours' },
    shift: { label: 'Shift' },
    start_date: { label: 'Started', format: 'date' },
    end_date: { label: 'Ended', format: 'date' },
    end_reason: { label: 'Reason for ending' },
  },

  next_steps: {
    title: { label: 'Title' },
    detail: { label: 'Detail' },
    due_at: { label: 'Due', format: 'datetime' },
    all_day: { label: 'All day', format: 'bool' },
    status: { label: 'Status' },
    origin: { label: 'Came from' },
    owner_id: OWNER,
    account_id: { label: 'Account', ref: 'accounts' },
    building_id: { label: 'Building', ref: 'buildings' },
    contact_id: { label: 'Contact', ref: 'contacts' },
    completed_at: { label: 'Completed', format: 'datetime' },
    // A meeting that left the calendar. Both are here so a flag reads as
    // English rather than as an entry with nothing in it — the renderer prints
    // only allowlisted fields, so an update touching none of them would show a
    // history line with an empty change list.
    vanished_at: { label: 'Off the calendar', format: 'datetime' },
    vanished_reason: { label: 'Because' },
  },

  // Role and rate ACCESS, never a rate. Rendered on the admin feed only.
  profiles: {
    full_name: { label: 'Name' },
    role: { label: 'Role' },
    sees_rates: { label: 'Can see pay rates', format: 'bool' },
    is_active: { label: 'Can sign in', format: 'bool' },
    is_service: { label: 'Machine account', format: 'bool' },
  },
}

/** The spec for a field, or null if it is not ours to print. */
export function fieldSpec(table: AuditTable, column: string): FieldSpec | null {
  if (ALWAYS_HIDDEN.has(column)) return null
  return FIELDS[table][column] ?? null
}

/** What one row of this table is called, and where to find it. */
export const TABLE_META: Record<
  AuditTable,
  { singular: string; plural: string; href?: (id: string) => string }
> = {
  accounts: { singular: 'account', plural: 'Accounts', href: (id) => `/accounts/${id}` },
  buildings: { singular: 'building', plural: 'Buildings', href: (id) => `/buildings/${id}` },
  building_contract_periods: { singular: 'contract value', plural: 'Contract values' },
  contacts: { singular: 'contact', plural: 'Contacts', href: (id) => `/contacts/${id}` },
  opportunities: { singular: 'deal', plural: 'Deals', href: (id) => `/opportunities/${id}` },
  activities: { singular: 'activity', plural: 'Activity' },
  sites: { singular: 'physical building', plural: 'Physical buildings' },
  employees: { singular: 'employee', plural: 'Employees' },
  employee_assignments: { singular: 'assignment', plural: 'Assignments' },
  next_steps: { singular: 'next step', plural: 'Next steps' },
  profiles: { singular: 'person', plural: 'People' },
}

/**
 * What the record is called, taken from the row's own snapshot rather than
 * looked up — so a record that has since been deleted still reads by name.
 */
export function subjectName(
  table: AuditTable,
  values: Record<string, unknown> | null,
): string | null {
  if (!values) return null
  const text = (key: string) => (typeof values[key] === 'string' ? (values[key] as string) : '')

  if (table === 'contacts' || table === 'employees') {
    return [text('first_name'), text('last_name')].filter(Boolean).join(' ').trim() || null
  }
  if (table === 'profiles') return text('full_name') || text('email') || null
  if (table === 'activities') return text('subject') || null
  if (table === 'next_steps') return text('title') || null
  if (table === 'building_contract_periods') return null
  return text('name') || null
}
