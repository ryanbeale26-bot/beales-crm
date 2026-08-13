import Link from 'next/link'
import { notFound } from 'next/navigation'

import { assignEmployee, endAssignment } from '@/app/(app)/actions'
import { Select } from '@/components/form-field'
import { EmptyState, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ASSIGNMENT_ROLE_LABELS,
  BUILDING_STATUS_LABELS,
  ENTITY_LABELS,
  HEALTH_LABELS,
  date,
  fullName,
  money,
  squareFeet,
} from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: building, error } = await supabase
    .from('buildings')
    .select(
      `*,
       account:accounts(id, name),
       property_type:property_types(name),
       owner:profiles!buildings_owner_id_fkey(full_name, is_active),
       secondary_owner:profiles!buildings_secondary_owner_id_fkey(full_name)`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  // A failed query is not a missing record — don't hide bugs behind a 404.
  if (error) throw new Error(`Could not load this building: ${error.message}`)
  if (!building) notFound()

  const [{ data: periods }, { data: links }, { data: hours }, { data: services }, { data: staff }, { data: allEmployees }] =
    await Promise.all([
    supabase
      .from('building_contract_periods')
      .select('id, effective_date, end_date, monthly_value, annual_value, change_reason')
      .eq('building_id', id)
      .order('effective_date', { ascending: false }),
      supabase
        .from('contact_buildings')
        .select('contact:contacts(id, first_name, last_name, title, email, phone)')
        .eq('building_id', id),
      supabase
        .from('v_building_hours')
        .select('weekly_hours, monthly_hours, annual_hours')
        .eq('building_id', id)
        .maybeSingle(),
      supabase
        .from('building_services')
        .select('service_type:service_types(name)')
        .eq('building_id', id),
      supabase
        .from('employee_assignments')
        .select(
          'id, role, scheduled_hours_per_week, start_date, end_date, employee:employees(id, first_name, last_name, title)',
        )
        .eq('building_id', id)
        .order('end_date', { nullsFirst: true })
        .order('start_date', { ascending: false }),
      supabase
        .from('employees')
        .select('id, first_name, last_name')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('last_name'),
    ])

  const current = periods?.find((p) => p.end_date === null)
  const currentStaff = (staff ?? []).filter((s) => s.end_date === null)
  const pastStaff = (staff ?? []).filter((s) => s.end_date !== null)
  const scheduled = currentStaff.reduce(
    (sum, s) => sum + Number(s.scheduled_hours_per_week ?? 0),
    0,
  )
  const contracted = Number(hours?.weekly_hours ?? 0)
  const assignedIds = new Set(currentStaff.map((s) => s.employee?.id))
  const assignable = (allEmployees ?? []).filter((e) => !assignedIds.has(e.id))

  return (
    <div>
      <PageHeader
        title={building.name}
        backHref={`/accounts/${building.account?.id}?tab=Buildings`}
        backLabel={building.account?.name ?? 'Account'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={building.status === 'active' ? 'default' : 'secondary'}>
              {BUILDING_STATUS_LABELS[building.status]}
            </Badge>
            {building.health_score && (
              <Badge variant={building.health_score === 'at_risk' ? 'destructive' : 'outline'}>
                {HEALTH_LABELS[building.health_score]}
              </Badge>
            )}
            <span>
              {current ? `${money(current.monthly_value)}/mo · ${money(current.annual_value)}/yr` : 'No contract value'}
              {building.square_footage ? ` · ${squareFeet(building.square_footage)}` : ''}
            </span>
          </span>
        }
        action={
          <Button variant="outline" asChild>
            <Link href={`/buildings/${id}/edit`}>Edit</Link>
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium">Details</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Address">
              {[building.address_line1, building.city, building.state, building.postal_code]
                .filter(Boolean)
                .join(', ') || '—'}
            </Row>
            <Row label="Property type">{building.property_type?.name ?? '—'}</Row>
            <Row label="Entity">{ENTITY_LABELS[building.entity]}</Row>
            <Row label="Contract">
              {date(building.contract_start_date)} → {date(building.contract_end_date)}
            </Row>
            <Row label="Service type">
              {services && services.length > 0
                ? services.map((s) => s.service_type?.name).filter(Boolean).join(', ')
                : '—'}
            </Row>
            <Row label="Owner">
              {building.owner?.full_name ?? '—'}
              {building.owner && !building.owner.is_active && (
                <span className="text-muted-foreground"> (no longer here)</span>
              )}
            </Row>
            <Row label="Second owner">{building.secondary_owner?.full_name ?? '—'}</Row>
            {building.status === 'lost' && <Row label="Lost on">{date(building.lost_date)}</Row>}
          </dl>

          <h2 className="mt-6 mb-3 text-sm font-medium">Contracted hours</h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Per week" value={hours?.weekly_hours} />
            <Stat label="Per month" value={hours?.monthly_hours} />
            <Stat label="Per year" value={hours?.annual_hours} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Day porter">
              {building.day_porter
                ? `${building.day_porter_hours_per_day ?? 0} hrs × ${building.day_porter_days_per_week ?? 5} days`
                : 'No'}
            </Row>
            <Row label="Nights">
              {building.night_hours_per_night
                ? `${building.night_hours_per_night} hrs × ${building.night_days_per_week ?? 5} nights`
                : '—'}
            </Row>
            <Row label="Weekends">
              {building.weekend_service
                ? `${building.weekend_hours_per_week ?? 0} hrs per week`
                : 'No'}
            </Row>
          </dl>

          {building.scope_notes && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-medium">Scope of work</h2>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {building.scope_notes}
              </p>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">Contract value history</h2>
          {periods && periods.length > 0 ? (
            <ul className="divide-border overflow-hidden rounded-xl border text-sm">
              {periods.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0">
                  <div>
                    <div className="font-medium">{money(p.monthly_value)}/mo</div>
                    <div className="text-muted-foreground text-xs">
                      {date(p.effective_date)} → {p.end_date ? date(p.end_date) : 'now'} ·{' '}
                      {p.change_reason.replace(/_/g, ' ')}
                    </div>
                  </div>
                  {p.end_date === null && <Badge variant="outline">Current</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No contract value recorded.">
              <Link href={`/buildings/${id}/edit`} className="underline">
                Add one
              </Link>{' '}
              — the revenue reports read this history.
            </EmptyState>
          )}

          <div className="mt-6 mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">Beale&rsquo;s staff here</h2>
            {currentStaff.length > 0 && (
              <span
                className={
                  contracted > 0 && Math.abs(scheduled - contracted) > 0.01
                    ? 'text-destructive text-xs'
                    : 'text-muted-foreground text-xs'
                }
              >
                {scheduled} scheduled vs {contracted} contracted hrs/wk
              </span>
            )}
          </div>

          {currentStaff.length > 0 ? (
            <ul className="divide-border mb-3 overflow-hidden rounded-xl border text-sm">
              {currentStaff.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0">
                  <div>
                    <div className="font-medium">{fullName(a.employee)}</div>
                    <div className="text-muted-foreground text-xs">
                      {ASSIGNMENT_ROLE_LABELS[a.role ?? 'other']}
                      {a.scheduled_hours_per_week ? ` · ${a.scheduled_hours_per_week} hrs/wk` : ''}
                      {` · since ${date(a.start_date)}`}
                    </div>
                  </div>
                  <form action={endAssignment}>
                    <input type="hidden" name="assignment_id" value={a.id} />
                    <input type="hidden" name="building_id" value={id} />
                    <Button type="submit" variant="ghost" size="sm">
                      End
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mb-3 text-sm">Nobody assigned here yet.</p>
          )}

          {assignable.length > 0 && (
            <form action={assignEmployee} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="building_id" value={id} />
              <div className="min-w-40 flex-1">
                <label htmlFor="employee_id" className="text-muted-foreground mb-1 block text-xs">
                  Employee
                </label>
                <Select id="employee_id" name="employee_id" required>
                  <option value="">Choose…</option>
                  {assignable.map((e) => (
                    <option key={e.id} value={e.id}>
                      {fullName(e)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-36">
                <label htmlFor="role" className="text-muted-foreground mb-1 block text-xs">
                  Designation
                </label>
                <Select id="role" name="role" defaultValue="night_cleaner">
                  {Object.entries(ASSIGNMENT_ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-24">
                <label
                  htmlFor="scheduled_hours_per_week"
                  className="text-muted-foreground mb-1 block text-xs"
                >
                  Hrs/wk
                </label>
                <Input id="scheduled_hours_per_week" name="scheduled_hours_per_week" inputMode="decimal" />
              </div>
              <Button type="submit" variant="secondary">
                Assign
              </Button>
            </form>
          )}

          <p className="text-muted-foreground mt-2 text-xs">
            Not on the list?{' '}
            <Link href={`/employees/new?building=${id}`} className="underline">
              Add a new employee
            </Link>
          </p>

          {pastStaff.length > 0 && (
            <details className="mt-4">
              <summary className="text-muted-foreground cursor-pointer text-sm">
                Previously here ({pastStaff.length})
              </summary>
              <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                {pastStaff.map((a) => (
                  <li key={a.id}>
                    {fullName(a.employee)} — {ASSIGNMENT_ROLE_LABELS[a.role ?? 'other']}, until{' '}
                    {date(a.end_date)}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <h2 className="mt-6 mb-3 text-sm font-medium">Contacts at this building</h2>
          {links && links.length > 0 ? (
            <ul className="divide-border overflow-hidden rounded-xl border text-sm">
              {links.map(
                ({ contact }) =>
                  contact && (
                    <li key={contact.id} className="border-b p-3 last:border-b-0">
                      <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline">
                        {fullName(contact)}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {[contact.title, contact.email, contact.phone].filter(Boolean).join(' · ')}
                      </div>
                    </li>
                  ),
              )}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              None linked yet. Link them from a contact&rsquo;s page.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-semibold">
        {value === null || value === undefined ? '—' : Number(value).toLocaleString('en-US')}
      </div>
      <div className="text-muted-foreground text-xs">hours</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="text-muted-foreground w-32 shrink-0">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
