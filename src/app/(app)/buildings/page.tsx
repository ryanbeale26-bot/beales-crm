import Link from 'next/link'

import { EmptyState, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  BUILDING_STATUS_LABELS,
  ENTITY_LABELS,
  HEALTH_LABELS,
  money,
  squareFeet,
} from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; status?: string }>
}) {
  const { q, entity, status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('buildings')
    .select('id, name, city, state, status, entity, square_footage, health_score, account:accounts(id, name)')
    .is('deleted_at', null)
    .order('name')

  if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,address_line1.ilike.%${q}%`)
  if (entity) query = query.eq('entity', entity as 'beales' | 'afs')
  if (status) query = query.eq('status', status as 'pending' | 'active' | 'lost')

  const [{ data: buildings, error }, { data: values }] = await Promise.all([
    query,
    supabase.from('v_building_current_value').select('building_id, monthly_value'),
  ])

  const valueByBuilding = new Map(
    (values ?? []).map((v) => [v.building_id, Number(v.monthly_value ?? 0)]),
  )

  const shown = buildings ?? []
  const totalMrr = shown.reduce((sum, b) => sum + (valueByBuilding.get(b.id) ?? 0), 0)
  const totalSf = shown.reduce((sum, b) => sum + (b.square_footage ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Buildings"
        subtitle={`${shown.length} ${shown.length === 1 ? 'building' : 'buildings'} · ${money(totalMrr)} per month · ${squareFeet(totalSf)}`}
        action={
          <Button asChild>
            <Link href="/buildings/new">New building</Link>
          </Button>
        }
      />

      <form className="mb-5 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name or address…"
          className="max-w-xs"
          aria-label="Search buildings"
        />
        <select
          name="entity"
          defaultValue={entity ?? ''}
          aria-label="Filter by entity"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Both entities</option>
          {Object.entries(ENTITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ''}
          aria-label="Filter by status"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">All statuses</option>
          {Object.entries(BUILDING_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {(q || entity || status) && (
          <Button variant="ghost" asChild>
            <Link href="/buildings">Clear</Link>
          </Button>
        )}
      </form>

      {error && <p className="text-destructive text-sm">Could not load buildings: {error.message}</p>}

      {shown.length === 0 ? (
        <EmptyState title={q || entity || status ? 'Nothing matches that.' : 'No buildings yet.'}>
          {q || entity || status ? (
            <Link href="/buildings" className="underline">
              Clear the filters
            </Link>
          ) : (
            'Buildings are added underneath an account.'
          )}
        </EmptyState>
      ) : (
        <div className="divide-border overflow-hidden rounded-xl border">
          {shown.map((b) => (
            <Link
              key={b.id}
              href={`/buildings/${b.id}`}
              className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b p-4 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{b.name}</span>
                  <Badge variant={b.status === 'active' ? 'default' : 'secondary'}>
                    {BUILDING_STATUS_LABELS[b.status]}
                  </Badge>
                  {b.health_score && (
                    <Badge variant={b.health_score === 'at_risk' ? 'destructive' : 'outline'}>
                      {HEALTH_LABELS[b.health_score]}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {b.account?.name ?? 'No account'} ·{' '}
                  {[b.city, b.state].filter(Boolean).join(', ') || 'No address'} ·{' '}
                  {ENTITY_LABELS[b.entity]}
                </p>
              </div>
              <div className="text-right text-sm font-medium">
                {valueByBuilding.get(b.id) ? (
                  `${money(valueByBuilding.get(b.id))}/mo`
                ) : (
                  <span className="text-muted-foreground font-normal">No value</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
