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
  console.log('\nGap fill')

  // The section above deactivated Victor to prove a deactivated person sees
  // nothing. Put him back, because the admin-only checks below need a real
  // non-admin member.
  await db.exec(`update profiles set is_active = true where id = '${VICTOR}';`)

  const G = (n) => `dddddddd-0000-4000-8000-00000000f00${n}`
  const [GAP_ACCOUNT, GAP_BUILDING, GAP_CONTACT, GAP_DEAL, GAP_BATCH] = [1, 2, 3, 4, 5].map(G)

  const openStage = await db.query(
    `select id from pipeline_stages where not is_won and not is_lost order by sort_order limit 1`,
  )
  const segment = await db.query(`select id from property_types order by sort_order limit 1`)

  await db.exec(`
    insert into accounts (id, name) values ('${GAP_ACCOUNT}', 'Gap Fill Test Co');
    insert into buildings (id, account_id, name) values ('${GAP_BUILDING}', '${GAP_ACCOUNT}', 'Gap Fill Site');
    insert into contacts (id, first_name, last_name) values ('${GAP_CONTACT}', 'Gap', 'Tester');
    insert into opportunities (id, name, stage_id)
      values ('${GAP_DEAL}', 'Gap Fill Deal', '${openStage.rows[0].id}');
    insert into import_batches (id, source_tab, file_name, status)
      values ('${GAP_BATCH}', 'Gap fill · buildings · test.csv', 'test.csv', 'draft');
  `)

  // --- Every type the allowlist covers, filled from NULL and put back --------
  // This is the check that catches the ::text::uuid cast family (to_jsonb of a
  // uuid, date, text or enum is a *quoted* string) and the SQL-NULL-versus-
  // jsonb-null bug, which would make undo a silent no-op for the one case the
  // gap-filler exists to serve.
  const FILL = {
    property_type_id: segment.rows[0].id, // uuid
    square_footage: 12000, // integer
    contract_start_date: '2025-04-01', // date
    health_score: 'needs_attention', // enum
    day_porter: true, // boolean
    night_hours_per_night: 4.5, // numeric(5,2)
  }

  const applied = await asUser(db, RYAN, () =>
    db.query(`select public.apply_gap_fill('buildings', $1, $2::jsonb, $3) as n`, [
      GAP_BUILDING,
      JSON.stringify(FILL),
      GAP_BATCH,
    ]),
  )
  check('a gap fill writes every field it was given', applied.rows[0]?.n === 6, JSON.stringify(applied.rows[0]))

  const afterFill = await db.query(
    `select property_type_id, square_footage, contract_start_date, health_score,
            day_porter, night_hours_per_night from buildings where id = '${GAP_BUILDING}'`,
  )
  check('every type survives the round trip',
    afterFill.rows[0]?.square_footage === 12000 &&
    afterFill.rows[0]?.health_score === 'needs_attention' &&
    afterFill.rows[0]?.day_porter === true &&
    Number(afterFill.rows[0]?.night_hours_per_night) === 4.5 &&
    String(afterFill.rows[0]?.property_type_id) === String(segment.rows[0].id),
    JSON.stringify(afterFill.rows[0]))

  const journal = await db.query(
    `select count(*)::int as n from import_field_changes where batch_id = '${GAP_BATCH}'`,
  )
  check('every change is journalled', journal.rows[0].n === 6, `${journal.rows[0].n} rows`)

  // Five of the six columns were NULL beforehand; day_porter is
  // `boolean not null default false`, so its old value is legitimately false.
  // Both must be stored as real jsonb — a SQL NULL here would be
  // indistinguishable from "nothing was recorded" and undo would skip it.
  const emptyBefore = await db.query(
    `select
       count(*) filter (where old_value = 'null'::jsonb)  as was_empty,
       count(*) filter (where old_value = 'false'::jsonb) as was_false,
       count(*) filter (where old_value is null)          as unrecorded
     from import_field_changes where batch_id = '${GAP_BATCH}'`,
  )
  check(
    'an empty old value is recorded as jsonb null, not SQL NULL',
    Number(emptyBefore.rows[0].was_empty) === 5 &&
      Number(emptyBefore.rows[0].was_false) === 1 &&
      Number(emptyBefore.rows[0].unrecorded) === 0,
    JSON.stringify(emptyBefore.rows[0]),
  )

  // --- Re-sending the same values is not a change ---------------------------
  // The CSV exports current values, so a re-upload sends them straight back.
  // If that registered as a change, every re-upload would journal the whole
  // portfolio and money fields would compare unequal forever on numeric scale.
  const resent = await asUser(db, RYAN, () =>
    db.query(`select public.apply_gap_fill('buildings', $1, $2::jsonb, $3) as n`, [
      GAP_BUILDING,
      JSON.stringify(FILL),
      GAP_BATCH,
    ]),
  )
  check('re-sending the same values changes nothing', resent.rows[0]?.n === 0, JSON.stringify(resent.rows[0]))

  const scale = await asUser(db, RYAN, () =>
    db.query(`select public.apply_gap_fill('opportunities', $1, $2::jsonb, $3) as n`, [
      GAP_DEAL,
      JSON.stringify({ monthly_value: 2500 }),
      GAP_BATCH,
    ]),
  )
  const scaleAgain = await asUser(db, RYAN, () =>
    db.query(`select public.apply_gap_fill('opportunities', $1, $2::jsonb, $3) as n`, [
      GAP_DEAL,
      JSON.stringify({ monthly_value: 2500 }),
      GAP_BATCH,
    ]),
  )
  check(
    'numeric scale does not invent a change (2500 vs 2500.00)',
    scale.rows[0]?.n === 1 && scaleAgain.rows[0]?.n === 0,
    `${scale.rows[0]?.n} then ${scaleAgain.rows[0]?.n}`,
  )

  // --- A blank cell leaves the field alone ----------------------------------
  const blanked = await asUser(db, RYAN, () =>
    db.query(`select public.apply_gap_fill('buildings', $1, $2::jsonb, $3) as n`, [
      GAP_BUILDING,
      JSON.stringify({ square_footage: null, health_score: null }),
      GAP_BATCH,
    ]),
  )
  const notCleared = await db.query(
    `select square_footage, health_score from buildings where id = '${GAP_BUILDING}'`,
  )
  check(
    'a blank cell never clears a field',
    blanked.rows[0]?.n === 0 && notCleared.rows[0]?.square_footage === 12000,
    JSON.stringify(notCleared.rows[0]),
  )

  // --- One audit row per record, not one per field --------------------------
  const auditRows = await db.query(
    `select count(*)::int as n from audit_log
     where table_name = 'buildings' and record_id = '${GAP_BUILDING}' and action = 'update'`,
  )
  check(
    'filling six fields writes one audit row, not six',
    auditRows.rows[0].n === 1,
    `${auditRows.rows[0].n} rows`,
  )

  // --- The allowlist cannot be escaped --------------------------------------
  for (const [table, column] of [
    ['opportunities', 'stage_id'],
    ['opportunities', 'annual_value'],
    ['profiles', 'role'],
    ['buildings', 'deleted_at'],
  ]) {
    const refused = await asUser(db, RYAN, () =>
      db
        .query(`select public.apply_gap_fill($1, $2, $3::jsonb, $4) as n`, [
          table,
          table === 'profiles' ? RYAN : GAP_DEAL,
          JSON.stringify({ [column]: table === 'profiles' ? 'admin' : '2026-01-01' }),
          GAP_BATCH,
        ])
        .then(() => false)
        .catch(() => true),
    )
    check(`a gap fill refuses ${table}.${column}`, refused)
  }

  const stageEventsAfter = await db.query(
    `select count(*)::int as n from opportunity_stage_events where opportunity_id = '${GAP_DEAL}'`,
  )
  const closeDate = await db.query(
    `select actual_close_date from opportunities where id = '${GAP_DEAL}'`,
  )
  check(
    'filling a deal never touches the stage machinery',
    stageEventsAfter.rows[0].n === 1 && closeDate.rows[0].actual_close_date === null,
    `${stageEventsAfter.rows[0].n} stage events`,
  )

  // --- Contract values ------------------------------------------------------
  const coverageBefore = await db.query(`select buildings_with_value from v_mrr_coverage`)

  await asUser(db, RYAN, () =>
    db.query(`select public.fill_building_contract_value($1, 3200, $2::date, $3)`, [
      GAP_BUILDING,
      '2025-04-01',
      GAP_BATCH,
    ]),
  )
  const period = await db.query(
    `select monthly_value, effective_date, change_reason, import_batch_id
     from building_contract_periods where building_id = '${GAP_BUILDING}'`,
  )
  check(
    'a filled contract value opens one period, stamped and dated',
    period.rows.length === 1 &&
      Number(period.rows[0].monthly_value) === 3200 &&
      period.rows[0].change_reason === 'initial' &&
      String(period.rows[0].import_batch_id) === GAP_BATCH,
    JSON.stringify(period.rows),
  )

  const coverageAfter = await db.query(`select buildings_with_value from v_mrr_coverage`)
  check(
    'coverage counts the newly priced building',
    Number(coverageAfter.rows[0].buildings_with_value) ===
      Number(coverageBefore.rows[0].buildings_with_value) + 1,
  )

  // The trap this closes: set_building_monthly_value() returns the *existing*
  // period id when the value has not moved, so a naive re-upload would stamp a
  // real pre-existing period and undo would delete it — $0 MRR forever.
  const secondFill = await asUser(db, RYAN, () =>
    db
      .query(`select public.fill_building_contract_value($1, 3200, $2::date, $3)`, [
        GAP_BUILDING,
        '2025-04-01',
        GAP_BATCH,
      ])
      .then(() => false)
      .catch(() => true),
  )
  check('filling a value that already exists is refused, not silently re-stamped', secondFill)

  // --- Undo -----------------------------------------------------------------
  // Someone edits one of the filled fields by hand before the undo. That edit
  // must survive: the batch filled a blank, so a later hand edit is the more
  // considered value.
  await asUser(db, RYAN, () =>
    db.query(`update buildings set square_footage = 99999 where id = '${GAP_BUILDING}'`),
  )

  const undo = await asUser(db, RYAN, () =>
    db.query(`select public.rollback_field_changes($1) as result`, [GAP_BATCH]),
  )
  const result = undo.rows[0].result

  const afterUndo = await db.query(
    `select property_type_id, square_footage, contract_start_date, health_score,
            day_porter, night_hours_per_night from buildings where id = '${GAP_BUILDING}'`,
  )
  check(
    'undo puts every untouched field back to empty',
    afterUndo.rows[0].property_type_id === null &&
      afterUndo.rows[0].contract_start_date === null &&
      afterUndo.rows[0].health_score === null &&
      afterUndo.rows[0].day_porter === false &&
      afterUndo.rows[0].night_hours_per_night === null,
    JSON.stringify(afterUndo.rows[0]),
  )
  check(
    'undo leaves a field somebody edited by hand alone',
    afterUndo.rows[0].square_footage === 99999,
    `square_footage is ${afterUndo.rows[0].square_footage}`,
  )
  check('undo reports what it skipped', Number(result.skipped) === 1, JSON.stringify(result))

  const dealAfterUndo = await db.query(
    `select monthly_value from opportunities where id = '${GAP_DEAL}'`,
  )
  check('undo reaches every scope in the batch', dealAfterUndo.rows[0].monthly_value === null)

  const buildingSurvives = await db.query(
    `select count(*)::int as n from buildings where id = '${GAP_BUILDING}'`,
  )
  check('undo never deletes the record itself', buildingSurvives.rows[0].n === 1)

  // --- Who may do any of this ----------------------------------------------
  const victorFill = await asUser(db, VICTOR, () =>
    db
      .query(`select public.apply_gap_fill('buildings', $1, $2::jsonb, $3) as n`, [
        GAP_BUILDING,
        JSON.stringify({ square_footage: 1 }),
        GAP_BATCH,
      ])
      .then(() => false)
      .catch(() => true),
  )
  check('a non-admin cannot run a gap fill', victorFill)

  const victorReads = await asUser(db, VICTOR, () =>
    db.query(`select count(*)::int as n from import_field_changes`),
  )
  check('a member can still read the journal', victorReads.rows[0].n > 0)

  // --- The census -----------------------------------------------------------
  const census = await asUser(db, RYAN, () => db.query(`select * from v_gap_census`))
  check('the gap census is readable by a signed-in member', census.rows.length >= 18, `${census.rows.length} rows`)

  const censusValue = census.rows.find((r) => r.scope === 'buildings' && r.field === 'monthly_value')
  const censusCoverage = await db.query(
    `select buildings_total, buildings_with_value from v_mrr_coverage`,
  )
  check(
    'the census agrees with v_mrr_coverage rather than counting again',
    Number(censusValue.missing) ===
      Number(censusCoverage.rows[0].buildings_total) -
        Number(censusCoverage.rows[0].buildings_with_value),
    JSON.stringify(censusValue),
  )

  // ---------------------------------------------------------------------------
  console.log('\nNightly ingest')

  const I = (n) => `eeeeeeee-0000-4000-8000-00000000e0${String(n).padStart(2, '0')}`
  const [
    ING_ACCOUNT,
    ING_ACCOUNT_2,
    ING_BUILDING,
    ING_ACTIVITY,
    ING_ACTIVITY_2,
    ING_DEAL,
    ING_BATCH,
    ING_CONTACT_A,
    ING_CONTACT_B,
  ] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(I)

  const INGEST = '33333333-0000-4000-8000-000000000009'
  const emailType = await db.query(`select id from activity_types where name = 'Email'`)
  const ingestStage = await db.query(
    `select id from pipeline_stages where not is_won and not is_lost order by sort_order limit 1`,
  )

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data)
      values ('${INGEST}', 'ingest@example.test', '{"full_name":"Nightly ingest"}');
    update profiles set role = 'field', sees_rates = false, is_active = true, is_service = true
      where id = '${INGEST}';

    insert into accounts (id, name) values
      ('${ING_ACCOUNT}',   'Ingest Test Co'),
      ('${ING_ACCOUNT_2}', 'Ingest Other Co');
    insert into buildings (id, account_id, name)
      values ('${ING_BUILDING}', '${ING_ACCOUNT}', 'Ingest Test Site');
    insert into opportunities (id, name, stage_id, account_id)
      values ('${ING_DEAL}', 'Ingest Test Deal', '${ingestStage.rows[0].id}', '${ING_ACCOUNT}');
    insert into activities (id, activity_type_id, subject, occurred_at)
      values ('${ING_ACTIVITY}',   '${emailType.rows[0].id}', 'Ingest orphan one', now()),
             ('${ING_ACTIVITY_2}', '${emailType.rows[0].id}', 'Ingest orphan two', now());
    insert into import_batches (id, source_tab, status)
      values ('${ING_BATCH}', 'Ingest suggestions · test', 'draft');
  `)

  // --- The machine account ---------------------------------------------------
  // It has to be ACTIVE, because is_member() requires it and RLS refuses every
  // write otherwise — which is exactly why it cannot be hidden by deactivating
  // it, and why is_service exists at all.
  const ingestWrites = await asUser(db, INGEST, () =>
    db
      .query(
        `insert into activities (activity_type_id, subject, occurred_at, account_id, source, external_id)
         values ($1, 'Written by the nightly job', now(), '${ING_ACCOUNT}', 'outlook', '<verify-1@test>')
         returning id`,
        [emailType.rows[0].id],
      )
      .then((r) => r.rows[0]?.id)
      .catch(() => null),
  )
  check('a service profile passes is_member() and can write an activity', Boolean(ingestWrites))

  const ingestAudit = await db.query(
    `select changed_by from audit_log where record_id = '${ingestWrites}' limit 1`,
  )
  check(
    'the audit log records the machine account by name, not nobody',
    String(ingestAudit.rows[0]?.changed_by) === INGEST,
    JSON.stringify(ingestAudit.rows[0]),
  )

  const ingestIsAdmin = await asUser(db, INGEST, () => db.query(`select public.is_admin() as ok`))
  check('a service profile is not an admin', ingestIsAdmin.rows[0]?.ok === false)

  const ingestRates = await asUser(db, INGEST, () =>
    db.query(`select count(*)::int as n from employee_compensation`),
  )
  check('a service profile cannot read pay rates', ingestRates.rows[0].n === 0)

  // --- Idempotency -----------------------------------------------------------
  const dupActivity = await asUser(db, INGEST, () =>
    db
      .query(
        `insert into activities (activity_type_id, subject, occurred_at, source, external_id)
         values ($1, 'Same email again', now(), 'outlook', '<verify-1@test>')`,
        [emailType.rows[0].id],
      )
      .then(() => false)
      .catch(() => true),
  )
  check('the same email cannot be logged twice', dupActivity)

  await asUser(db, INGEST, () =>
    db.exec(`
      insert into ingested_items (source, external_id, mailbox_id, occurred_at, subject)
        values ('granola', 'note-1', null, now(), 'A meeting note');
    `),
  )
  const dupMirror = await asUser(db, INGEST, () =>
    db
      .query(
        `insert into ingested_items (source, external_id, mailbox_id, occurred_at, subject)
         values ('granola', 'note-1', null, now(), 'A meeting note')`,
      )
      .then(() => false)
      .catch(() => true),
  )
  // NULLS NOT DISTINCT. Without it two nulls count as different and every
  // Granola note would re-insert on every single run, forever.
  check('a mirrored item with no mailbox still cannot arrive twice', dupMirror)

  // --- next_steps: the account roll-up ---------------------------------------
  const rollup = await asUser(db, INGEST, () =>
    db.query(
      `insert into next_steps (title, building_id) values ('From a building', '${ING_BUILDING}')
       returning account_id`,
    ),
  )
  check('a next step on a building rolls up to its account',
    String(rollup.rows[0]?.account_id) === ING_ACCOUNT)

  const rollupDeal = await asUser(db, INGEST, () =>
    db.query(
      `insert into next_steps (title, opportunity_id) values ('From a deal', '${ING_DEAL}')
       returning account_id`,
    ),
  )
  check('a next step on a deal rolls up to its account',
    String(rollupDeal.rows[0]?.account_id) === ING_ACCOUNT)

  await db.exec(`
    insert into contacts (id, first_name, last_name, email, account_id)
      values ('${ING_CONTACT_A}', 'Ingest', 'Contact', 'shared@ingest.test', '${ING_ACCOUNT}');
  `)
  const rollupContact = await asUser(db, INGEST, () =>
    db.query(
      `insert into next_steps (title, contact_id) values ('From a contact', '${ING_CONTACT_A}')
       returning account_id`,
    ),
  )
  check('a next step on a contact rolls up to its account',
    String(rollupContact.rows[0]?.account_id) === ING_ACCOUNT)

  const rollupExplicit = await asUser(db, INGEST, () =>
    db.query(
      `insert into next_steps (title, building_id, account_id)
       values ('Told which account', '${ING_BUILDING}', '${ING_ACCOUNT_2}')
       returning account_id`,
    ),
  )
  check('an explicit account on a next step is never overwritten',
    String(rollupExplicit.rows[0]?.account_id) === ING_ACCOUNT_2)

  const nextStepDup = await asUser(db, INGEST, () =>
    db
      .query(
        `insert into next_steps (title, source, external_id) values ('a', 'outlook_calendar', 'ical-1');
         insert into next_steps (title, source, external_id) values ('b', 'outlook_calendar', 'ical-1');`,
      )
      .then(() => false)
      .catch(() => true),
  )
  check('the same calendar event cannot become two next steps', nextStepDup)

  // --- The allowlist ---------------------------------------------------------
  const linkApplied = await asUser(db, RYAN, () =>
    db.query(`select public.apply_gap_fill('activities', $1, $2::jsonb, $3) as n`, [
      ING_ACTIVITY,
      JSON.stringify({ opportunity_id: ING_DEAL, account_id: ING_ACCOUNT }),
      ING_BATCH,
    ]),
  )
  check('an accepted link writes the deal and the account', linkApplied.rows[0]?.n === 2)

  for (const column of ['subject', 'occurred_at', 'source', 'external_id']) {
    const refused = await asUser(db, RYAN, () =>
      db
        .query(`select public.apply_gap_fill('activities', $1, $2::jsonb, $3)`, [
          ING_ACTIVITY,
          JSON.stringify({ [column]: 'rewritten' }),
          ING_BATCH,
        ])
        .then(() => false)
        .catch(() => true),
    )
    // The machine may say what an activity is ABOUT. Never what it says.
    check(`a suggestion cannot rewrite activities.${column}`, refused)
  }

  // --- The trigger-versus-journal trap ---------------------------------------
  // set_activity_account() is a BEFORE trigger that fills account_id when
  // building_id is set, but apply_gap_fill journals only the columns it wrote
  // itself. Patch building_id alone and undo puts the building back while
  // leaving the account stamped — a state the row was never in. This asserts
  // the trap is real, so nobody removes the workaround thinking it is dead code.
  await asUser(db, RYAN, () =>
    db.query(`select public.apply_gap_fill('activities', $1, $2::jsonb, $3)`, [
      ING_ACTIVITY_2,
      JSON.stringify({ building_id: ING_BUILDING }),
      ING_BATCH,
    ]),
  )
  const trapped = await db.query(
    `select a.account_id,
            (select count(*)::int from import_field_changes f
              where f.batch_id = '${ING_BATCH}' and f.record_id = a.id
                and f.column_name = 'account_id') as journalled
       from activities a where a.id = '${ING_ACTIVITY_2}'`,
  )
  check(
    'the trigger fills account_id behind a patch, and does not journal it',
    String(trapped.rows[0]?.account_id) === ING_ACCOUNT && trapped.rows[0]?.journalled === 0,
    JSON.stringify(trapped.rows[0]),
  )

  const undone = await asUser(db, RYAN, () =>
    db.query(`select public.rollback_field_changes('${ING_BATCH}') as r`),
  )
  const afterLinkUndo = await db.query(
    `select id, account_id, opportunity_id, building_id from activities
      where id in ('${ING_ACTIVITY}', '${ING_ACTIVITY_2}') order by subject`,
  )
  const one = afterLinkUndo.rows.find((r) => String(r.id) === ING_ACTIVITY)
  const two = afterLinkUndo.rows.find((r) => String(r.id) === ING_ACTIVITY_2)
  check(
    'naming the account in the payload undoes both columns cleanly',
    one?.account_id === null && one?.opportunity_id === null,
    JSON.stringify(one),
  )
  check(
    'undo leaves the trigger-filled account behind when it was never named',
    two?.building_id === null && two?.account_id !== null,
    JSON.stringify(two),
  )
  check('undo reports what it reverted', Number(undone.rows[0]?.r?.reverted ?? 0) >= 3,
    JSON.stringify(undone.rows[0]?.r))

  const undoKeptRows = await db.query(
    `select count(*)::int as n from activities where id in ('${ING_ACTIVITY}', '${ING_ACTIVITY_2}')`,
  )
  check('undo never deletes the activity itself', undoKeptRows.rows[0].n === 2)

  // --- Suggestions -----------------------------------------------------------
  const noQuote = await asUser(db, INGEST, () =>
    db
      .query(
        `insert into ingest_suggestions (kind, confidence, subject_table, subject_id, payload, rationale, dedupe_key)
         values ('field_value', 'inferred', 'buildings', '${ING_BUILDING}', '{}'::jsonb, 'because', 'k-no-quote')`,
      )
      .then(() => false)
      .catch(() => true),
  )
  check('a model-read suggestion with no verified quote is refused', noQuote)

  const noSubject = await asUser(db, INGEST, () =>
    db
      .query(
        `insert into ingest_suggestions (kind, confidence, subject_table, payload, rationale, dedupe_key)
         values ('link_activity', 'exact', 'activities', '{}'::jsonb, 'because', 'k-no-subject')`,
      )
      .then(() => false)
      .catch(() => true),
  )
  check('a patch with nothing to patch is refused', noSubject)

  await asUser(db, INGEST, () =>
    db.exec(
      `insert into ingest_suggestions (kind, confidence, subject_table, subject_id, payload, rationale, dedupe_key, status)
       values ('link_activity', 'exact', 'activities', '${ING_ACTIVITY}', '{"account_id":"${ING_ACCOUNT}"}'::jsonb,
               'matched', 'k-said-no', 'rejected')`,
    ),
  )
  const noMeansNo = await asUser(db, INGEST, () =>
    db
      .query(
        `insert into ingest_suggestions (kind, confidence, subject_table, subject_id, payload, rationale, dedupe_key)
         values ('link_activity', 'exact', 'activities', '${ING_ACTIVITY}', '{"account_id":"${ING_ACCOUNT}"}'::jsonb,
                 'matched', 'k-said-no')`,
      )
      .then(() => false)
      .catch(() => true),
  )
  // Without this the nightly job re-proposes everything already turned down,
  // every night, and the review screen is unusable inside a month.
  check('a suggestion already rejected can never be proposed again', noMeansNo)

  // --- Domains ---------------------------------------------------------------
  await asUser(db, RYAN, () =>
    db.exec(`insert into account_domains (domain, account_id) values ('ingest-test.com', '${ING_ACCOUNT}')`),
  )
  const domainClash = await asUser(db, RYAN, () =>
    db
      .query(
        `insert into account_domains (domain, account_id) values ('ingest-test.com', '${ING_ACCOUNT_2}')`,
      )
      .then(() => false)
      .catch(() => true),
  )
  check('one domain cannot mean two accounts', domainClash)

  const victorAddsDomain = await asUser(db, VICTOR, () =>
    db
      .query(`insert into account_domains (domain, account_id) values ('victor.test', '${ING_ACCOUNT}')`)
      .then(() => false)
      .catch(() => true),
  )
  check('only an admin can change the domain map', victorAddsDomain)

  const publicDomains = await db.query(`
    select public.is_public_email_domain('gmail.com')      as gmail,
           public.is_public_email_domain('bealesllc.com')  as own,
           public.is_public_email_domain('tuftsmedicine.org') as client
  `)
  check(
    'personal and internal domains are never mappable',
    publicDomains.rows[0].gmail === true &&
      publicDomains.rows[0].own === true &&
      publicDomains.rows[0].client === false,
    JSON.stringify(publicDomains.rows[0]),
  )

  // A domain whose contacts sit under two accounts could only ever be wrong,
  // so it is never offered — the constraint should not be what tells you.
  await db.exec(`
    insert into contacts (id, first_name, last_name, email, account_id)
      values ('${ING_CONTACT_B}', 'Split', 'Domain', 'b@split.test', '${ING_ACCOUNT_2}');
    insert into contacts (first_name, last_name, email, account_id)
      values ('Split', 'Domain Two', 'a@split.test', '${ING_ACCOUNT}');
  `)
  const candidates = await asUser(db, RYAN, () => db.query(`select * from v_domain_candidates`))
  const domains = candidates.rows.map((r) => r.domain)
  check('a domain spanning two accounts is not offered', !domains.includes('split.test'),
    JSON.stringify(domains))
  check('a domain already mapped is not offered again', !domains.includes('ingest-test.com'))
  check('a real single-account domain is offered', domains.includes('ingest.test'),
    JSON.stringify(domains))

  // --- Silence ---------------------------------------------------------------
  const quiet = await asUser(db, RYAN, () => db.query(`select * from v_quiet_accounts`))
  check('quiet accounts are readable by a signed-in member', quiet.rows.length > 0)
  const quietDeal = quiet.rows.find((r) => String(r.account_id) === ING_ACCOUNT)
  check('an account with an open deal says so', quietDeal?.has_open_deal === true,
    JSON.stringify(quietDeal))

  // --- Grants are a snapshot, not a rule --------------------------------------
  for (const object of [
    'next_steps',
    'ingest_suggestions',
    'ingested_items',
    'account_domains',
    'v_quiet_accounts',
    'v_domain_candidates',
  ]) {
    const readable = await asUser(db, RYAN, () =>
      db
        .query(`select count(*) from ${object}`)
        .then(() => true)
        .catch(() => false),
    )
    check(`authenticated can select ${object}`, readable)
  }

  // The list in addresses.ts and the SQL function have to agree, or the view
  // offers a domain the matcher will then refuse to use.
  const addressesTs = await readFile(
    new URL('../src/lib/ingest/addresses.ts', import.meta.url).pathname,
    'utf8',
  )
  const sqlDomains = await db.query(`
    select unnest(array['gmail.com','outlook.com','yahoo.com','icloud.com','bealesllc.com']) as d
  `)
  check(
    'the freemail list in TypeScript matches the one in SQL',
    sqlDomains.rows.every((r) => addressesTs.includes(`'${r.d}'`)),
  )

  // ---------------------------------------------------------------------------
  console.log('\nSites: one building, several contracts')

  const SITE = 'aaaa0000-0000-0000-0000-000000005170'
  const ACC_LL = 'aaaa0000-0000-0000-0000-000000000011'
  const ACC_TEN = 'aaaa0000-0000-0000-0000-000000000022'
  const B_LL = 'aaaa0000-0000-0000-0000-0000000000b1'
  const B_TEN = 'aaaa0000-0000-0000-0000-0000000000b2'

  // The 90 Libbey Pkwy shape: a landlord contract and a tenant contract at one
  // address, with the money sitting on the wrong one of the two.
  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into accounts (id, name) values
      ('${ACC_LL}', 'Landlord Holdings'), ('${ACC_TEN}', 'Tenant Health');
    insert into sites (id, name, address_line1, city, square_footage)
      values ('${SITE}', '90 Example Pkwy', '90 Example Pkwy', 'Weymouth', 42000);
    insert into buildings (id, account_id, name, site_id, tenancy) values
      ('${B_LL}',  '${ACC_LL}',  'Day porter + nights', '${SITE}', 'landlord'),
      ('${B_TEN}', '${ACC_TEN}', 'Tenant suite',        '${SITE}', 'tenant');
    select set_building_monthly_value('${B_LL}', 2100, (current_date - interval '4 months')::date, 'initial');
  `)

  const shared = await db.query(
    `select count(*)::int as n from buildings where site_id = '${SITE}' and deleted_at is null`,
  )
  check('two contracts can share one physical site', shared.rows[0].n === 2)

  const siteRollup = await db.query(`select * from v_site_contracts where site_id = '${SITE}'`)
  check('the site rolls up both contracts', Number(siteRollup.rows[0]?.contract_count) === 2)
  check('it separates landlord from tenant', Number(siteRollup.rows[0]?.landlord_contracts) === 1)
  check('it counts both customers', Number(siteRollup.rows[0]?.account_count) === 2)

  // The assertion this whole migration exists for. Moving a contract between
  // two records of the same place must not invent revenue movement — the old
  // way (close one period, open another) would have written $2,100 of churn
  // and $2,100 of new business into the same month, permanently.
  const mrrBefore = await db.query(
    `select month, mrr::numeric as v from v_mrr_by_month order by month`,
  )
  const waterBefore = await db.query(
    `select coalesce(sum(churn), 0)::numeric as churn, coalesce(sum(new_business), 0)::numeric as nb
     from v_mrr_waterfall`,
  )

  const moved = await asUser(db, RYAN, () =>
    db.query(`select move_contract_periods_to_building('${B_LL}', '${B_TEN}') as n`),
  )
  check('the contract period moves', Number(moved.rows[0].n) === 1)

  const onTenant = await db.query(
    `select count(*)::int as n from building_contract_periods where building_id = '${B_TEN}'`,
  )
  check('it now belongs to the tenant contract', onTenant.rows[0].n === 1)

  const mrrAfter = await db.query(
    `select month, mrr::numeric as v from v_mrr_by_month order by month`,
  )
  check(
    'company MRR is unchanged in every month',
    JSON.stringify(mrrBefore.rows) === JSON.stringify(mrrAfter.rows),
  )

  const waterAfter = await db.query(
    `select coalesce(sum(churn), 0)::numeric as churn, coalesce(sum(new_business), 0)::numeric as nb
     from v_mrr_waterfall`,
  )
  check(
    'no churn is invented by the move',
    Number(waterBefore.rows[0].churn) === Number(waterAfter.rows[0].churn),
  )
  check(
    'no new business is invented by the move',
    Number(waterBefore.rows[0].nb) === Number(waterAfter.rows[0].nb),
  )

  // Two open periods on one building double-counts it in every MRR view.
  await db.exec(`
    set local test.user_id = '${RYAN}';
    select set_building_monthly_value('${B_LL}', 900, current_date::date, 'initial');
  `)
  let refusedDouble = false
  try {
    await asUser(db, RYAN, () =>
      db.query(`select move_contract_periods_to_building('${B_LL}', '${B_TEN}')`),
    )
  } catch {
    refusedDouble = true
  }
  check('it refuses to give one building two open periods', refusedDouble)

  let refusedNonAdmin = false
  try {
    await asUser(db, VICTOR, () =>
      db.query(`select move_contract_periods_to_building('${B_LL}', '${B_TEN}')`),
    )
  } catch {
    refusedNonAdmin = true
  }
  check('only an admin can move contract history', refusedNonAdmin)

  // A site is a tidy-up-able list. Deleting one must never be able to take a
  // contract — and the money on it — with it.
  await db.exec(`set local test.user_id = '${RYAN}'; delete from sites where id = '${SITE}';`)
  const survived = await db.query(
    `select count(*)::int as n from buildings where id in ('${B_LL}', '${B_TEN}') and deleted_at is null`,
  )
  check('deleting a site does not delete its contracts', survived.rows[0].n === 2)
  const orphaned = await db.query(
    `select count(*)::int as n from buildings where id = '${B_LL}' and site_id is null`,
  )
  check('their site link is cleared, not cascaded', orphaned.rows[0].n === 1)

  const siteView = await asUser(db, VICTOR, () =>
    db.query('select count(*)::int as n from v_site_contracts'),
  )
  check('authenticated can select v_site_contracts', Number.isInteger(siteView.rows[0].n))

  // ---------------------------------------------------------------------------
  console.log('\nMatch aliases: what a note title means')

  // normalise_alias() is duplicated in TypeScript as normaliseAlias(), because
  // v_alias_candidates has to apply it and a view cannot call TypeScript. Both
  // halves are pinned: the behaviour here, and the suffix table below.
  const norm = await db.query(`
    select
      public.normalise_alias('90 Libbey Parkway.')        as pkwy,
      public.normalise_alias('  Dana-Farber / Brigham  ') as punct,
      public.normalise_alias('Ste 3500')                  as ste,
      public.normalise_alias('851 MIDDLE STREET')         as upper,
      public.normalise_alias('   ')                       as blank
  `)
  const n = norm.rows[0]
  check('normalise_alias collapses street suffixes', n.pkwy === '90 libbey pkwy', String(n.pkwy))
  check('it flattens punctuation to single spaces', n.punct === 'dana farber brigham', String(n.punct))
  check('it treats Ste as Suite', n.ste === 'suite 3500', String(n.ste))
  check('it lower-cases', n.upper === '851 middle st', String(n.upper))
  check('an empty phrase is null, not an empty string', n.blank === null)

  const titlesTs = await readFile(
    new URL('../src/lib/ingest/titles.ts', import.meta.url).pathname,
    'utf8',
  )
  // Pull the pairs straight out of the plpgsql body, so the assertion cannot
  // drift from the function it is checking.
  const sqlPairs = [
    ...(await readFile(
      join(MIGRATIONS_DIR, '20260820090000_match_aliases.sql'),
      'utf8',
    )).matchAll(/array\['([a-z]+)',\s*'([a-z]+)'\]/g),
  ].map((m) => [m[1], m[2]])
  check('the SQL suffix table is not empty', sqlPairs.length >= 10, `${sqlPairs.length} pairs`)
  check(
    'every street suffix in SQL is in titles.ts too',
    sqlPairs.every(([long, short]) => new RegExp(`\\b${long}:\\s*'${short}'`).test(titlesTs)),
    sqlPairs.filter(([l, s]) => !new RegExp(`\\b${l}:\\s*'${s}'`).test(titlesTs)).join(' '),
  )
  const tsPairs = [...titlesTs.matchAll(/^\s{2}([a-z]+): '([a-z]+)',$/gm)].map((m) => [m[1], m[2]])
  check(
    'and every one in titles.ts is in SQL',
    tsPairs.length === sqlPairs.length &&
      tsPairs.every(([long, short]) => sqlPairs.some(([l, s]) => l === long && s === short)),
    `ts ${tsPairs.length} vs sql ${sqlPairs.length}`,
  )

  const ACC_AL = 'aaaa0000-0000-0000-0000-0000000000a1'
  const B_AL1 = 'aaaa0000-0000-0000-0000-0000000000c1'
  const B_AL2 = 'aaaa0000-0000-0000-0000-0000000000c2'
  const B_AL3 = 'aaaa0000-0000-0000-0000-0000000000c3'

  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into accounts (id, name) values ('${ACC_AL}', 'Alias Test Health');
    insert into buildings (id, account_id, name, address_line1, city) values
      ('${B_AL1}', '${ACC_AL}', 'Landlord contract', '90 Shared Pkwy', 'Weymouth'),
      ('${B_AL2}', '${ACC_AL}', 'Tenant contract',   '90 Shared Parkway', 'Weymouth'),
      ('${B_AL3}', '${ACC_AL}', 'Sole contract',     '77 Distinct Way', 'Quincy');
    insert into match_aliases (alias, building_id, added_by)
      values ('wound center', '${B_AL1}', '${RYAN}');
  `)

  // unique(alias) IS the contract: a phrase that could mean two records must
  // mean neither, decided by the database rather than counted at 3am.
  let dupeAlias = false
  try {
    await db.exec(
      `set local test.user_id = '${RYAN}';
       insert into match_aliases (alias, building_id) values ('wound center', '${B_AL2}');`,
    )
  } catch {
    dupeAlias = true
  }
  check('one alias cannot mean two records', dupeAlias)

  let noTarget = false
  try {
    await db.exec(`insert into match_aliases (alias) values ('orphan phrase');`)
  } catch {
    noTarget = true
  }
  check('an alias must point at something', noTarget)

  let twoTargets = false
  try {
    await db.exec(
      `insert into match_aliases (alias, account_id, building_id)
       values ('two targets', '${ACC_AL}', '${B_AL1}');`,
    )
  } catch {
    twoTargets = true
  }
  check('an alias cannot point at two things at once', twoTargets)

  // Stored already normalised, so a lookup is an equality rather than a function
  // call on every row.
  let unnormalised = false
  try {
    await db.exec(`insert into match_aliases (alias, building_id) values ('Wound Center', '${B_AL2}');`)
  } catch {
    unnormalised = true
  }
  check('an alias must be stored already normalised', unnormalised)

  const readAlias = await asUser(db, VICTOR, () =>
    db.query('select count(*)::int as n from match_aliases'),
  )
  check('every member can read the alias map', readAlias.rows[0].n === 1)

  let victorAliasWrite = false
  try {
    await asUser(db, VICTOR, () =>
      db.query(`insert into match_aliases (alias, building_id) values ('victors phrase', '${B_AL2}')`),
    )
  } catch {
    victorAliasWrite = true
  }
  check('only an admin can change the alias map', victorAliasWrite)

  // The candidates view carries the same refusal as v_domain_candidates: a
  // phrase two records would both claim is excluded, never offered.
  const cands = await asUser(db, VICTOR, () =>
    db.query(`select alias, kind from v_alias_candidates where alias like '%shared%' or alias like '%distinct%'`),
  )
  const aliases = cands.rows.map((r) => r.alias)
  check(
    'a phrase two buildings share is never offered',
    !aliases.includes('90 shared pkwy'),
    aliases.join(' | '),
  )

  // On delete cascade: tidying a record up takes its aliases with it, rather
  // than leaving a phrase pointing at a ghost the matcher resolves to nothing.
  await db.exec(`set local test.user_id = '${RYAN}'; delete from buildings where id = '${B_AL1}';`)
  const afterDelete = await db.query(
    `select count(*)::int as n from match_aliases where alias = 'wound center'`,
  )
  check('deleting a record takes its aliases with it', afterDelete.rows[0].n === 0)

  check(
    'a phrase only one record claims is offered',
    aliases.includes('77 distinct way'),
    aliases.join(' | '),
  )

  // A building named after its own address produced the same alias twice — once
  // as Address, once as Building — which the admin screen rendered as two
  // identical chips sharing a React key.
  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into buildings (id, account_id, name, address_line1, city)
      values ('aaaa0000-0000-0000-0000-0000000000c4', '${ACC_AL}', '5 Selfnamed Way', '5 Selfnamed Way', 'Hull');
  `)
  const selfNamed = await asUser(db, VICTOR, () =>
    db.query(`select count(*)::int as n from v_alias_candidates where alias = '5 selfnamed way'`),
  )
  check('a record never offers the same phrase twice', selfNamed.rows[0].n === 1, `${selfNamed.rows[0].n} rows`)

  // Granola authenticates as a personal Gmail address. Without this table
  // creditTo() falls back to the machine account and every note reads "logged
  // by Nightly ingest" instead of by a person.
  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into profile_email_aliases (profile_id, email, added_by)
      values ('${RYAN}', 'someone@example.invalid', '${RYAN}');
  `)
  let dupeEmail = false
  try {
    await db.exec(
      `insert into profile_email_aliases (profile_id, email)
       values ('${VICTOR}', 'someone@example.invalid');`,
    )
  } catch {
    dupeEmail = true
  }
  check('one address cannot belong to two people', dupeEmail)

  let mixedCase = false
  try {
    await db.exec(
      `insert into profile_email_aliases (profile_id, email) values ('${VICTOR}', 'Someone@Example.Invalid');`,
    )
  } catch {
    mixedCase = true
  }
  check('a profile alias must be stored lower-cased', mixedCase)

  let victorAlias = false
  try {
    await asUser(db, VICTOR, () =>
      db.query(`insert into profile_email_aliases (profile_id, email) values ('${VICTOR}', 'v@example.invalid')`),
    )
  } catch {
    victorAlias = true
  }
  check('only an admin can claim an address for somebody', victorAlias)

  // matched_on is what lets the admin screen say WHY, rather than asking anyone
  // to take the confidence tier on faith.
  await db.exec(`
    set local test.user_id = '${RYAN}';
    insert into ingested_items (source, external_id, occurred_at, subject, status, matched_by, matched_on)
      values ('granola', 'note-matched-on', now(), 'Wound center inspection', 'linked', 'exact', 'wound center');
  `)
  const why = await db.query(
    `select matched_on from ingested_items where external_id = 'note-matched-on'`,
  )
  check('the mirror records the phrase that matched', why.rows[0]?.matched_on === 'wound center')
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
