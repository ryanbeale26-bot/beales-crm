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

  // Churn and contraction were never asserted before this phase, so the two
  // columns the revenue report is built on had no test behind them at all.
  //
  // Note the contract above was closed *today*: the MRR series stops at this
  // month and the building is still billing it, so that close cannot show as
  // churn until next month. Churn needs a contract that ended in the past.
  const CHURNED = '55555555-5555-5555-5555-555555555555'
  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into buildings (id, account_id, name, health_score)
      values ('${CHURNED}', '33333333-3333-3333-3333-333333333333', '2 Gone Street', 'at_risk');
    select set_building_monthly_value('${CHURNED}', 4000, (current_date - interval '8 months')::date, 'initial');
    select close_building_contract('${CHURNED}', (current_date - interval '3 months')::date);
  `)
  const churned = await db.query(
    `select month, churn, ending_mrr from v_mrr_waterfall where churn > 0 order by month`,
  )
  check(
    'a contract that ended shows as churn',
    Number(churned.rows[0]?.churn) === 4000,
    JSON.stringify(churned.rows[0]),
  )
  const stillBilling = await db.query(
    `select count(*)::int as n from v_building_mrr_by_month
     where building_id = '${CHURNED}' and month > (current_date - interval '3 months')::date`,
  )
  check('a churned building stops billing', stillBilling.rows[0].n === 0)

  const SHRANK = '66666666-6666-6666-6666-666666666666'
  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into buildings (id, account_id, name, health_score)
      values ('${SHRANK}', '33333333-3333-3333-3333-333333333333', '3 Smaller Court', 'needs_attention');
    select set_building_monthly_value('${SHRANK}', 3000, (current_date - interval '6 months')::date, 'initial');
    select set_building_monthly_value('${SHRANK}', 2000, (current_date - interval '2 months')::date);
  `)
  const shrank = await db.query(
    `select month, contraction from v_mrr_waterfall where contraction > 0 order by month`,
  )
  check('a price cut shows as contraction', Number(shrank.rows[0]?.contraction) === 1000)

  // A correction is not a price change. Putting a corrected figure through
  // set_building_monthly_value() would record a movement that never happened,
  // so it has its own function that amends in place and writes no history.
  const movementMonths = () =>
    db
      .query(
        `select month from v_mrr_waterfall
         where expansion > 0 or contraction > 0 or churn > 0 order by month`,
      )
      .then((r) => r.rows.map((x) => String(x.month)).join(','))
  const movementsBefore = await movementMonths()
  await db.exec(`
    set local test.user_id = '${RYAN}';
    select correct_open_contract_value('${SHRANK}', 2500, 'Typo — was never 2000.');
  `)
  const corrected = await db.query(
    `select count(*)::int as n,
            max(monthly_value) filter (where end_date is null) as open_value,
            max(annual_value)  filter (where end_date is null) as open_annual
     from building_contract_periods where building_id = '${SHRANK}'`,
  )
  check('a correction writes no new history', corrected.rows[0].n === 2, `${corrected.rows[0].n} periods`)
  check('a correction changes the open value', Number(corrected.rows[0].open_value) === 2500)
  check('a correction recomputes the annual value', Number(corrected.rows[0].open_annual) === 30000)
  // The amounts do move — correcting 2000 to 2500 means the earlier drop from
  // 3000 was always 500, not 1000. That is the point. What must not happen is a
  // *new* month appearing in the waterfall, which is what an appended period
  // would have caused.
  check(
    'a correction invents no new movement month',
    (await movementMonths()) === movementsBefore,
    `${movementsBefore} → ${await movementMonths()}`,
  )
  const correctedContraction = await db.query(
    `select contraction from v_mrr_waterfall where contraction > 0 order by month`,
  )
  check(
    'a correction restates the movement it belongs to',
    Number(correctedContraction.rows[0]?.contraction) === 500,
    JSON.stringify(correctedContraction.rows[0]),
  )
  const missingPeriod = await db
    .exec(`select correct_open_contract_value('${CHURNED}', 100);`)
    .then(() => false)
    .catch(() => true)
  check('correcting a building with no open contract fails loudly', missingPeriod)

  // ---------------------------------------------------------------------------
  console.log('\nReporting views')

  const byMonth = await db.query(`select month, mrr, building_count, account_count
                                  from v_mrr_by_month order by month desc limit 1`)
  const monthTotal = await db.query(`select coalesce(sum(monthly_value), 0) as total
                                     from v_building_mrr_by_month
                                     where month = date_trunc('month', now())::date`)
  check(
    'the company MRR row matches the buildings behind it',
    Number(byMonth.rows[0]?.mrr) === Number(monthTotal.rows[0]?.total),
    `${byMonth.rows[0]?.mrr} vs ${monthTotal.rows[0]?.total}`,
  )

  // The point of the coverage view: it must count the buildings that are
  // missing from the MRR views, which is why it reads buildings directly.
  await db.exec(`
    insert into buildings (id, account_id, name)
      values ('77777777-7777-7777-7777-777777777777',
              '33333333-3333-3333-3333-333333333333', '4 Unpriced Way');
  `)
  const coverage = await db.query(`select * from v_mrr_coverage`)
  const cov = coverage.rows[0]
  check(
    'coverage counts buildings that have no contract at all',
    Number(cov.buildings_total) > Number(cov.buildings_with_value),
    JSON.stringify(cov),
  )
  check('coverage excludes nothing that is billing', Number(cov.buildings_with_value) >= 1)

  const health = await db.query(`select * from v_building_health_mrr order by health_score`)
  check('health groups the portfolio', health.rows.length >= 2, JSON.stringify(health.rows))
  check(
    'health keeps a row for buildings nobody has scored',
    health.rows.some((r) => r.health_score === null),
    JSON.stringify(health.rows.map((r) => r.health_score)),
  )

  const expansion = await db.query(
    `select account_id, mrr_now, mrr_12m, change_12m, building_count
     from v_account_mrr_change where account_id = '33333333-3333-3333-3333-333333333333'`,
  )
  check('account change reports one row per account', expansion.rows.length === 1)
  check(
    'account change is now minus then',
    Number(expansion.rows[0]?.change_12m) ===
      Number(expansion.rows[0]?.mrr_now) - Number(expansion.rows[0]?.mrr_12m),
    JSON.stringify(expansion.rows[0]),
  )

  // The check that would have caught the grant gap: every view created by a
  // later migration was invisible to `authenticated` until this phase.
  const ungranted = await db.query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and not has_table_privilege('authenticated', c.oid, 'select')
  `)
  check(
    'every view is readable by a signed-in user',
    ungranted.rows.length === 0,
    ungranted.rows.map((r) => r.relname).join(', '),
  )

  // ---------------------------------------------------------------------------
  console.log('\nContracted hours')

  await db.exec(`
    update buildings set
      day_porter = true,
      day_porter_hours_per_day = 4,
      day_porter_days_per_week = 5,
      night_hours_per_night = 6,
      night_days_per_week = 5,
      weekend_service = true,
      weekend_hours_per_week = 8
    where id = '44444444-4444-4444-4444-444444444444';
  `)

  const hours = await db.query(`
    select weekly_hours, monthly_hours, annual_hours from v_building_hours
    where building_id = '44444444-4444-4444-4444-444444444444'
  `)
  // 4×5 day porter + 6×5 nights + 8 weekend = 58 hours a week.
  check('weekly hours add up', Number(hours.rows[0]?.weekly_hours) === 58, JSON.stringify(hours.rows[0]))
  check('annual hours are 52 weeks', Number(hours.rows[0]?.annual_hours) === 3016)
  check(
    'monthly hours are the annual figure over 12, not weekly × 4',
    Math.abs(Number(hours.rows[0]?.monthly_hours) - 3016 / 12) < 0.01,
    String(hours.rows[0]?.monthly_hours),
  )

  // Turning the day porter off must remove those hours without losing the number.
  await db.exec(`
    update buildings set day_porter = false
    where id = '44444444-4444-4444-4444-444444444444';
  `)
  const noPorter = await db.query(`
    select weekly_hours from v_building_hours
    where building_id = '44444444-4444-4444-4444-444444444444'
  `)
  check('turning the day porter off drops their hours', Number(noPorter.rows[0]?.weekly_hours) === 38)

  const stillThere = await db.query(`
    select day_porter_hours_per_day from buildings
    where id = '44444444-4444-4444-4444-444444444444'
  `)
  check(
    'the day porter hours are remembered, not wiped',
    Number(stillThere.rows[0]?.day_porter_hours_per_day) === 4,
  )

  await db.exec(`
    update buildings set day_porter = true
    where id = '44444444-4444-4444-4444-444444444444';
  `)

  // A four-night building must not be billed as five.
  await db.exec(`
    update buildings set night_days_per_week = 4
    where id = '44444444-4444-4444-4444-444444444444';
  `)
  const fourNights = await db.query(`
    select weekly_hours from v_building_hours
    where building_id = '44444444-4444-4444-4444-444444444444'
  `)
  check('a four-night week is not counted as five', Number(fourNights.rows[0]?.weekly_hours) === 52)

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
    from pipeline_stages where name = 'Targeting';
  `)
  const stageEvents = await db.query('select count(*)::int as n from opportunity_stage_events')
  check('creating a deal records its opening stage', stageEvents.rows[0].n === 1)

  await db.exec(`
    set local test.user_id = '${RYAN}';
    update opportunities set stage_id = (select id from pipeline_stages where name = 'Hot Lead')
    where id = '55555555-5555-5555-5555-555555555555';
  `)
  const stageEvents2 = await db.query(
    'select from_stage_id, to_stage_id from opportunity_stage_events order by changed_at',
  )
  check('moving a deal records the change', stageEvents2.rows.length === 2)
  check('the change records where it came from', stageEvents2.rows[1]?.from_stage_id !== null)

  // ---------------------------------------------------------------------------
  console.log('\nClosing and reopening a deal')

  const OPP = '55555555-5555-5555-5555-555555555555'
  const WON = `(select id from pipeline_stages where name = 'Closed Won')`

  await db.exec(`
    set local test.user_id = '${RYAN}';
    update opportunities set stage_id = ${WON} where id = '${OPP}';
  `)
  const closed = await db.query(`select actual_close_date from opportunities where id = '${OPP}'`)
  check('winning a deal stamps the close date', closed.rows[0]?.actual_close_date != null)

  await db.exec(`
    set local test.user_id = '${RYAN}';
    update opportunities set stage_id = (select id from pipeline_stages where name = 'RFP Sent')
    where id = '${OPP}';
  `)
  const reopened = await db.query(`select actual_close_date from opportunities where id = '${OPP}'`)
  check('reopening a deal clears the close date', reopened.rows[0]?.actual_close_date == null)

  // The thirteen rows from the Won/Loss tab arrive already closed, with a real
  // date on them. The trigger must not overwrite it with today.
  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into opportunities (id, name, stage_id, opened_on, actual_close_date, monthly_value)
    select '55555555-5555-5555-5555-555555555556', 'Imported win', id,
           current_date - 200, current_date - 90, 4000
    from pipeline_stages where name = 'Closed Won';
  `)
  const imported = await db.query(`
    select (actual_close_date = current_date - 90) as kept
    from opportunities where id = '55555555-5555-5555-5555-555555555556'
  `)
  check('importing a closed deal keeps its own close date', imported.rows[0]?.kept === true)

  // ---------------------------------------------------------------------------
  console.log('\nA won deal becomes a building')

  await db.exec(`
    set local test.user_id = '${RYAN}';
    update opportunities set stage_id = ${WON}, monthly_value = 7000 where id = '${OPP}';
  `)
  const converted = await db.query(`
    select convert_opportunity_to_building(
      '${OPP}', null, 'Converted Demo Holdings', 'Converted Tower', 7000, current_date
    ) as building_id
  `)
  check('converting a won deal returns a building', Boolean(converted.rows[0]?.building_id))

  const linked = await db.query(`
    select a.status as account_status, b.status as building_status, p.monthly_value
    from opportunities o
    join buildings b on b.id = o.building_id
    join accounts  a on a.id = o.account_id
    join building_contract_periods p on p.building_id = b.id and p.end_date is null
    where o.id = '${OPP}'
  `)
  check('the deal is linked to its new building and account', linked.rows.length === 1)
  check('a converted deal opens the account as a customer', linked.rows[0]?.account_status === 'active')
  check('the new building opens with a contract period', Number(linked.rows[0]?.monthly_value) === 7000)

  const noBatchStamp = await db.query(`
    select b.import_batch_id from opportunities o
    join buildings b on b.id = o.building_id where o.id = '${OPP}'
  `)
  check('the new building carries no import batch', noBatchStamp.rows[0]?.import_batch_id == null)

  const convertedTwice = await db
    .exec(`select convert_opportunity_to_building('${OPP}', null, 'Second try')`)
    .then(() => false)
    .catch(() => true)
  check('a deal cannot be converted twice', convertedTwice)

  const reopenConverted = await db
    .exec(
      `update opportunities set stage_id = (select id from pipeline_stages where name = 'RFP Sent')
       where id = '${OPP}'`,
    )
    .then(() => false)
    .catch(() => true)
  check('a converted deal cannot be quietly reopened', reopenConverted)

  const openDealConverted = await db
    .exec(
      `insert into opportunities (id, name, stage_id)
       select '55555555-5555-5555-5555-555555555557', 'Still open', id
       from pipeline_stages where name = 'Targeting';
       select convert_opportunity_to_building('55555555-5555-5555-5555-555555555557', null, 'Nope');`,
    )
    .then(() => false)
    .catch(() => true)
  check('an open deal cannot be converted', openDealConverted)

  // ---------------------------------------------------------------------------
  console.log('\nPipeline reporting')

  const funnel = await db.query('select stage_name, deal_count, is_open from v_pipeline_funnel')
  check(
    'the funnel shows every stage, including the empty ones',
    funnel.rows.length >= 8,
    `${funnel.rows.length} stages`,
  )
  check(
    'the funnel separates open stages from closed',
    funnel.rows.some((r) => r.is_open) && funnel.rows.some((r) => !r.is_open),
  )

  const outcomes = await db.query('select won, days_to_close from v_opportunity_outcomes')
  check('closed deals appear in the outcomes view', outcomes.rows.length >= 2)
  check(
    'the sales cycle is measured from opened_on, not from the import',
    outcomes.rows.some((r) => Number(r.days_to_close) > 100),
    JSON.stringify(outcomes.rows),
  )

  const durations = await db.query(
    `select is_current, days_in_stage from v_opportunity_stage_durations
     where opportunity_id = '${OPP}' order by entered_at`,
  )
  check('stage history reports a duration per stage', durations.rows.length >= 3)
  check(
    'only the latest stage is the current one',
    durations.rows.filter((r) => r.is_current).length === 1,
  )

  // Win rate used to be a line of TypeScript in the report. Now it is a view,
  // and the dashboard reads the same one — so this asserts the view agrees with
  // counting the outcomes by hand, which is what the old code did.
  const rate = await db.query('select * from v_opportunity_win_rate')
  const byHand = await db.query(
    `select count(*) filter (where won)::int as won,
            count(*)::int as closed,
            count(*) filter (where actual_close_date is null)::int as undated
     from v_opportunity_outcomes`,
  )
  check(
    'the win rate view agrees with the outcomes behind it',
    Number(rate.rows[0]?.won) === byHand.rows[0].won &&
      Number(rate.rows[0]?.closed) === byHand.rows[0].closed,
    JSON.stringify(rate.rows[0]),
  )
  check(
    'the win rate is a percentage of closed deals',
    Number(rate.rows[0]?.win_rate) ===
      Math.round((byHand.rows[0].won / byHand.rows[0].closed) * 1000) / 10,
    `${rate.rows[0]?.win_rate}%`,
  )
  check(
    'the win rate counts the deals with no close date behind it',
    Number(rate.rows[0]?.closed_without_date) === byHand.rows[0].undated,
  )

  // Two open deals, one priced and one not — the real pipeline's defining
  // shape, and the reason the coverage view exists.
  await db.exec(`
    insert into opportunities (name, stage_id, monthly_value)
    select 'Priced and open', id, 1000 from pipeline_stages where name = 'RFP Sent';
    insert into opportunities (name, stage_id)
    select 'Open with no price', id from pipeline_stages where name = 'Targeting';
  `)
  const pipeCoverage = await db.query('select * from v_pipeline_coverage')
  const pc = pipeCoverage.rows[0]
  check(
    'pipeline coverage counts only open deals',
    Number(pc.open_deals) > 0 && Number(pc.open_deals) >= Number(pc.open_deals_priced),
    JSON.stringify(pc),
  )
  check(
    'pipeline coverage separates priced deals from unpriced',
    Number(pc.open_deals) > Number(pc.open_deals_priced),
    `${pc.open_deals_priced} of ${pc.open_deals} priced`,
  )

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

  const victorAddsWinReason = await asUser(db, VICTOR, () =>
    db
      .exec(`insert into win_reasons (name) values ('Sneaky reason')`)
      .then(() => false)
      .catch(() => true),
  )
  check('a non-admin cannot add a win reason', victorAddsWinReason)

  // Competitors are deliberately NOT admin-only: someone losing a deal has to be
  // able to name who beat them there and then, not wait for an admin.
  const victorAddsCompetitor = await asUser(db, VICTOR, () =>
    db
      .exec(`insert into competitors (name) values ('Rival Cleaning Co')`)
      .then(() => true)
      .catch((e) => {
        console.log(`        ${e.message}`)
        return false
      }),
  )
  check('anyone can name a competitor who beat them', victorAddsCompetitor)

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

  // Compared against what an admin sees rather than a fixed number: everyone is
  // meant to see all the data, and a hardcoded count only breaks whenever a test
  // above it creates another account.
  const allAccounts = await db.query('select count(*)::int as n from accounts')
  const victorReadsAccounts = await asUser(db, VICTOR, () =>
    db.query('select count(*)::int as n from accounts'),
  )
  check(
    'any member sees every account',
    victorReadsAccounts.rows[0].n === allAccounts.rows[0].n && allAccounts.rows[0].n > 0,
    `saw ${victorReadsAccounts.rows[0].n} of ${allAccounts.rows[0].n}`,
  )

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
  check('seed creates demo opportunities', seeded.rows[0].opportunities === 3)

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
