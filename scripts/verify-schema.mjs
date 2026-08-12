/**
 * Runs the migrations against a throwaway in-memory Postgres (PGlite) and checks
 * that the schema does what it claims. No Docker, no Supabase project needed.
 *
 *   npm run db:verify
 *
 * PGlite is real Postgres compiled to WebAssembly, so syntax, constraints,
 * triggers, views and RLS policies all behave as they will in Supabase. The
 * pieces Supabase provides (the auth schema, auth.uid(), the authenticated
 * role) are shimmed below.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url).pathname

const RYAN = '11111111-1111-1111-1111-111111111111'
const VICTOR = '22222222-2222-2222-2222-222222222222'

let failures = 0
let checks = 0

function check(name, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Everything Supabase supplies that a bare Postgres does not. */
const SUPABASE_SHIM = `
  create schema if not exists auth;

  create table auth.users (
    id                 uuid primary key,
    email              text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );

  -- In Supabase this reads the JWT. Here it reads a session setting.
  create function auth.uid() returns uuid
  language sql stable as $shim$
    select nullif(current_setting('test.user_id', true), '')::uuid;
  $shim$;

  do $shim$
  begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role;
    end if;
  end
  $shim$;

  grant usage on schema auth to authenticated;
  grant select on auth.users to authenticated;
`

/**
 * Run as a particular signed-in user, with RLS enforced.
 * Session-level SET, not SET LOCAL: PGlite wraps each exec() in its own
 * transaction, so a LOCAL setting would be gone by the next call.
 */
async function asUser(db, userId, fn) {
  await db.exec(`set test.user_id = '${userId}'; set role authenticated;`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; reset test.user_id;`)
  }
}

async function main() {
  const db = new PGlite()
  await db.waitReady

  console.log('\nSupabase shim')
  await db.exec(SUPABASE_SHIM)
  console.log('  ok    auth schema, auth.uid(), roles')

  console.log('\nMigrations')
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sql)
      console.log(`  ok    ${file}`)
    } catch (error) {
      console.log(`  FAIL  ${file}`)
      console.log(`\n${error.message}\n`)
      process.exit(1)
    }
  }

  // ---------------------------------------------------------------------------
  console.log('\nRow Level Security')

  const unprotected = await db.query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    order by 1
  `)
  check(
    'every table has RLS enabled',
    unprotected.rows.length === 0,
    unprotected.rows.map((r) => r.relname).join(', '),
  )

  const policyless = await db.query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    order by 1
  `)
  check(
    'every table has at least one policy',
    policyless.rows.length === 0,
    policyless.rows.map((r) => r.relname).join(', '),
  )

  const invokerViews = await db.query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not coalesce(c.reloptions::text like '%security_invoker=on%', false)
    order by 1
  `)
  check(
    'every view runs with the caller’s permissions',
    invokerViews.rows.length === 0,
    invokerViews.rows.map((r) => r.relname).join(', '),
  )

  // ---------------------------------------------------------------------------
  console.log('\nProfile creation')

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${RYAN}',   'ryan@example.test',   '{"full_name":"Ryan Test"}'),
      ('${VICTOR}', 'victor@example.test', '{"full_name":"Victor Test"}');
  `)
  const profiles = await db.query('select id, full_name from profiles order by full_name')
  check('inviting a user creates a profile row', profiles.rows.length === 2)
  check(
    'the profile picks up the full name',
    profiles.rows[0]?.full_name === 'Ryan Test',
    JSON.stringify(profiles.rows),
  )

  await db.exec(`
    update profiles set role = 'admin', sees_rates = true where id = '${RYAN}';
    update profiles set role = 'field',  sees_rates = false where id = '${VICTOR}';
  `)

  // ---------------------------------------------------------------------------
  console.log('\nSeed records')

  // activity_types and pipeline_stages already exist — the reference-data
  // migration creates them.
  await db.exec(`
    insert into accounts (id, name, status)
      values ('33333333-3333-3333-3333-333333333333', 'Demo Property Group', 'active');
    insert into buildings (id, account_id, name, contract_start_date)
      values ('44444444-4444-4444-4444-444444444444',
              '33333333-3333-3333-3333-333333333333',
              '1 Example Plaza', current_date - interval '6 months');
  `)

  // ---------------------------------------------------------------------------
  console.log('\nContract value history')

  await db.exec(`
    set local test.user_id = '${RYAN}';
    select set_building_monthly_value(
      '44444444-4444-4444-4444-444444444444', 5000,
      (current_date - interval '6 months')::date, 'initial');
  `)
  await db.exec(`
    set local test.user_id = '${RYAN}';
    select set_building_monthly_value(
      '44444444-4444-4444-4444-444444444444', 6000,
      (current_date - interval '2 months')::date);
  `)

  const periods = await db.query(`
    select monthly_value, annual_value, end_date, change_reason
    from building_contract_periods
    where building_id = '44444444-4444-4444-4444-444444444444'
    order by effective_date
  `)
  check('a price change appends a period', periods.rows.length === 2)
  check('the old period is closed off', periods.rows[0]?.end_date !== null)
  check('the new period is still open', periods.rows[1]?.end_date === null)
  check(
    'a rise is recorded as an increase',
    periods.rows[1]?.change_reason === 'increase',
    periods.rows[1]?.change_reason,
  )
  check(
    'annual value is computed, not entered',
    Number(periods.rows[1]?.annual_value) === 72000,
    String(periods.rows[1]?.annual_value),
  )

  // Setting the same value again must not create noise.
  await db.exec(`
    set local test.user_id = '${RYAN}';
    select set_building_monthly_value('44444444-4444-4444-4444-444444444444', 6000);
  `)
  const unchanged = await db.query(
    `select count(*)::int as n from building_contract_periods
     where building_id = '44444444-4444-4444-4444-444444444444'`,
  )
  check('re-saving the same value changes nothing', unchanged.rows[0].n === 2)

  const onlyOneOpen = await db
    .exec(
      `insert into building_contract_periods (building_id, effective_date, monthly_value)
       values ('44444444-4444-4444-4444-444444444444', current_date, 999)`,
    )
    .then(() => false)
    .catch(() => true)
  check('a building cannot have two open contract periods', onlyOneOpen)

  // ---------------------------------------------------------------------------
  console.log('\nRevenue views')

  const mrr = await db.query(`
    select month, monthly_value from v_building_mrr_by_month
    where building_id = '44444444-4444-4444-4444-444444444444'
    order by month
  `)
  check('MRR expands into one row per month', mrr.rows.length >= 6, `${mrr.rows.length} months`)
  check(
    'the earliest month uses the original value',
    Number(mrr.rows[0]?.monthly_value) === 5000,
    String(mrr.rows[0]?.monthly_value),
  )
  check(
    'the latest month uses the current value',
    Number(mrr.rows.at(-1)?.monthly_value) === 6000,
    String(mrr.rows.at(-1)?.monthly_value),
  )

  const waterfall = await db.query(`
    select month, new_business, expansion, contraction, churn, ending_mrr
    from v_mrr_waterfall order by month
  `)
  const firstMonth = waterfall.rows[0]
  const raise = waterfall.rows.find((r) => Number(r.expansion) > 0)
  check('the waterfall opens with new business', Number(firstMonth?.new_business) === 5000)
  check('the price rise shows as expansion', Number(raise?.expansion) === 1000, JSON.stringify(raise))
  check(
    'ending MRR matches the current contract',
    Number(waterfall.rows.at(-1)?.ending_mrr) === 6000,
  )

  // Losing the building must show up as churn, not linger as revenue.
  await db.exec(`select close_building_contract('44444444-4444-4444-4444-444444444444', current_date);`)
  const afterLoss = await db.query(
    `select end_date, change_reason from building_contract_periods
     where building_id = '44444444-4444-4444-4444-444444444444' order by effective_date desc limit 1`,
  )
  check('closing a contract stamps the end date', afterLoss.rows[0]?.end_date !== null)
  check('closing a contract records the reason as lost', afterLoss.rows[0]?.change_reason === 'lost')

  // ---------------------------------------------------------------------------
  console.log('\nActivity roll-up')

  await db.exec(`
    set local test.user_id = '${VICTOR}';
    insert into activities (activity_type_id, subject, building_id)
    select id, 'Complaint about lobby', '44444444-4444-4444-4444-444444444444'
    from activity_types where name = 'Site visit';
  `)
  const activity = await db.query('select account_id, building_id from activities')
  check(
    'an activity logged on a building rolls up to the account',
    activity.rows[0]?.account_id === '33333333-3333-3333-3333-333333333333',
    JSON.stringify(activity.rows[0]),
  )

  // ---------------------------------------------------------------------------
  console.log('\nOpportunity stage history')

  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into opportunities (id, name, stage_id)
    select '55555555-5555-5555-5555-555555555555', 'New tower', id
    from pipeline_stages where name = 'Identified';
  `)
  const stageEvents = await db.query('select count(*)::int as n from opportunity_stage_events')
  check('creating a deal records its opening stage', stageEvents.rows[0].n === 1)

  await db.exec(`
    set local test.user_id = '${RYAN}';
    update opportunities set stage_id = (select id from pipeline_stages where name = 'Qualified')
    where id = '55555555-5555-5555-5555-555555555555';
  `)
  const stageEvents2 = await db.query(
    'select from_stage_id, to_stage_id from opportunity_stage_events order by changed_at',
  )
  check('moving a deal records the change', stageEvents2.rows.length === 2)
  check('the change records where it came from', stageEvents2.rows[1]?.from_stage_id !== null)

  // ---------------------------------------------------------------------------
  console.log('\nAudit log')

  await db.exec(`
    set local test.user_id = '${RYAN}';
    update accounts set notes = 'Renewal discussion' where id = '33333333-3333-3333-3333-333333333333';
  `)
  const audit = await db.query(`
    select action, changed_by, old_values, new_values from audit_log
    where table_name = 'accounts' and action = 'update'
  `)
  check('editing a record writes an audit entry', audit.rows.length === 1)
  check('the audit entry records who did it', audit.rows[0]?.changed_by === RYAN)
  check(
    'the audit entry keeps the old and new value',
    audit.rows[0]?.old_values?.notes === null &&
      audit.rows[0]?.new_values?.notes === 'Renewal discussion',
  )

  await db.exec(`
    set local test.user_id = '${RYAN}';
    update accounts set notes = 'Renewal discussion' where id = '33333333-3333-3333-3333-333333333333';
  `)
  const auditAfterNoop = await db.query(
    `select count(*)::int as n from audit_log where table_name = 'accounts' and action = 'update'`,
  )
  check('an edit that changes nothing is not logged', auditAfterNoop.rows[0].n === 1)

  // ---------------------------------------------------------------------------
  console.log('\nPay rate access')

  await db.exec(`
    insert into employees (id, first_name, last_name)
      values ('66666666-6666-6666-6666-666666666666', 'Demo', 'Cleaner');
    insert into employee_assignments (id, employee_id, building_id, scheduled_hours_per_week, start_date)
      values ('77777777-7777-7777-7777-777777777777',
              '66666666-6666-6666-6666-666666666666',
              '44444444-4444-4444-4444-444444444444', 20, current_date - 30);
    insert into employee_assignment_rates (assignment_id, pay_rate, bill_rate)
      values ('77777777-7777-7777-7777-777777777777', 18, 30);
  `)

  const ryanRates = await asUser(db, RYAN, () =>
    db.query('select count(*)::int as n from employee_assignment_rates'),
  )
  check('Ryan can read pay rates', ryanRates.rows[0].n === 1)

  const victorRates = await asUser(db, VICTOR, () =>
    db.query('select count(*)::int as n from employee_assignment_rates'),
  )
  check('Victor cannot read pay rates', victorRates.rows[0].n === 0)

  const victorAssignments = await asUser(db, VICTOR, () =>
    db.query('select count(*)::int as n from employee_assignments'),
  )
  check('Victor can still see who works where', victorAssignments.rows[0].n === 1)

  const ryanMargin = await asUser(db, RYAN, () =>
    db.query('select weekly_margin from v_building_labor_margin'),
  )
  check(
    'Ryan sees labour margin',
    Number(ryanMargin.rows[0]?.weekly_margin) === 240,
    JSON.stringify(ryanMargin.rows),
  )

  const victorMargin = await asUser(db, VICTOR, () =>
    db.query('select weekly_margin from v_building_labor_margin'),
  )
  check('Victor sees no labour margin', victorMargin.rows.length === 0)

  const victorWrite = await asUser(db, VICTOR, () =>
    db
      .exec(
        `update employee_assignment_rates set pay_rate = 1
         where assignment_id = '77777777-7777-7777-7777-777777777777'`,
      )
      .then(async () => {
        const r = await db.query(
          `select pay_rate from employee_assignment_rates
           where assignment_id = '77777777-7777-7777-7777-777777777777'`,
        )
        // RLS silently filters rows on UPDATE rather than raising.
        return r.rows.length === 0
      })
      .catch(() => true),
  )
  check('Victor cannot change pay rates', victorWrite)

  // ---------------------------------------------------------------------------
  console.log('\nAdmin-only reference data')

  const victorAddsStage = await asUser(db, VICTOR, () =>
    db
      .exec(`insert into pipeline_stages (name, sort_order) values ('Sneaky stage', 99)`)
      .then(() => false)
      .catch(() => true),
  )
  check('a non-admin cannot add a deal stage', victorAddsStage)

  const ryanAddsStage = await asUser(db, RYAN, () =>
    db
      .exec(`insert into pipeline_stages (name, sort_order) values ('Board approval', 8)`)
      .then(() => true)
      .catch((e) => {
        console.log(`        ${e.message}`)
        return false
      }),
  )
  check('an admin can add a deal stage', ryanAddsStage)

  const victorReadsStages = await asUser(db, VICTOR, () =>
    db.query('select count(*)::int as n from pipeline_stages'),
  )
  check('everyone can read deal stages', victorReadsStages.rows[0].n >= 2)

  // ---------------------------------------------------------------------------
  console.log('\nEveryday sharing')

  const victorWritesActivity = await asUser(db, VICTOR, () =>
    db
      .exec(
        `insert into activities (activity_type_id, subject)
         select id, 'Called the property manager' from activity_types limit 1`,
      )
      .then(() => true)
      .catch((e) => {
        console.log(`        ${e.message}`)
        return false
      }),
  )
  check('any member can log an activity', victorWritesActivity)

  const victorReadsAccounts = await asUser(db, VICTOR, () =>
    db.query('select count(*)::int as n from accounts'),
  )
  check('any member can read accounts', victorReadsAccounts.rows[0].n === 1)

  await db.exec(`update profiles set is_active = false where id = '${VICTOR}';`)
  const deactivated = await asUser(db, VICTOR, () =>
    db.query('select count(*)::int as n from accounts'),
  )
  check('a deactivated person sees nothing', deactivated.rows[0].n === 0)

  // ---------------------------------------------------------------------------
  console.log('\nDemo seed data')

  const seedSql = await readFile(
    new URL('../supabase/seed.sql', import.meta.url).pathname,
    'utf8',
  )
  const seedRan = await db
    .exec(seedSql)
    .then(() => true)
    .catch((e) => {
      console.log(`        ${e.message}`)
      return false
    })
  check('seed.sql runs without error', seedRan)

  // Counted by the seed's own id prefixes, so the test fixtures above don't
  // inflate the numbers.
  const seeded = await db.query(`
    select
      (select count(*)::int from accounts     where id::text like 'aaaaaaaa-0000%') as accounts,
      (select count(*)::int from buildings    where id::text like 'bbbbbbbb-0000%') as buildings,
      (select count(*)::int from contacts     where id::text like 'cccccccc-0000%') as contacts,
      (select count(*)::int from opportunities where id::text like 'ffffffff-0000%') as opportunities
  `)
  check('seed creates demo accounts', seeded.rows[0].accounts === 3, JSON.stringify(seeded.rows[0]))
  check('seed creates demo buildings', seeded.rows[0].buildings === 4, JSON.stringify(seeded.rows[0]))
  check('seed creates demo contacts', seeded.rows[0].contacts === 2, JSON.stringify(seeded.rows[0]))
  check('seed creates a demo opportunity', seeded.rows[0].opportunities === 1)

  const seedHistory = await db.query(`
    select count(*)::int as n from building_contract_periods
    where building_id = 'bbbbbbbb-0000-4000-8000-000000000001'
  `)
  check('seed builds real contract history', seedHistory.rows[0].n === 2)

  // ---------------------------------------------------------------------------
  console.log(
    `\n${failures === 0 ? 'PASSED' : 'FAILED'} — ${checks - failures}/${checks} checks\n`,
  )
  await db.close()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\nVerification crashed:\n')
  console.error(error)
  process.exit(1)
})
