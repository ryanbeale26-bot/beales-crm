// Post-deploy check against the real Supabase project.
// Never prints key material.
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let bad = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok    ${name}`)
  else { bad++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

console.log('\nSecurity: a stranger with the public key')
for (const table of ['accounts', 'buildings', 'contacts', 'activities', 'employees']) {
  const { data, error } = await anon.from(table).select('*').limit(1)
  check(`${table} is not readable when signed out`, (data?.length ?? 0) === 0, error ? '' : 'returned rows!')
}
{
  const { error } = await anon.from('accounts').insert({ name: 'should not work' })
  check('a stranger cannot insert an account', Boolean(error))
}

console.log('\nReference data')
const expected = { activity_types: 8, project_types: 10, property_types: 11, pipeline_stages: 8, loss_reasons: 8, lead_sources: 6 }
for (const [table, n] of Object.entries(expected)) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true })
  check(`${table} has ${n} rows`, count === n, error ? error.message : `got ${count}`)
}

console.log('\nEvery table exists and is readable')
for (const table of ['accounts', 'buildings', 'building_contract_periods', 'contacts',
                     'contact_buildings', 'employees', 'employee_assignments',
                     'employee_assignment_rates', 'opportunities', 'activities',
                     'projects', 'attachments', 'staffing_reports', 'inspections',
                     'work_orders', 'audit_log', 'import_batches']) {
  // Row counts are reported, not asserted — there is real data in here now.
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true })
  check(`${table} (${count} rows)`, !error, error?.message)
}

console.log('\nThe team')
{
  const { data, error } = await admin.from('profiles').select('full_name, email, role, sees_rates').order('full_name')
  check('profiles exist', !error && data.length > 0, error?.message)
  for (const p of data ?? []) {
    console.log(`        ${(p.full_name || '(no name)').padEnd(18)} ${p.email.padEnd(26)} ${p.role.padEnd(11)} ${p.sees_rates ? 'sees rates' : '—'}`)
  }
}

console.log('\nRevenue views')
for (const view of ['v_building_current_value', 'v_building_mrr_by_month', 'v_account_mrr_by_month',
                    'v_mrr_waterfall', 'v_weighted_pipeline', 'v_staff_movement', 'v_building_labor_margin']) {
  const { error } = await admin.from(view).select('*').limit(1)
  check(`${view}`, !error, error?.message)
}

console.log(`\n${bad === 0 ? 'PASSED' : `FAILED — ${bad} problem(s)`}\n`)
process.exit(bad === 0 ? 0 : 1)
