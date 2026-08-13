import Link from 'next/link'

import { EmptyState, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ASSIGNMENT_ROLE_LABELS, fullName } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('employees')
    .select('id, first_name, last_name, title, status, employment_type')
    .is('deleted_at', null)
    .order('last_name')

  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,title.ilike.%${q}%`)

  const [{ data: employees, error }, { data: assignments }] = await Promise.all([
    query,
    supabase
      .from('employee_assignments')
      .select('employee_id, role, scheduled_hours_per_week, building:buildings(id, name)')
      .is('end_date', null),
  ])

  const byEmployee = new Map<string, { name: string; role: string; hours: number | null }[]>()
  for (const a of assignments ?? []) {
    const list = byEmployee.get(a.employee_id) ?? []
    list.push({
      name: a.building?.name ?? '',
      role: ASSIGNMENT_ROLE_LABELS[a.role ?? 'other'],
      hours: a.scheduled_hours_per_week ? Number(a.scheduled_hours_per_week) : null,
    })
    byEmployee.set(a.employee_id, list)
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={
          employees ? `${employees.length} ${employees.length === 1 ? 'person' : 'people'}` : undefined
        }
        action={
          <Button asChild>
            <Link href="/employees/new">New employee</Link>
          </Button>
        }
      />

      <form className="mb-5 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search employees…"
          className="max-w-xs"
          aria-label="Search employees"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q && (
          <Button variant="ghost" asChild>
            <Link href="/employees">Clear</Link>
          </Button>
        )}
      </form>

      {error && <p className="text-destructive text-sm">Could not load employees: {error.message}</p>}

      {employees && employees.length === 0 ? (
        <EmptyState title={q ? 'Nobody matches that.' : 'No employees yet.'}>
          {q ? (
            <Link href="/employees" className="underline">
              Clear the search
            </Link>
          ) : (
            <>
              Add them here, or straight from a building&rsquo;s page where they&rsquo;ll be
              assigned at the same time.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="border-border border-t">
          {employees?.map((e) => {
            const posts = byEmployee.get(e.id) ?? []
            return (
              <div key={e.id} className="border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-2 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{fullName(e)}</span>
                    {e.status !== 'active' && <Badge variant="secondary">{e.status}</Badge>}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {[e.title, e.employment_type].filter(Boolean).join(' · ') || 'No title'}
                  </p>
                </div>
                <div className="text-muted-foreground text-right text-sm">
                  {posts.length === 0
                    ? 'Not assigned'
                    : posts.map((p, i) => (
                        <div key={i}>
                          {p.name} — {p.role}
                          {p.hours ? ` (${p.hours} hrs)` : ''}
                        </div>
                      ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
