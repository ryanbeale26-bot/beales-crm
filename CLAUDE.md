# CLAUDE.md — Beale's LLC CRM

Persistent context for Claude Code sessions in this repo. **Keep this file updated.** At the end of every phase, update "Current Status," add anything learned to "Decision Log," and resolve items in "Open Questions." A future session should be able to read only this file and be productive.

---

## What this is

An internal CRM for the 5-person senior leadership team at Beale's LLC, a family-owned commercial facility services company outside Boston (~150 employees, ~50 buildings across Greater Boston / New England, founded 1986). It replaces a Google Sheet that only Ryan maintains.

The four jobs it must do:

1. Track daily activity inside accounts (calls, site visits, complaints, wins)
2. Track staff movement and completed project work at each building
3. Manage opportunities — creation, stage progression, closed-won, closed-lost
4. Report on revenue growth, account expansion, and account/opportunity losses

**The adoption bar governs every design decision.** This team has never used a CRM. If the app is harder than the spreadsheet, they won't use it and the project fails. Logging an activity must take under 20 seconds on a phone. Required fields are the enemy.

## Who uses it

Five people, invite-only, no public signup. All five see all data.

| Name | Title | App role | Email | Sees pay rates |
|---|---|---|---|---|
| Ryan Beale | Managing Director | Admin | ryan@bealesllc.com | **Yes** |
| Jon Beale | President, Owner | Leadership | jbeale@bealesllc.com | **Yes** |
| Robert Mulligan | Managing Director | Leadership | rmulligan@bealesllc.com | **Yes** |
| Bob Mulligan | Vice President, Owner | Leadership | bmulligan@bealesllc.com | **Yes** |
| Victor Melo | Area Manager | Field | vmelo@bealesllc.com | No |

Non-admins have full read/write on accounts, buildings, contacts, activities, opportunities, projects, and employees. Admins additionally manage users, reference data, and imports.

**On the two Mulligans.** Robert Mulligan and Bob Mulligan are **different people**, both surnamed Mulligan — do not dedupe them, and do not assume "Bob" is short for this Robert. Tell them apart by email: `rmulligan@` is Robert, `bmulligan@` is Bob.

The original spec spelled Robert's surname "Milligan", which is wrong — there is no Milligan at the company. Corrected 2026-08-12. If you find "Milligan" anywhere in this repo, it means Robert Mulligan.

**Pay rates: everyone except Victor Melo.** Confirmed 2026-08-12. Four of the five see pay rates, bill rates and labour margin; Victor, who is in the field, does not.

## Who Ryan is, and how to work with him

Not a professional developer. Has shipped one real app (InspectQA) using Claude Code, so he can read code, run terminal commands, and debug with guidance — but explain things in plain English.

- Plan before building. Propose, then wait for confirmation.
- One phase at a time. End each phase by telling him exactly what to test in the browser, then stop.
- Explain terminal commands before he runs them, and say what success looks like.
- Commit at every phase with plain-English messages.
- Never invent business data — real building names, contract values, team workflows. Ask.
- Push back when a request will hurt performance, maintainability, or adoption.

---

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Supabase** — Postgres, Auth, RLS on every table, Storage
- **Tailwind CSS** + **shadcn/ui**
- **Recharts**
- **Vercel** (Ryan has Pro)

Rules:
- Secrets in `.env.local` and Vercel env vars only. **The service role key never reaches client-side code.**
- Every table ships with RLS enabled and an explicit authenticated-user policy. No exceptions.
- Revenue math lives in **Postgres views or SQL functions**, never in React. One source of truth for "what is MRR."
- No `localStorage` for application data.
- Seed script with realistic fake records so screens are never empty in development.

---

## Architecture decisions already made

**0. Contracted hours vs. scheduled hours.** A building records what the *contract* calls for — day porter hours/day, night hours/night, days per week for each, and a weekend total. `v_building_hours` turns that into weekly / monthly / annual hours. Separately, `employee_assignments` records who actually covers it and for how many hours. The building page shows both side by side, because the gap between them is the thing worth seeing. Monthly hours are annual ÷ 12, never weekly × 4.

Weekend hours are stored as a **weekly total**, not per weekend day — the field is labelled that way to kill the ambiguity.

**1. Account vs. Building split.** An *account* is a customer relationship; a *building* is a serviced site. One account, many buildings. Contract value, square footage, scope, staffing, pay rates, and bill rates all live on the **building** and roll up to the account. This lets Beale's lose one building in a portfolio without losing the account, and makes revenue reporting correct.

**2. Separate Supabase project from InspectQA.** InspectQA is live in client environments — South Shore Health and Dana-Farber — and is being prepared as a standalone SaaS spinout. CRM migrations must not be able to touch it, and its schema must stay cleanly separable for technical diligence. The CRM reads InspectQA across the project boundary via a read-only role and mirrors the data locally.

**The three Supabase projects, confirmed 2026-08-12.** Check the ref, not the name, before pointing anything at a database:

| Project | Ref | What it is |
|---|---|---|
| `beales-crm` | `pjcitahktwnawucoznhk` | **This CRM.** The only project these migrations may touch |
| `beales-inspections` | `illxdfvqvuwoqwbplgiy` | **InspectQA — live production, client-facing. Read-only, forever.** |
| `CRM - Beales and AFS` | `kbqivepqykccdyexgnhu` | Abandoned earlier attempt. Not live. Being retired — do not use |

Earlier versions of this file named `kbqivepqykccdyexgnhu` as InspectQA. That was wrong. InspectQA's tables (`inspections`, `inspection_sections`, `inspection_tasks`, `photos`, `missed_walks`, `organizations`) are in `beales-inspections`, verified in its table editor.

**Note for Phase 7:** InspectQA calls a serviced site a **`building`**, not a "site". The CRM's `inspectqa_site_id` column and `inspectqa_site_map` table map to InspectQA's `buildings.id`. It also has `organizations`, so it is multi-tenant — filter to Beale's own org when syncing.

**3. InspectQA is read-only and authoritative for inspections and work orders.** Never write to it. Never rebuild inspection or work-order creation in the CRM. CRM queries always read the local mirror tables, so InspectQA being down never breaks the CRM.

**4. Two operating entities.** Beale's LLC (non-union) and Assurance Facility Services / AFS (workplace-organization signatory). Buildings carry an `entity` field so revenue reports split cleanly.

**5. Paychex has no usable API.** Do not attempt one. Payroll data enters via weekly email ingest into reviewable `staffing_reports` rows, plus manual pay-rate fields.

**6. Integrations come last.** Nothing before the core app is in daily use with real data. Order: InspectQA → payroll email ingest → Gmail/Outlook → Granola → Claude API summaries.

**7. `employee_assignments` is load-bearing.** The employee↔building join carries hours, pay rate, and bill rate. It is the source of labor margin per building *and* the source of truth for staff movement — an assignment ending plus another beginning is a move.

**8. Audit log.** Five people editing shared records; track who changed what and when.

---

## Migration source: Ryan's Google Sheet

Six tabs, the source of truth for all existing data. **Ask for actual headers of the specific tab you need, at the phase you need it. Never design an importer from imagination.**

| Tab | Becomes | Phase |
|---|---|---|
| `0-Dashboard` | Metrics Ryan already watches → drives dashboard design | 5 |
| `1-Pipeline` | `opportunities` | 3 |
| `2-Active Clients` | `accounts` + `buildings` | 1 |
| `3-Contact Directory` | `contacts` + contact↔building links | 1 |
| `4-Activity Log` | `activities` | 2 |
| `5-Won/Loss Analysis` | Closed-won/lost history, loss reasons, competitors | 3 |

### What the workbook actually contains (read 2026-08-12)

The file lives at `private-data/Beales_CRM.xlsx` (git-ignored). **Every tab has its headers on row 4** — rows 1–3 are title banners. Row counts: Pipeline 52, Active Clients 38 + a `TOTAL ACTIVE ARR` row that must be skipped, Contacts 95, Activity Log ~670, Won/Lost 19.

**Real deal stages**, with the win probabilities from `0-Dashboard`:

| Stage | Probability |
|---|---|
| Targeting | 5% |
| Hot Lead | *not on the dashboard — ask* |
| Pre-RFP | 15% |
| RFP Sent | 35% |
| RFP Response | *not on the dashboard — ask* |
| Verbal Commitment | 75% |
| Closed Won | 100% |
| Closed Lost | 0% |

This is an RFP-driven pipeline, nothing like the six placeholder stages in the original spec. Replace the seeded stages with these.

**`0-Dashboard` mirrors, for Phase 5:** six KPI tiles (Active Clients, Pipeline Deals, Monthly ARR, Pipeline Value, Contacts, Win Rate), a pipeline-by-stage table (count, total annual value, win probability, weighted value), and a client-health summary (Healthy / Needs Attention / At Risk, with count and monthly ARR). Note "Monthly ARR" means MRR.

**Things the schema did not anticipate:**

- **Health Score** on each client — Healthy / Needs Attention / At Risk. Ryan already runs the business on it and the dashboard summarises by it. Needs a column on `buildings`.
- **Activity Type is free text with ~95 distinct values** ("Email - Sent (Follow-Up)", "Meeting — Site Walk", "Site Visit (Deep Clean)"). They must be mapped down to a controlled list at import.
- **Activity Source** includes iMessage, Google Calendar, Outlook Calendar, Cowork and "Nightly CRM Logger" — the `activity_source` enum needs extending.
- **Owner is sometimes shared** — "Both", "Ryan / Robert" — and includes **Brendan**, who is not one of the five users.
- **`3-Contact Directory` is not only client contacts.** Relationship Type includes Vendor, Internal, Employee, Union Partner, Subcontractor.
- **`ICOR Quadrant`, `Filed to BKM?` and `BKM Path`** on the activity log are Ryan's personal knowledge-management taxonomy, not CRM fields.
- **Only 11 of 39 client rows carry a monthly value.** Most of the portfolio has no contract figure in the sheet at all.
- **`CleanSmarts ID`** is populated once — likely the precursor to `inspectqa_site_id`.
- Loss data is thin: one recorded loss, to **Janitronics**.

**Segments (become `property_types`):** Healthcare, Office, CRE / Life Sci, Biotech / Life Sci, Industrial, Property Mgmt, Government, Education, Multi-Family / Affordable Housing, Healthcare / Office (Union), Other - Services Vendor.

**`2-Active Clients` is one row per building, not per account** — and it is worse than the spec suggested. There is no account column, no building-name column and no address column. All three are encoded in two free-text fields:

- `Client Name` carries both, separated by an em-dash: `Tufts Medicine — CBRE (Reading)`, `Boston Scientific — Quincy`, `Fox Rock Properties — 38 Industrial Park Rd, Plymouth`.
- `Service Scope` carries address, square footage and service type separated by `·`: `100 Adams Rd Clinton MA · 345,774 SF Industrial`. Not every row follows the pattern.

So the importer must split on the em-dash to derive the account, parse `Service Scope` for address and square footage, and show Ryan the proposed groupings for manual merging before writing anything. Several real accounts have multiple sites already: Tufts Medicine — CBRE (4), Boston Scientific (3), JLL (3), Fox Rock Properties (4), Ciminelli (3), Medtronic Covidien (2), South Shore Health (several).

Build the importer as a reusable admin screen — upload CSV → map columns → preview → confirm. Data will be re-imported and corrected several times.

---

## Phase plan

Accounts and activity logging first; pipeline next. Ship Phases 1–6 as a working product before touching any integration.

- [x] **Phase 0** — Scaffold, this file, full schema written and verified, open questions
- [x] **Phase 1a** — Migrations applied, six profiles created, accounts / buildings / contacts CRUD, account detail page with tabs
- [x] **Phase 1b** — Importer built (upload → map columns → preview → confirm → undo). Tabs 2 and 3 supported; **not yet run for real**
- [x] **Phase 2** — Quick-add logging, timelines, activity feed with filters, activity importer. Tab 4 **not yet imported for real**
- [x] **Phase 3** — Opportunities board, stage history, weighted pipeline, closed-lost capture, closed-won conversion to account + building, pipeline report, admin reference-data editor. Importers for tabs 1 and 5 built and rehearsed; **the real imports are Ryan's to run**
- [ ] **Phase 4** — Employees, assignments, staff movement history, projects. **Partly built already:** the `employees` / `employee_assignments` schema, the `/employees` list and form, and assigning someone to a building all shipped alongside Phase 1a. What is missing is an employee detail page, the staff-movement report on top of `v_staff_movement`, and projects entirely — `projects` and `project_employees` have a schema, 10 seeded `project_types`, and no screens at all. **Blocked on where employee data comes from:** the workbook has no employee tab and all three tables are empty
- [x] **Phase 5** — Revenue views in Postgres, dashboard mirroring tab 0, six reports with CSV export, and a correction path that fixes a wrong contract figure without inventing a price change
- [x] **Phase 5b** — The gap-filler. Download a sheet → fill it in Excel → upload → read every
      change → commit → undo, matching on record **id**. All four scopes shipped: buildings,
      open deals, contacts, accounts. The gap census is now a Postgres view on the Import page,
      so nobody has to count the blanks by hand again. **The data entry itself is Ryan's to do**
- [ ] **Phase 6** — Mobile polish, global search (Cmd-K), audit log, empty states, error handling, invite the team
- [x] **Phase 7a** — The nightly ingest spine. Migration, the machine account, the cron route, the
      three confidence tiers, `next_steps`, the review queue, the domain map, and the workbook
      relink that gives 113 orphan activities a deal. Runs on fixtures; no external credentials
      needed or used
- [ ] **Phase 7b** — Microsoft Graph: mail + calendar, delta tokens, the multi-mailbox loop,
      `ingest_runs`. **Blocked on the app registration and 3–4 real samples**
- [ ] **Phase 7c** — Granola notes, joined to calendar events by `iCalUId`
- [ ] **Phase 7d** — The extraction layer: written commitments as next steps, non-revenue
      gap-fill proposals. Money is never model-proposed
- [ ] **Phase 8+** — The remaining integrations: InspectQA, then the payroll email ingest

**The order changed on purpose.** This file used to put InspectQA and payroll before mail, after
Phase 6. Ryan moved mail, calendar and Granola to the front on 2026-08-17, for two reasons worth
keeping: activity logging is the habit the whole CRM depends on and nobody is doing it by hand,
and 374 of 667 activities are attached to nothing — so this was the moment to fix how matching
works before more data arrived. Phase 6 and InspectQA follow.

## Current status

**Phase:** 7a shipped; 7c (Granola) in progress. **Migration `20260819090000_sites.sql` is
applied** to `beales-crm`, and `/admin/cleanup` is built but **not yet deployed** — it exists only
on Ryan's laptop until the next push. **Last session:** 2026-08-18.

**What changed on 2026-08-18.** The Granola personal API key is in `.env.local` and reaches **231
notes** spanning Aug 2025 – Aug 2026, ~25–30 a month. A workspace key was tried first and saw only
4 notes in a Team Space — a workspace key structurally cannot read private notes, and it fails as a
200 with plausible-looking data rather than an error. The `sites` table landed, answering the
one-building-two-accounts question. Two duplicate accounts were merged and archived through the new
clean-up screen: **Cancer Center → South Shore Health** (44 activities and $6,800 now on
`Cancer Center - Dana Farber / Brigham (101 Columbian St)`) and **Wound Center → South Shore Health**
($2,100 and 12 activities on `Wound Center (90 Libbey Pkwy, Weymouth)`). Two new Fox Rock landlord
contracts were created at 90 and 97 Libbey Pkwy. **MRR is unchanged at $47,148** through all of it,
verified before and after. Live counts now: **20 accounts, 39 buildings**, 97 contacts, 55
opportunities, 667 activities, 11 open contract periods.

**Still to do in 7c:** run `npm run sites:backfill` (0 of 39 buildings have a site yet), build the
alias table, write `granola.ts`, alias `ryanbeale26@gmail.com` to Ryan's profile so notes are
credited to him rather than to the ingest account, and decide backfill vs forward-only for the 231
historical notes. Two records are still archivable: a stray `90 Libbey` under South Shore Health
and `97 Libbey Pkwy, Weymouth` still under `South Coast Dermatology`.

**Also fixed:** the Supabase **Site URL was missing its `https://` scheme**, so every magic link and
password-recovery link landed on `pjcitahktwnawucoznhk.supabase.co/beales-crm.vercel.app` and died.
Earlier versions of this file recorded the Site URL as configured — it was, but wrongly, and it
would have broken the first sign-in for all four remaining colleagues. **Ryan corrected it to
`https://beales-crm.vercel.app` on 2026-08-18**, so magic links work again.

Separately, **Defender Safe Links on Exchange Online pre-opens recovery links and burns the
one-time token** before a human clicks, so a Supabase recovery email can arrive already expired
(`otp_expired`). That is not retryable and it will affect all five accounts. `npm run user:password`
exists to take email out of the loop entirely — it prompts for the password with the echo
suppressed and calls `admin.updateUserById` locally.

**Previously:** 7a shipped. The nightly ingest spine is built, tested end to end against the real
database and committed; migration `20260818090000_ingest.sql` is **already applied** to
`beales-crm`. Phases 1–5b are live at `https://beales-crm.vercel.app`. **All five spreadsheet tabs
are imported** — 22 accounts, 38 buildings, 97 contacts, 667 activities, 55 opportunities.
**Last session:** 2026-08-17

**Next, in this order:**

1. **Ryan's setup, which unblocks 7b.** The Entra app registration, admin consent for `Mail.Read`
   and `Calendars.Read`, and the `New-ApplicationAccessPolicy` command that scopes it to a
   mail-enabled security group — see "What Ryan has to set up" below. Then 3–4 real samples
   before a single line of parser is written.
2. **The Vercel environment variables**, or the cron runs nowhere. Also confirm Fluid Compute is
   on, or Pro caps the function at 300s instead of 800s.
3. **The gap-fill data entry**, still untouched and still the thing that makes every number in
   the app more truthful.
4. **Phase 6** — mobile polish, Cmd-K, audit log UI, inviting the team.

Live counts: 7 import batches (5 committed spreadsheet imports, plus 2 gap-fill batches from the
5b session, both **rolled back** — test residue, ignorable), 8 win reasons, 1 competitor
(Janitronics). **`employees`, `employee_assignments` and `projects` are all still empty** —
nothing in the workbook feeds them, which is the first thing Phase 4 has to solve.
`ingested_items`, `next_steps`, `ingest_suggestions` and `account_domains` are all empty too:
7a's testing was cleaned out deliberately, and nothing arrives in them until 7b has credentials.

### What Phase 7a shipped

The nightly job reads a source, turns what already happened into `activities` and what has not
happened yet into `next_steps`, applies a link **only when it is a fact**, and leaves everything
else as a suggestion that expires on its own.

Ryan's four decisions, taken 2026-08-17:

| | |
|---|---|
| **Where it runs** | Vercel Cron → `/api/cron/ingest`. The job signs in as a real Supabase profile. **The service role key still never goes near Vercel** |
| **Whose mail** | One Graph app registration scoped to a mail-enabled security group. The group starts with Ryan alone; adding the other four later is a membership change, no code, no redeploy. The schema is multi-mailbox from day one so nothing needs migrating when they join |
| **How much mail** | Only messages where a participant matches a known contact, or whose domain maps to an account. Everything else is left alone — address recorded, nothing more |
| **Shared email** | One email to several colleagues becomes **one** activity, credited to the sender if the sender is one of the five, else the first of them on the message |
| **What is stored** | Sender, recipients, subject, timestamp, ~500 characters. **No full bodies, ever** |

| Thing | Why it is the way it is |
|---|---|
| **`isPublicPath()` in `proxy.ts` lets `/api/cron/` through** | The matcher covers `/api/*` and Vercel Cron carries no session cookie, so every nightly run would have 307'd to `/login` and reported success. One line, and the failure it prevents is silent |
| **The job signs in as `ingest@bealesllc.com`, a profile flagged `is_service`** | The rule `.env.local.example` protects is "the deployed app can never do more than a signed-in member can do". A leaked `INGEST_USER_PASSWORD` gives away one member account; the service role key would give away every row with RLS off, and `auth.uid()` would be null so `audit_log.changed_by` would record nobody — on the table whose whole purpose is who changed what |
| **`profiles.is_service`, rather than deactivating it** | `is_member()` requires `is_active`, so a deactivated machine account cannot write at all. Three edits keep it out of every owner picker: `reference.ts:getOwners()`, `opportunities/page.tsx`, `admin/import/actions.ts`. The **"logged by" filter on `/activity` is deliberately left alone** — filtering the feed to *Nightly ingest* is how you audit a bad night |
| **Three tiers, and only two of them ever write** | `exact` (an address equals exactly one live contact) applies the link. `domain` (the domain maps to exactly one account) applies **the account and nothing else** — which building or which deal is a guess even when the company is certain. `inferred` never applies |
| **Two live contacts sharing an address means *no* link, not the first one** | `contacts_email_idx` is on `lower(email)`, is not unique and has no `deleted_at` clause. The lookup filters deleted rows itself and counts the results |
| **`unique(domain)` on `account_domains`** | "Exactly one account or nothing", enforced by the constraint rather than counted at 3am. The consequence is real and worth stating: `cbre.com` and `jll.com` can never be mapped where an agent's buildings sit under separate accounts, so this tier is quietest on the largest relationships |
| **`next_steps` is its own table, not a flag on `activities`** | Every index on activities is `(something, occurred_at desc)`, so a future-dated row sits at the top of every timeline until the day it happens — and `fetchMyFocus` computes "days quiet" from `max(occurred_at)`, so one meeting booked for Friday would read as "touched today" and drop the account off the follow-up list |
| **A suggestion is a proposed write: `subject_id` set = patch, null = insert** | Every kind reduces to those two verbs, so `kind` only groups and words the screen rather than forking the code. A fifth kind is free |
| **Every patch goes through `apply_gap_fill()`** | It already journals each field, refuses anything off the allowlist, never clears with a blank, casts through the column's own type and writes one audit row per record. So a night of accepted suggestions is one `import_batches` row with the Undo button that already existed. **Nothing new was built for undo** |
| `gap_fill_allows()` gained exactly four pairs | `activities.account_id / building_id / contact_id / opportunity_id`. Not `subject`, `body`, `occurred_at`, `source` or `external_id`: the machine may say what an activity is **about**, never rewrite what it says. Money stays absent, deliberately |
| **The proposer names `account_id` in the payload itself** | `set_activity_account()` is a BEFORE trigger that fills `account_id` when `building_id` is set, but `apply_gap_fill` journals only the columns *it* wrote — so undo would revert the building and leave the account stamped, a state the row was never in. `db:verify` asserts the trap is real **and** that naming it undoes cleanly, so nobody deletes the workaround as dead code |
| **`dedupe_key` is unique across every status, rejected included** | Otherwise the job re-proposes the same 113 links every night forever and the screen is unusable inside a month. The payload is hashed into the key, so a genuinely different proposal about the same record still gets through |
| **`unique nulls not distinct` on the mirror** | `mailbox_id` is null for a Granola note, and by default Postgres treats two nulls as different — so without this every note would re-insert on every run and the mirror would stop being a mirror |
| **`internetMessageId`, never `message.id`** | Graph's `message.id` **changes when a message moves folder**, so filing an email would re-ingest it as a new activity. Calendar uses `iCalUId`, which is also what Granola reports for the same meeting — that is the join across calendar → note → activity |
| **The unknown-sender tray is a mirror row, not a table** | `status = 'ignored'`, empty subject, null snippet, one participant. The promise about scope was "address, domain, count and last-seen — no subject, no body", and this is that promise expressed as data rather than as a comment. A sender is cleared from it the moment they become known — on every match, not only a new one, since the message that finally identifies somebody is usually one already in the mirror |
| **Silence is `v_quiet_accounts`, not suggestion rows** | Same rule as the win rate and the gap census: a stored "this account has gone quiet" row is wrong the second somebody logs a call, and would need a job to unstale it |
| **The review queue says when it is showing only some** | 114 waiting, 100 rendered. A page that implies it is showing everything is the silent-cap mistake, and this app's whole trust model is totals that admit their own gaps |
| **`vercel.json` runs at 07:00 and 09:00 UTC** | Which is 03:00 and 05:00 in Boston in summer, 02:00 and 04:00 in winter — Vercel cron is UTC and offers no alternative, so it appears to move twice a year. Explained in the route file, because `vercel.json` is strict JSON and cannot carry a comment. The second pass is a drain, not a duplicate: state is per item in the database, so a deadline stop is a pause. A self-invoking route would be a recursion bug and a billing incident |
| **The route returns 200 even when items failed** | Vercel retries a failed cron, and a retry storm against a throttled Graph is worse than waiting a day. A failure to *sign in* is different — nothing ran and it will not fix itself — so that one returns 500 and shows up red |

### The relink: what it actually found

The plan was to re-point the 374 orphan activities at their **accounts**, and the dry run killed
that idea outright: **0 of 374** resolve to an account. The ones that were going to match already
did, during the original import.

What they are instead is **deals** — "Jumbo Capital", "HTA REIT — 851 Middle St Fall River",
"Boston Children's Hospital — RFP via Premier (GPO)". **113 of the 374 are an exact match on an
opportunity's name**, measured against the real database with zero ambiguous cases.

That matters more than 113 suggests. **Not one of the 667 activities carried an `opportunity_id`**,
which is exactly why no report can say whether a deal has gone quiet, and why `my-focus.ts` ranks
by stage instead of by anything activity-based. This is where that number stops being zero.

How it works: `commitActivities` read the Company column for the preview and then wrote only
`account_id` and `building_id`, so the company string survives **only in the workbook**. Upload
`Beales_CRM.xlsx` at `/admin/ingest` and each sheet row is keyed back to its activity on
`(subject, occurred_at)` — measured at **667 of 667 matching exactly one activity, none matching
two**, which is what makes it a join rather than a guess. It writes suggestions, so it needed none
of the five-place importer framework: the review screen is the preview and accepting is what
creates the undoable batch.

The 261 left over are genuinely a person's job — vendors (`CleanSmarts`), variant spellings
(`HTA REIT / Healthcare Realty — 851 Middle St, Fall River MA`), and `Internal` /
`General / Unmatched`.

### Where things live

| File | Job |
|---|---|
| `supabase/migrations/20260818090000_ingest.sql` | `profiles.is_service`, `account_domains`, `is_public_email_domain()`, `next_steps` + its account trigger, `ingested_items`, `ingest_suggestions`, four new `gap_fill_allows` pairs, `v_quiet_accounts`, `v_domain_candidates` |
| `src/lib/supabase/ingest.ts` | Signs in as the machine account. Plain `createClient`, **not** `@supabase/ssr` — a cron run has no cookie jar |
| `src/lib/ingest/addresses.ts` | Address parsing, the freemail list and the role-address list. **The freemail list is duplicated in SQL** as `is_public_email_domain()`, because `v_domain_candidates` needs it and a view cannot call TypeScript — `db:verify` asserts the two agree |
| `src/lib/ingest/match.ts` | The three tiers, `creditTo()` and `directionOf()` |
| `src/lib/ingest/suggestions.ts` | `dedupeKey()`, `propose()`, `acceptSuggestions()`, `rejectSuggestions()` |
| `src/lib/ingest/run.ts` | `runIngest()` — fetch, match, write, with a wall-clock deadline |
| `src/lib/ingest/fixtures.ts` | The stand-in source. Exports the **same `SourceFetch` shape** `graph.ts` will, so 7b changes one line in the route. Its addresses are `.invalid` on purpose, so a fixture run against production creates nothing |
| `src/lib/ingest/{review,next-steps}.ts` | The fetchers, page-and-route pattern. `fetchTodaysMeetings()` returns **Meetings Today and Client Matches from one query** — they were never two things |
| `src/lib/import/relink.ts` | The workbook re-match |
| `src/app/api/cron/ingest/route.ts` | `maxDuration = 800`, constant-time `CRON_SECRET` check |
| `src/app/(app)/review/*` | The queue, with bulk apply and dismiss |
| `src/app/(app)/admin/ingest/*` | Source health, the domain map with candidates, and the relink upload |

`db:verify` grew from 118 to **157 checks**.

### Tested end to end, 2026-08-17

Under a temporary admin login (`qa-phase7@bealesllc.com`, now **deactivated, do not delete** — it
holds the audit rows). Proved, in this order:

- `/api/cron/ingest` returns **401 without the secret** and is **not** redirected to `/login`.
- With the secret and nothing mapped, the fixtures ingest **nothing** — 4 seen, 0 written — because
  no address matches anything real. The scope rule holds by default.
- Against a disposable account with a domain mapped: 2 past emails became activities linked to the
  contact and account; the **future meeting became a `next_step`, not an activity**; the stranger's
  message produced a row with an **empty subject and a null snippet**, so the privacy promise is
  visible in the data rather than only in a comment; one `create_contact` suggestion for the cc'd
  person.
- A second and third run created **nothing** — 3 already seen.
- The relink proposed **113** links from the real workbook, matching the dry run exactly.
- Applying 100 of them moved activities-linked-to-a-deal from **0 to 100** and orphans from 374 to
  274, as one committed batch with 115 journalled field changes.
- A field was then **hand-edited** and the batch undone: **99 reverted, 1 skipped**, the hand edit
  survived, the batch reported *"1 field was changed by hand since this import, so it was left as
  it is."*, and **no activity was deleted**.
- Everything was then removed. Final counts are **identical to the start** — accounts 22,
  buildings 38, contacts 97, opportunities 55, activities 667, contract periods 11, contact links
  36, building services 31, import batches 7, field changes 15 — orphans back to 374, and **MRR
  unchanged at $47,148 with coverage still 11 of 38**.

`npm run db:verify` 157/157, `typecheck`, `lint`, and a **cold** `rm -rf .next && npm run build`
all pass.

### What Ryan has to set up

Nothing below blocked 7a. All of it blocks 7b.

**Microsoft 365 — needs tenant-admin rights, so likely the IT team.** `bealesllc.com` is on
Exchange Online (verified from public DNS: MX → `bealesllc-com.mail.protection.outlook.com`), so
**one app registration covers mail and calendar together**.

1. **Entra ID → App registrations → New registration.** Single tenant, no redirect URI. Keep the
   Application (client) ID and Directory (tenant) ID. Create a client secret and copy its
   **value** immediately — it is shown once.
2. **API permissions → Microsoft Graph → Application permissions** (not delegated): `Mail.Read`
   and `Calendars.Read`. Then **Grant admin consent**. Success looks like the row reading
   *Granted for Beale's LLC* with a green tick. Without that click the app can do nothing.
3. **Scope it, or it can read all ~150 mailboxes.** Create a mail-enabled security group
   `crm-ingest@bealesllc.com` containing Ryan only, then in Exchange Online PowerShell:
   `New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId crm-ingest@bealesllc.com -AccessRight RestrictAccess -Description "Beale's CRM nightly ingest"`.
   Success is `Test-ApplicationAccessPolicy -Identity ryan@bealesllc.com -AppId <client-id>`
   returning **Granted** and any other mailbox returning **Denied**. Propagation can take over an
   hour, so a wrong Denied is usually just impatience. Adding the other four later is adding them
   to this group — nothing else changes.

**Granola** (Ryan is on Business, confirmed): generate an API key in the desktop app. It starts
`grn_` and is read-only. The public API is `https://public-api.granola.ai/v1` — `GET /v1/notes`
(filters `created_after` / `updated_after`, page size max 30, cursor pagination),
`GET /v1/notes/{id}` (`summary_markdown`, attendees, the calendar event, `include=transcript`),
`GET /v1/folders`. Rate limit 25 requests per 5 seconds burst, 5/second sustained.

**Then 3–4 real samples before any parser is written** — one inbound client email, one outbound,
one calendar event with external attendees, one Granola note. Same rule as the payroll parser.

**Vercel environment variables** (Production): `INGEST_USER_EMAIL`, `INGEST_USER_PASSWORD`,
`CRON_SECRET`, then `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`,
`GRANOLA_API_KEY`. The ingest password was printed by `npm run user:create` when the account was
made and is also in `.env.local`. **Confirm Fluid Compute is on** for the project, or Pro caps
functions at 300s rather than the 800s the route asks for.

### The gap census — now a view, not a hand count

`v_gap_census` returns one row per fillable field with how many records are still missing it, and
it is rendered at the top of `/admin/import`. **Read it there rather than counting by hand.** It
reads `v_mrr_coverage` and `v_pipeline_coverage` for the two numbers those views already own, so
it cannot drift from the revenue and pipeline reports.

Measured 2026-08-17, unchanged from 2026-08-13 except where noted:

| Records | Missing |
|---|---|
| Buildings with no contract value | **27 of 38** |
| Buildings with no property type / segment | **38 of 38** |
| Buildings with no contracted hours | **37 of 38** |
| Buildings with no contract end date | 30 of 38 |
| Buildings with no contract **start** date | **27 of 38** — 26 of them are the same 27 with no value |
| Buildings with no square footage | 25 of 38 |
| Buildings not health scored | 2 of 38 |
| Open deals with no monthly value | **28 of 30** |
| Open deals whose expected close is absent or in the past | **29 of 30** (was 28; time passed) |
| Open deals not linked to an account | 28 of 30 |
| Open deals with no `opened_on` | **30 of 30** — so no sales cycle is measurable on any open deal |
| Contacts not linked to an account | **63 of 97** |
| Contacts with no email | **21 of 97** |
| Contacts with no job title | 22 of 97 (this file previously said 23; 22 is correct) |
| Accounts with no primary contact | **22 of 22** |
| Accounts / buildings with no owner | 1 each |
| Open deals with no owner | **0** — all 30 are owned |

**The live `property_types` list ends with `Other`, not `Other - Services Vendor`** as recorded
further up this file. Eleven types, all active.

### What Phase 5b shipped

Round trip: `/admin/import` → *Fill the gaps* → **Download sheet** per scope → edit in Excel →
upload on the same page → preview → commit → undo from the list at the bottom.

| Thing | Why it is the way it is |
|---|---|
| **`import_field_changes`, a per-field before/after journal** | `rollbackImport` undoes a batch by deleting rows stamped with its `import_batch_id`. A gap fill is 100% *updates* to records that already exist, so there is nothing to delete — and stamping a batch id on a building it merely edited would make undo **delete Ryan's real building**. The journal is what makes undo possible at all |
| `id` is `bigint generated always as identity`, **not** `bigserial` | The grants block gives `authenticated` SELECT on sequences but never USAGE, so a bigserial default fails with "permission denied for sequence" on every insert. `audit_log` already had it right |
| `old_value` / `new_value` are **NOT NULL** jsonb, with `'null'::jsonb` for empty | `to_jsonb(NULL::date)` is SQL NULL, not jsonb null. A nullable column would make "this field was blank before" indistinguishable from "nothing was recorded", and undo would silently skip every field the gap-filler had filled — the exact case it exists for |
| Values are extracted with `#>> '{}'`, never `::text` | `to_jsonb` of a uuid, date, text or enum is a *quoted* string, so `::text::uuid` carries the quotes into the cast and fails. `#>> '{}'` unwraps a jsonb scalar to bare text and is the one form that works for uuid, date, numeric, integer, boolean, text **and** the `health_score` enum |
| Comparison happens **after** casting to the column's own type | jsonb keeps numeric scale: `'2500'::jsonb <> '2500.00'::jsonb`. Comparing what JavaScript sent against what a `numeric(12,2)` column holds would report a change on every money field forever, and would make undo's "has this been edited since?" check fire on all of them |
| Dynamic SQL only ever sees an **allowlist** | `gap_fill_allows()` is a function, not a table, because reference data is admin-editable at `/admin/reference` and a security boundary must not be. `opportunities.stage_id`, `annual_value`, `profiles.role` and `deleted_at` are all deliberately absent |
| Undo **does not revert a field edited by hand since the commit** | Anyone can edit a building between the commit and the undo, and the batch filled a blank, so the later hand edit is almost certainly the more considered value. Those fields are left alone, counted, and reported |
| …and the report is stored on the batch | The list revalidates the instant the undo lands, the Undo button disappears with the batch's status, and the message would go with it. It is written to `import_batches.mapping` (jsonb, and a gap fill has no column mapping to keep) so it survives a refresh |
| One `UPDATE` per record, not one per field | The audit trigger writes a row per statement, so per-field would put ten audit rows on one building for one import |
| `fill_building_contract_value()` rather than two PostgREST calls | `set_building_monthly_value()` returns the **existing** period's id unchanged when the value has not moved — and the sheet exports current values, so a re-upload sends the same number straight back. Stamping that returned id would mean undo **deleted a real, pre-existing contract period**, dropping the building to $0 MRR forever with no screen to show it. This refuses unless the building has no period at all, and stamps in the same transaction |
| A building that already has a value is a **row error**, not a change | A price change and a typo are opposite in the revenue report and identical in a spreadsheet cell. The building form already has the correction checkbox; the importer sends you there rather than guessing |
| The value's effective date is the row's **contract start date**, else today | Backdating is what makes the MRR history real instead of a step in the month of the import. Contract start is editable in the same row, so filling it in is what unlocks this — and 26 of the 27 unpriced buildings have no start date, so the preview says per building whether the value will read as new business this month or reach back |
| A blank cell **never** clears a field | There is no way to empty a field through an import at all. That is what makes a half-filled re-upload safe, and it is why an unparseable cell has to be a hard **error** rather than a blank — `parseMoney` and friends return null for both, which is right for a messy spreadsheet and wrong here |
| Filling day-porter or weekend hours turns their **switch** on | `v_building_hours` gates those hours behind `day_porter` and `weekend_service`, so "8 hours a day" on a building whose flag is false reads as 8 and computes as 0. The flag is set as its own journalled change, so undo puts it back |
| Scope comes from the file's **first column header**, not a dropdown | This app wrote the sheet, so it can say what it is. A buildings sheet uploaded by mistake is an error rather than a zero-row success |
| The mapping step is **skipped** for a gap sheet | Offering to remap headers this app just wrote is friction with no upside and one more way to write a segment into an owner field |
| One `gap-fill` importer key with a `scope`, not four keys | `importer.tsx` already carries five parallel preview arrays and a five-case commit switch. Four more keys would have made it nine of each; one key with a scope is a single preview component for all four sheets |
| Overwrites are separated from fills in the preview | Filling a blank is always safe; replacing a value that was already there is the line worth reading twice, and it is where a stale download shows up. The obvious alternative — stamping the export and comparing — dies on contact with Excel, which reformats `2026-08-17` to `8/17/2026` on save and would flag every row |

Two latent bugs were fixed on the way past. **`previewImport` and `handleCommit` both ended in a
bare fall-through to the contacts importer**, so any unrecognised key imported as contacts —
`previewImport`'s was known, `handleCommit`'s was not, and adding a sixth key would have hit both.
Both are now exhaustive switches with a `never` assertion, so the *next* importer fails
`npm run typecheck` rather than at runtime. And **`rollbackImport` only checked the error on the
last of its five deletes**, so a failure part way through reported success and left a half-undone
batch; every step is checked now.

`db:verify` grew from 93 to **118 checks**, covering the type round trip through jsonb, the
hand-edit skip, one audit row per record, the allowlist refusing `stage_id` / `annual_value` /
`profiles.role` / `deleted_at`, the contract-value refusal, and that undo never deletes the record
itself.

Where things live:

| File | Job |
|---|---|
| `supabase/migrations/20260817090000_gap_fill.sql` | `import_field_changes`, `gap_fill_allows()`, `apply_gap_fill()`, `rollback_field_changes()`, `fill_building_contract_value()`, `v_gap_census` |
| `src/lib/gaps/index.ts` | `SCOPES`, `ID_HEADERS`, `fetchCensus()`, and the spreadsheet cell formatters |
| `src/lib/gaps/<scope>.ts` | One `fetchXGaps(supabase)` + `xGapColumns` per scope, the reports pattern exactly |
| `src/lib/gaps/scope.ts` | `fetchScope()` and `isGapScope()`, kept apart from `index.ts` to avoid an import cycle |
| `src/lib/import/fill.ts` | The four field specs, three-state parsing, lookup matching, and the proposal builder |
| `src/app/(app)/admin/import/blanks/[scope]/route.ts` | The download |
| `src/app/(app)/admin/import/gap-census.tsx` | The *Fill the gaps* section |

**Tested end to end against the real database** on 2026-08-17 under a temporary admin login
(`qa-phase5b@bealesllc.com`, now **deactivated, do not delete** — it holds the audit rows for the
test). Filled nine fields on one building and two on another, proved a blanked cell did **not**
clear an existing health score, proved a building that already had a value was refused, proved a
bad segment name was refused with the valid list, committed (MRR moved $47,148 → $51,648,
coverage 11 → 12 of 38), hand-edited a field, undid the batch, and confirmed the hand edit
survived while everything else reverted. Row counts before and after are **identical** on
accounts, buildings, contacts, opportunities, activities, contract periods, contact links and
building services; MRR is back to $47,148. The same round trip was repeated for open deals.

### The numbers the app currently reports, and what each one is missing

Measured 2026-08-13. Read this before believing any total on a screen.

| Number | Value | The gap |
|---|---|---|
| MRR | **$47,148** | Only **11 of 38** buildings have a contract period. 27 bill $0 forever |
| Accounts billing | 6 of 22 | The other 16 have no figure on any building |
| Open pipeline | $163,356 across 30 deals | Only **2 of 30** open deals carry a price |
| Win rate | **80%** (20 won, 5 lost) | 13 of the 25 closed deals have no close date |
| Activities | 667 logged | Only **293** are attached to an account; 374 float free |
| Health | 26 healthy / 8 needs attention / 2 at risk / **2 not scored** | Only 11 of the 38 carry revenue |

Every one of these gaps is printed on the screen next to the number it affects. That is
deliberate and load-bearing — see the Decision Log.

**The win rate is 80%, not the 92.3% recorded earlier in this file.** That figure came from tab 5
alone; tab 1 carried its own Closed Won and Closed Lost rows, so the CRM's denominator is 25
closed deals, not 13. Both numbers are right about their own scope. The CRM's is the one to quote.

**`property_type_id` is null on all 38 buildings** — segments never came across in the Active
Clients import. Revenue-by-segment is therefore unbuildable and was deliberately left out of the
six reports. Opportunities *do* carry it (21 of 25 closed deals), so the pipeline report's
sales-cycle-by-segment section works. Fixing this needs a re-import or a bulk edit.

**`entity` is `beales` on all 38 buildings.** The views all split by entity correctly, but no
screen offers an entity filter yet because it would be a one-row report. The day AFS gets its
first building, `/reports/revenue` already sums across entities rather than assuming one.

**A correction was made to real data this phase:** `91 Longwater Drive` was stored at
$30,000/month, which Ryan confirmed should be **$30,000/year = $2,500/month**. It was 40% of the
company's reported MRR. Fixed through the new correction path (see below), audited, and the
contract period count is unchanged at 11.

**Correction to earlier notes:** tab 4 *has* been imported (667 activities, batch committed
2026-08-12), and there is a **sixth profile — Brendan Mulligan** (`Brendan.Mulligan@bealesllc.com`,
leadership, no rate access, currently inactive). Earlier versions of this file said neither.

**A real finding about the spreadsheet, worth remembering:** `5 - Won-Lost Analysis` has its
summary row at **row 18**, and rows **19 and 20 sit below it** — two Ciminelli wins at $104,772
each, closed 2026-03-28. Every formula in that summary is hardcoded to `D5:D15`, so the sheet
excludes **$209,544 of won ARR** from its own TOTAL WON ARR, win rate and average days to close.
The real win rate is 12/13 (92.3%), not the 90.9% the sheet shows. The CRM counts all thirteen.
Do not reproduce those formula ranges anywhere.

**What works right now:** Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui. Login by
password or magic link, verified end to end — Ryan signed in and reached the dashboard
shell. All three migrations are applied to `beales-crm` (`pjcitahktwnawucoznhk`), and
`npm run db:check-remote` confirms against the live database that a stranger holding the
public key can read and write nothing.

**Accounts: ten profiles.** The five real people are active — Ryan, Jon, Robert Mulligan, Bob
Mulligan and Victor Melo. Brendan Mulligan is deactivated. Three QA logins —
`qa-phase5@`, `qa-phase5b@` and `qa-phase7@` — are **deactivated, do not delete**: they hold the
audit rows for the 91 Longwater Drive correction and for the Phase 5b and 7a testing, and removing
a profile would erase who made those changes.

The tenth is **`ingest@bealesllc.com`, "Nightly ingest"** — `role = field`, `sees_rates = false`,
**`is_active = true` and `is_service = true`**. It is active because `is_member()` requires it and
RLS refuses every write otherwise, which is precisely why it cannot be hidden by deactivating it
the way Brendan is. `is_service` is what hides it from every owner picker instead. Do not delete
it and do not deactivate it — deactivating it silently stops the nightly job writing anything.

**Deactivated people are not offered as owners.** The gap-fill sheets export whatever owner a
record currently has, but only the five *active* profiles can be matched on the way back in — so
Brendan and the two QA logins can never be assigned to anything new by an import.

**Live at `https://beales-crm.vercel.app`** since 2026-08-13, deployed from GitHub `main`. Two
environment variables are set on Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
and **`SUPABASE_SERVICE_ROLE_KEY` is deliberately not among them** — nothing under `src/` reads it
and it bypasses every RLS policy. Phase 7a adds `INGEST_USER_EMAIL`, `INGEST_USER_PASSWORD` and
`CRON_SECRET`, which *do* belong there; the reasoning for why those may go on Vercel and the
service role key may not is written out in `.env.local.example`, which is where this project keeps
its security arguments. `NEXT_PUBLIC_SITE_URL` is not set either: `siteUrl()` falls back
to Vercel's own `VERCEL_PROJECT_PRODUCTION_URL`, so magic links work without anyone typing a
domain. Set it only if a custom domain arrives.

Supabase Authentication → URL Configuration has the Vercel domain as Site URL and
`https://beales-crm.vercel.app/**` in Redirect URLs. Without that, password sign-in still works
but every magic link and password reset bounces.

**Migrations are never run by Vercel.** `npx supabase db push` from a laptop remains the only way
schema reaches the database — a deploy must not be able to change the shape of live data.

**What Phase 1a shipped:** accounts list (with MRR roll-up) and detail page with five tabs;
buildings list, detail with contract-value history, and form; contacts list, detail, and the
contact↔building link. TypeScript types are generated from the live database into
`src/lib/database.types.ts` — regenerate with `npx supabase gen types typescript --linked`
after any migration.

Tested end to end through the browser against the real database: created an account, a
building at $5,000/mo, raised it to $6,500 from a later date, and confirmed the old period
closed and a new one opened. All test records and the temporary QA login were deleted
afterwards; the database currently holds six profiles and no business data.

**Added after Phase 1a, at Ryan's request:** service types per building (Janitorial /
Maintenance / HVAC / Security, multi-select via `building_services`, because sites are often
two of them); contracted hours with weekly / monthly / annual totals from `v_building_hours`;
and employees assigned to buildings with a designation (`employee_assignments.role` —
day porter, night cleaner, lead cleaner, supervisor). There is now an Employees screen, and
an employee can be created and assigned in one step from a building page.

Ending an assignment sets `end_date` rather than deleting the row — an assignment that ended
plus one that began is exactly how the staff-movement report detects a move.

**Data note:** Ryan created `Fox Rock Properties` and its building `91 Longwater Drive`
by hand on 2026-08-12. They are real. Any cleanup script must not delete them.

**What Phase 1b shipped:** `/admin/import`, admin-only. Upload an .xlsx or .csv → the sheet
and column mapping are guessed and shown for correction → a preview lists every proposed
account and building with per-row warnings → confirm writes it → every batch can be undone.

Tested end to end against the real workbook: 37 buildings under 23 accounts, $44,648 of
monthly value, 1 totals row skipped, zero row errors. Undo restored the database exactly,
including leaving Ryan's pre-existing `Fox Rock Properties` account intact — the importer
*reused* it rather than creating it, so it never carried the batch stamp. **The real import
has not been run; Ryan does that when he is happy with the preview.**

How it works, if you need to change it:

| File | Job |
|---|---|
| `src/lib/import/workbook.ts` | Reads xlsx/csv into rows. Detects the header row by counting **distinct** values — a merged title banner reports the same string across every column and would otherwise win |
| `src/lib/import/definitions.ts` | What each importer needs, and the header fragments used to guess the mapping |
| `src/lib/import/parse-rows.ts` | Splitting client names, parsing addresses, money, dates, health, owners |
| `src/lib/import/active-clients.ts` | Row → proposed account/building/contact, with warnings |
| `src/lib/import/pipeline.ts` | Tab 1 → opportunities. Stage must match exactly; source merge map |
| `src/lib/import/won-lost.ts` | Tab 5 → close details on deals that already exist |
| `src/app/(app)/admin/import/actions.ts` | Parse, preview, commit, roll back |

Adding an importer touches five places, and three of them used to fail silently: the `ImporterKey`
union and `IMPORTERS` in `definitions.ts`; a branch in `previewImport` (its last branch is a
fall-through that ran the *contacts* builder for anything unrecognised); a `commitX` action; a
counter on `CommitResult`; and in `importer.tsx` the preview block plus `handleCommit` — now a
`switch` with a `default`, rather than the old ternary chain with the same fall-through. And
`rollbackImport` hardcodes its table list, so a new table must be added there or undo leaves
orphans.

Rules baked in, worth keeping: the original `Service Scope` text is always stored on the
building, so nothing the parser missed is lost; contract values go through
`set_building_monthly_value()` so revenue history is built properly; contacts dedupe on
lower-cased email; accounts match existing ones case-insensitively so a re-import extends
rather than duplicates.

Two things Ryan will want to fix in the preview: the em-dash split reads
`Cancer Center — Dana-Farber / Brigham` as account "Cancer Center", and the several South
Shore Health entities arrive as separate accounts. Both are one rename each in the merge step.

The building form's monthly value calls `set_building_monthly_value()`; never write to
`building_contract_periods` directly.

**What Phase 3 shipped.** `/opportunities` is a board (drag by the ⠿ grip, `@dnd-kit/core`) and a
table, toggled by `?view=`. Under `md` the board becomes a grouped list with a stage dropdown per
card — eight columns on a phone is not a board. `/opportunities/[id]` has Overview / Stage history
/ Activity; `/reports/pipeline` is the funnel, win rate, sales cycle by segment, loss and win
reasons ranked, and a competitor tally, all drawn as CSS bars rather than a chart library.
`/admin/reference` lets an admin edit stages, probabilities, loss reasons, win reasons, lead
sources and competitors without a migration.

Two migrations: `20260813120000_pipeline.sql` and `20260813140000_outcome_view_tidy.sql`.

| Thing | Why it is the way it is |
|---|---|
| `opportunities.opened_on`, **nullable** | The sales cycle needs a start date and `created_at` is not it — every imported deal is created in the same second, so measuring from it reports a zero-day cycle for all 64 historical deals, silently. Tab 5 gives a real answer (close date − days to close); tab 1 has no start date at all, so it stays null and the report counts those separately |
| `win_reasons` ships **empty** | "Tipped the win" has to be rankable, so it is a lookup table — but the sheet's values are compound phrases, not categories. The Won/Loss importer offers the distinct phrases in the preview for Ryan to tick, rename and merge. Never seed this from imagination |
| `stamp_opportunity_close_date()` is a **BEFORE** trigger | An AFTER trigger cannot assign to `NEW`, so it would need a second UPDATE — a second audit row for one drag of one card. It never overwrites a close date that is already there, so an imported deal keeps its real date |
| Reopening a **converted** deal raises | Otherwise a live billing building sits under a deal that says it never closed. Unlink the building first |
| `convert_opportunity_to_building()` is a DB function | Supabase gives the app no transaction. Four PostgREST calls means a failure between "create building" and "set value" leaves a building with no contract period — $0 MRR forever, with no screen to show it. The account *decision* still happens in TypeScript and is shown before anything is written |
| Loss reason is **not** enforced by the database | The drag sets the stage before the dialog can collect anything, so a NOT NULL rule would make the drag itself fail. It is a UI prompt, and the deal still moves if you dismiss it |
| Competitors stay writable by **everyone** | A design pass argued for admin-only. Someone closing a deal lost has to name who beat them there and then, not wait for an admin |
| `v_opportunity_outcomes` hides the other side | A deal that went lost then won kept its loss reason — deliberate, since clearing reasons on a stage change destroys context. The columns keep it; the reporting view shows loss fields only on a loss and win fields only on a win |

The two new importers follow the existing framework — `src/lib/import/pipeline.ts` and
`src/lib/import/won-lost.ts`. Worth knowing:

- The real tab names are `1 - Pipeline` and `5 - Won-Lost Analysis` — spaced hyphens, not slashes.
- **Stage is a row error, not a guess.** `stage_id` is NOT NULL and there is no safe default;
  parking an unrecognised deal in Targeting would quietly change the pipeline.
- Source merges Ryan confirmed: `Direct` and `Cold Outreach` → Direct Outreach; every CBRE/Tufts
  variant → CBRE Referral; both inbound RFP rows → Inbound RFP. Unmatched leaves it **null**,
  never `Other`.
- The four annual-only rows are **one-off project work**: no monthly value, flagged in the preview,
  original figure kept in the notes. Never divided by twelve.
- Tab 5 **enriches**: it matches on company name and updates the deal tab 1 already created. Only
  an unmatched row inserts. **Undo therefore removes only the rows it created** — a deal it merely
  filled in was never batch-stamped, so it keeps its close details. The preview says so.
- `Days In Stage` and `Days Since Activity` both point at the same cell in the sheet, so they have
  always computed the same number. Ignored; `opportunity_stage_events` makes it real from now on.

Rehearsed against the real workbook: 51 deals at $89,062/mo, 9 matched to an account, 4 project
rows, zero errors; then tab 5 updated 9 and created 4, skipping the summary row. Both rolled back,
and the database was verified row-for-row identical to how it started.

**What Phase 5 shipped.** `/dashboard` has a personal section — *[name]'s top focus* and *Next
follow-up* — above the company numbers, which mirror tab 0: six tiles, pipeline by stage, client
health with the traffic-light dots. `/reports` is an index over six reports: pipeline (extended),
revenue, account expansion, losses, client health, activity coverage. Every report exports to CSV.

### Reconciling the dashboard against `0-Dashboard` (screenshot read 2026-08-13)

The tab was finally seen this session. **Two of its tables are entirely broken** — `PIPELINE BY
STAGE` and `CLIENT HEALTH SUMMARY` show 0 in every count and $0 in every value, despite 51 deals
and 38 clients in the tabs. The stage table is also missing `Hot Lead` and `RFP Response`
altogether, so those deals would vanish even once the formulas were fixed. The CRM's versions of
both work. Do not port those formulas.

| Tile | Sheet | CRM | Why |
|---|---|---|---|
| Active Clients | 38 | 38 | Exact match. Counts **buildings**, confirmed by Ryan |
| Pipeline Deals | 51 | 30 | Sheet counts every row in tab 1 including 16 won and 5 lost. **Ryan chose open-only** |
| Monthly ARR | $44,648 | $47,148 | The CRM adds 91 Longwater Drive at $2,500, which the sheet never had. "Monthly ARR" means MRR |
| Pipeline Value | $89,062 | $163,356 | Sheet is **monthly across all 51 deals**, including lost ones. **Ryan chose annual, open-only** |
| Contacts | 95 | 97 | All 97 came from the import, none by hand — the sheet's formula appears to miss two rows |
| Win Rate | 86% | 80% | **Unreconciled.** Tab 1 alone gives 76.2%, all deals 80%, Won/Lost 92.3%, its broken `D5:D15` summary 90.9%. None is 86%. Likely stale, given the two tables under it are dead. The H5 formula was never supplied |

Rows 18–25 of the tab are a daily briefing (Activities Logged, Client Matches, Meetings Today,
Pipeline Updates, Top Focus, Next Follow-Up). Ryan's decision: **the dashboard is per user, and
should show top focus and next follow-up per user.** Meetings Today and Client Matches are fed by
Granola and calendar automation and wait for Phase 7.

Two migrations: `20260814090000_reporting_views.sql` and `20260814090100_clear_imported_close_dates.sql`.

| Thing | Why it is the way it is |
|---|---|
| Six new views: `v_mrr_by_month`, `v_mrr_coverage`, `v_account_mrr_change`, `v_building_health_mrr`, `v_opportunity_win_rate`, `v_pipeline_coverage` | Three gaps made a dashboard impossible without them. `health_score` appeared in **no** view, though tab 0 summarises the portfolio by it. There was no company-wide MRR-per-month row — `v_mrr_waterfall` splits by `entity`, so every caller had to remember to `sum()`. And win rate lived only as a line of TypeScript in the pipeline report, which the dashboard would have had to duplicate |
| `v_mrr_coverage` counts buildings from `buildings`, **not** from the MRR views | `v_building_mrr_by_month` inner-joins its contract periods, so a building with no contract vanishes from it silently — and that building is exactly what the view exists to count. Reading the denominator from the numerator's source would always report 100% coverage |
| `v_building_current_value` was widened, not replaced | Added `name`, `health_score`, `property_type_id`, `owner_id`, `square_footage`, `contract_end_date`. Purely additive; both existing callers select named columns |
| `correct_open_contract_value()` exists beside `set_building_monthly_value()` | A price change and a typo look identical in a form field and mean opposite things in the revenue report. Correcting $30,000 to $2,500 through `set_building_monthly_value()` would have recorded a **$27,500 contraction that never happened**, with no screen anywhere to take it back. This amends the open period in place and writes no history. The building form has a "this is a correction" checkbox that routes to it |
| 13 close dates were **nulled**, not filtered | `stamp_opportunity_close_date()` stamps `current_date` on entering a won/lost stage — right for a drag, wrong for an import of 25 already-closed deals. Tab 1 carried no close date for its Closed Won rows, so all 13 read 2026-08-13. Fixed in the data rather than in six report queries, because the date was equally wrong on each deal's own detail page. Matched on the batch's own creation date, never a date literal, so it is reproducible and a no-op on a fresh database |
| Every understated total says so, in the tile | Most of the portfolio has no contract figure and 28 of 30 open deals have no price. This team has never used a CRM; a number they later discover was wrong costs more trust than a number that admitted its own gap up front. `Coverage` in `report.tsx` is the shared version of that note |
| Still no Recharts | Reaffirmed. The one genuine time series — 27 months of MRR — is `MonthBars`, flex columns with percentage heights. A charting library would have been ~100kb and then needed overriding to match the hairline design |
| `Bar` and `Stat` moved to `src/components/report.tsx` | They were local to the pipeline report and are now used by six pages plus the dashboard. Lifted verbatim, including the comment explaining why they are divs |
| The grant gap was closed | `20260812180000` ends with `grant select … on all tables`, which is a **snapshot, not a rule**. Six objects created by later migrations — `v_building_hours`, `v_building_scheduled_hours`, `v_pipeline_funnel`, `v_opportunity_stage_durations`, `win_reasons`, and `v_opportunity_outcomes` (dropped and recreated in `20260813140000`) — were never granted to `authenticated`. Hosted Supabase masks this with its own default privileges so nothing was broken, but a schema rebuilt anywhere else would have failed on exactly the views the reports read. Now re-granted, plus `alter default privileges` so it stops recurring, plus an assertion in `db:verify` that would have caught it |

Where things live:

| File | Job |
|---|---|
| `src/components/report.tsx` | `Bar`, `Stat`, `BarRow`, `MonthBars`, `Coverage`, `Delta`, `rank()`, `ExportLink` |
| `src/lib/reports/<name>.ts` | One `fetchX(supabase)` per report, plus its CSV `Column[]`. **The page and its export route both call it** — that is the only reliable way to stop a CSV disagreeing with the screen it came from |
| `src/lib/reports/my-focus.ts` | The per-user half of the dashboard. Reads `owner_id` **and** `secondary_owner_id` on opportunities and accounts |
| `src/lib/csv.ts` | `toCsv()` with RFC-4180 quoting, `csvResponse()`, `csvFilename()`. Numbers stay raw so Excel can sum a column; a UTF-8 BOM so em-dashes survive |
| `src/app/(app)/reports/<name>/export/route.ts` | Nine lines each: fetch, `toCsv`, `csvResponse` |

The nav entry for Reports is now `/reports`, not `/reports/pipeline` — active-state matching is
prefix-based, so every report except pipeline would otherwise have left the sidebar item unlit.
`FULL_WIDTH` is untouched: every report is a narrow document.

`db:verify` grew from 71 to 93 checks. The revenue block previously asserted new business and
expansion but **never asserted contraction or churn at all** — the two columns the revenue report
is built on had no test behind them. It now covers a churn sequence, a contraction, that a
correction writes no new history and invents no new movement month, that the win-rate view agrees
with counting the outcomes by hand, and that `authenticated` can select every view.

One behaviour worth knowing: **closing a contract today does not show as churn until next month.**
The MRR series runs to `date_trunc('month', now())` and a building whose `end_date` is today still
bills the current month, so the churn lands in the month after. The verify script tests churn with
a contract that ended three months ago for exactly this reason.

### How to work in this repo

| Command | What it does |
|---|---|
| `npm run dev` | Local app on http://localhost:3000 |
| `npm run db:verify` | Runs every migration + `seed.sql` against a throwaway in-memory Postgres and asserts RLS, triggers, revenue views and pay-rate access all behave. **Run this after any schema change** — no Docker needed |
| `npm run user:create -- --email … --name … --role …` | Creates one of the five accounts. Only place the service role key is used |
| `npm run lint` / `npm run typecheck` / `npm run build` | The usual checks |
| `npx supabase db push` | Applies migrations to the real Supabase project. **Every migration including `20260818090000_ingest.sql` is already applied** — this is a no-op until a new one is written |
| `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/ingest` | Runs the nightly job by hand. Returns a JSON summary; without the header it must return **401**, not a redirect |
| `git push origin main` | **Deploys.** Vercel builds from `main`, so a push is a release |

`.claude/launch.json` tells Claude Code how to start the dev server (`npm run dev`, port 3000).
Committed on purpose so a future session can run the app without being asked.

`npm run build` is pinned to `--webpack`; see the gotcha below before changing it. Always verify a
build with `rm -rf .next` first — a warm cache hides the one failure mode that matters.

Note: `next dev` appends an auto-generated block to the bottom of this file. Leave it committed.

### The look and feel

**Brand colours from `BealesLLC_BrandGuide.docx`** (kept in git-ignored `private-data/`).
The layout idiom is Notion-like — calm, document-shaped, hairline dividers — but every colour
is the brand's.

| Token | Hex | Where it goes |
|---|---|---|
| Navy | `#1B3A6B` | Headings, primary buttons, borders, breadcrumbs |
| Gold | `#F5B731` | Accent only — active-section marker, badge fills. **Never text** |
| Deep gold | `#D4892A` | Secondary accents, the logo gradient |
| Charcoal | `#2D2D2D` | Body text |
| Light blue | `#E8F0FA` | Sidebar, section backgrounds, card fills |
| White | `#FFFFFF` | Page background |

Available as `--brand-navy`, `--brand-gold`, `--brand-deep-gold`, `--brand-light-blue`, and
as Tailwind classes (`bg-brand-gold`). Semantic tokens (`--primary`, `--foreground`,
`--sidebar`…) already map onto them, so use those first.

**Gold can never carry text.** It is 1.9:1 on white, which fails every accessibility bar. Use
it as a fill with navy on top (6.2:1), or as a solid indicator. Deep gold at 3.2:1 is large
text and borders only. Measured in the browser: body 13.8:1, titles and buttons 11.3:1,
sidebar links 9.8:1 — all comfortably past WCAG AA.

Other rules:

| | |
|---|---|
| Borders | `rgba(27,58,107,0.12)`. Hairlines between rows, not boxes around them |
| Hover | `rgba(27,58,107,0.055)`, 20ms. Use the `.row-hover` class |
| Radius | 3px everywhere (`--radius`) |
| Headings | Montserrat (brand), navy, via `--font-heading` |
| Body | Arial first, then the system stack — both named in the guide, and Arial is already on every device so body copy paints on the first frame |
| Page titles | 40px bold, `.page-title` |
| Inputs | Filled, no border. The block is the affordance; the ring appears only on keyboard focus |
| Buttons | Small (h-7). Navy with white text is the one primary action per page; everything else is quiet |
| Layout | Fixed 240px sidebar, content in a 4xl column. Sidebar becomes a drawer under `md`. **One exception:** routes listed in `FULL_WIDTH` in `app-shell.tsx` get the whole screen — currently only `/opportunities`, because eight kanban columns inside a 896px column showed three of them. Exact matches only, so deal detail pages stay narrow. Keep the list short: long lines of body text are hard to read, which is why the column exists |
| Logo | `public/beales-logo.png`, the official transparent file. Guide minimum is 150px wide for digital — it runs at 150px in the sidebar and 190px on login. Do not recolour, stretch, or crowd it |

Two deliberate departures from the guide, both for legibility at screen density:

- The guide nominates **deep gold for hovers**. A gold wash across a dense list is loud and
  hurts readability, so row hover is a light navy tint — light blue is the guide's own choice
  for section fills.
- **Dark mode is an extrapolation.** The guide covers light backgrounds only. Dark mode uses a
  deep navy ground with gold as the accent. Nothing there overrides a stated rule.

`.brand-gradient` is the logo's oval gradient from the guide, used sparingly (currently the
rule under the login title).

Shared building blocks live in `src/components/page-header.tsx`: `PageHeader` (breadcrumbs +
title + actions), `RowList` / `Row` for lists, `Property` for key/value lines, `SectionTitle`,
and `EmptyState`. Use them rather than hand-rolling markup, or the screens drift apart.

Dropdowns are plain `<select>` (`Select` in `src/components/form-field.tsx`) on purpose: on a
phone that opens the native iOS picker, which beats any custom menu when someone is standing
in a car park.

### Gotchas already paid for

**Naming a foreign key in a PostgREST embed.** `contacts` and `accounts` are joined *twice* — `contacts.account_id` and `accounts.primary_contact_id` — so `select('*, account:accounts(...)')` fails with "more than one relationship was found". Write `accounts!contacts_account_id_fkey(...)`. The same applies wherever two tables have two FKs (buildings↔profiles via `owner_id` and `secondary_owner_id`).

**Query errors must not become 404s.** Detail pages check `error` separately from a missing row and throw, because the ambiguous-embed bug above showed up as a bare "page not found" and cost real time. There is an `error.tsx` boundary that prints the message.

**A user cannot be hard-deleted once they have changed anything.** `audit_log.changed_by` references `profiles`, deliberately — deleting the person would erase who did what. **Deactivate instead**: `npm run user:create -- --email … --name … --inactive`. That blocks sign-in and hides all data from them, while their name still shows on records they owned.

**`next build` is pinned to `--webpack`, and must stay that way for now.** Turbopack in Next
16.3.0 downloads the Google Fonts CSS for the `Montserrat` import in `src/app/layout.tsx` and
then cannot resolve the font files that CSS references, so a **cold** production build dies with
`Can't resolve '@vercel/turbopack-next/internal/font/google/font'`. A warm `.next` hides it
completely — which is exactly why it went unnoticed until the first clean build, and why it would
have failed on Vercel (whose builds are always cold) while passing locally. 16.3.0 is the newest
stable; there is no released fix. `next dev` still uses Turbopack and is unaffected.

The durable fix is to **self-host the two Montserrat weights with `next/font/local`**, which also
takes Google off the build path entirely. Do that before removing the `--webpack` flag, and
verify with `rm -rf .next && npm run build`, never with a warm cache.

**This project lives in `~/Desktop`, which is synced to iCloud Drive — and it is now corrupting
`node_modules`, not just build output.** It began as conflict copies (`routes.d 2.ts`) inside
`.next/`, fixed with `rm -rf .next`.

**It corrupted `node_modules` twice in the single session of 2026-08-13**, in two different ways:

1. Conflict copies (`node_modules/next/font/local/index 2.js`) **and `node_modules/@vercel/`
   deleted outright** — which surfaced as the Turbopack font error above and sent the session
   chasing the wrong cause entirely.
2. An hour later, `node_modules/glob/` silently lost `common.js` while everything else stayed —
   a package present, importable, and missing an internal file. The build died with
   `Can't resolve './common.js'` from inside a dependency nobody had touched.

The npm cache at `~/.npm/_cacache` is damaged too (`EACCES` / "File exists"), so a reinstall needs
its own cache directory:

```bash
rm -rf node_modules && npm ci --cache /tmp/npm-cache
```

**Move the project out of `~/Desktop` and `~/Documents`.** This is no longer a nuisance. It breaks
builds in ways that look exactly like code bugs, in dependencies nobody edited, at random. Both
incidents cost real time. When anything fails inexplicably — especially "cannot resolve" inside
`node_modules` — suspect this **first**:

```bash
find node_modules -maxdepth 4 -name "* 2*" | head
```

That finds conflict copies but **not** the missing-file case, which has no cheap check. If the
error names a file inside `node_modules`, just reinstall before debugging anything.

None of this affects Vercel, which installs fresh from `package-lock.json` every build. A local
build failure that Vercel does not share is almost certainly this.

---

## Non-goals

- No public signup, marketing site, billing, or subscriptions. Internal tool, five users.
- No native mobile app. Responsive web; installable PWA is fine.
- No inspection or work-order creation — InspectQA owns that.
- No invoicing or accounting — QuickBooks owns that. Contract and project values here are for reporting only.
- No multi-tenant architecture. One company. (But keep the `entity` field on buildings.)

---

## Open questions

**Blocking Phase 1a:**
- [x] ~~Confirm the third person with pay-rate access~~ — **Robert Mulligan** (`rmulligan@`), confirmed 2026-08-12.
- [x] ~~Supabase project~~ — `beales-crm` / `pjcitahktwnawucoznhk`, migrations applied, `.env.local` filled in.
- [x] ~~Private GitHub repo~~ — created.
- [x] ~~Login email addresses for the other four~~ — captured in the roster above.
- [ ] Confirm Victor Melo's address. Ryan wrote `vmelo@beales..com`, which is a typo; assumed `vmelo@bealesllc.com`.
- [ ] Nobody knows their password except Ryan. The other four have never signed in. Passwords are
      hashed and unrecoverable, so onboarding them means either the magic link or
      `npm run user:create … --password`. Worth deciding before inviting them.
- [ ] Bob Mulligan's legal first name, for the Phase 7 payroll parser — Paychex will say "Robert" or similar where the team says "Bob", and there is already another Robert Mulligan to tell him apart from.
- [x] ~~Vercel project~~ — live at `https://beales-crm.vercel.app`, 2026-08-13. Ryan signed in and
      reached the dashboard.

**Blocking Phase 1b (the import):**
- [ ] Exact column headers of `2-Active Clients` and `3-Contact Directory`, or a CSV export of both.
- [ ] Are the sheet's contract values monthly or annual, and do they include project/extra work or only the recurring contract?
- [ ] Building statuses beyond pending / active / lost — on hold, seasonal, month-to-month?
- [ ] Does a building ever move between Beale's LLC and AFS? If so, `entity` needs dating the way contract value is.
- [x] ~~Can one building ever be billed to two accounts?~~ — **Yes, and it is not an edge
      case.** Confirmed by Ryan 2026-08-18. Beale's sells to the landlord *and* to that
      landlord's tenants at the same address: Fox Rock owns 90 Libbey Pkwy and has a day
      porter + night cleaning contract, while South Shore Health's Wound Center is a
      tenant in the same building with its own contract. Same shape at 101 Columbian St,
      which South Shore Health owns with Dana-Farber / Brigham as tenants. Answered with
      the `sites` table — see the Decision Log.

**Opened by Phase 5, and now Ryan's to fill in rather than anyone's to build:**

Phase 5b built the tool for every one of these. They are data entry now, not code — download the
sheet at the top of `/admin/import`, fill it in, upload it back.

- [x] ~~**`property_type_id` is null on all 38 buildings**~~ — the buildings sheet carries a
      Segment column and the eleven valid names are listed in the error if one does not match.
      Still needs doing; revenue-by-segment can be built once it is.
- [x] ~~**27 of 38 buildings have no contract figure**~~ — the buildings sheet takes a monthly
      value *and* a contract start date, and backdates the MRR history to it.
- [x] ~~Only 2 of 30 open deals carry a price~~ / ~~**expected close dates are stale on 28 of
      30**~~ — both on the open deals sheet, along with `opened_on`, which is null on all 30 and
      is what makes a sales cycle measurable.
- [x] ~~**Only Ryan and Robert own anything**~~ — buildings, deals and accounts all carry an Owner
      column, matched against the five active people by full name. Assign Jon, Bob and Victor
      something before inviting them, or their first impression is three empty panels.
- [x] ~~**374 of the 667 activities are attached to nothing**~~ — **113 of them are now one click
      away.** Phase 7a's relink keys the workbook back to each activity on `(subject, occurred_at)`
      and matches the Company cell against **deal names**, not account names — which is what they
      turn out to be. Upload `Beales_CRM.xlsx` at `/admin/ingest`, then apply on `/review`.
      Measured, not estimated: 0 of the 374 resolve to an account, 113 resolve to exactly one deal.
      **The remaining 261 are still open** and are genuinely a person's job — vendors, variant
      spellings, and rows filed as `Internal` or `General / Unmatched`.
- [ ] The `WIN RATE` formula in cell H5 of `0-Dashboard` — its 86% matches none of the four
      denominators the data supports. Needed to close the last reconciliation gap.
- [x] ~~The rest of the daily briefing (Meetings Today, Client Matches)~~ — built in 7a as one
      query, `fetchTodaysMeetings()`, rendered as the *Today* strip on the dashboard. It stays
      hidden until there is something in it. **It fills up when 7b has calendar credentials.**

**Review when convenient:**
- [x] ~~`lead_sources` placeholders~~ — replaced 2026-08-13 with the eight real sources from the Source column. The five placeholders are **deactivated, not deleted**, because `lead_source_id` has no ON DELETE.
- [ ] `loss_reasons` are still mostly placeholders — `Lost to competitor` was added (the only loss with evidence) and `Other` pushed last, but the middle of the list is invented. Ryan can now fix it himself in `/admin/reference`.
- [ ] `win_reasons` is empty by design. It fills up the first time the Won/Loss tab is imported for real and Ryan ticks the phrases he wants ranked.
- [ ] Phase 2 decision: offline outbox for unsent activities (IndexedDB). Conflicts with the "no localStorage" rule; argued for in the Decision Log.

**Later phases:**
- [x] ~~Deal stage names and probabilities~~ — all eight confirmed by Ryan 2026-08-13. `Hot Lead` 10% and `RFP Response` 50%, previously interpolated guesses, are the values he wants. They are editable in `/admin/reference`, so a change is data, not a migration.
- [x] ~~`0-Dashboard` formulas or screenshot~~ — the dashboard was built 2026-08-13 to the structure
      already recorded in this file (six tiles, pipeline-by-stage, health summary), which Ryan
      confirmed. **The screenshot is still worth having** to check the exact tile definitions
      before the other four people see it, but it is no longer blocking.
- [ ] Sender email addresses for the weekly payroll emails, plus 3–4 real samples before the parser is written — now Phase 8.
- [ ] InspectQA read-only credentials for `beales-inspections` (`illxdfvqvuwoqwbplgiy`) — now Phase 8. The project is identified; the credentials are not yet issued.

**Blocking Phase 7b (Microsoft Graph):**
- [ ] The Entra app registration — client id, tenant id, client secret. Needs tenant-admin rights, which sit with the IT team.
- [ ] Admin consent granted for `Mail.Read` and `Calendars.Read` **application** permissions.
- [ ] The `crm-ingest@bealesllc.com` mail-enabled security group and the `New-ApplicationAccessPolicy` command, or the app can read every mailbox in the tenant. `Test-ApplicationAccessPolicy` must return Granted for Ryan and Denied for anyone else.
- [ ] **3–4 real samples** — one inbound client email, one outbound, one calendar event with external attendees, one Granola note. No parser gets written before these arrive.
- [ ] The Vercel environment variables, and Fluid Compute confirmed on.
- [ ] Whether the other four should be added to the ingest group, and whether they know their client mail would be logged. Ryan chose to start with his mailbox alone; widening it is a group membership change and no code.

**Opened by Phase 7a:**
- [ ] `account_domains` is **empty**. The middle confidence tier does nothing until it is filled, and `/admin/ingest` already offers twelve real candidates derived from existing contacts (ciminelli.com, bsci.com, foxrockproperties.com, bidmc.harvard.edu, medtronic.com, rmrgroup.com, and so on). One click each.
- [ ] The 261 orphan activities the relink could not place. Worth a look at the "what still matches nothing" list before deciding whether they are worth hand-linking at all.
- [ ] **7d, the extraction layer, is the one slice that could be dropped without harming the rest.** Ryan asked for written commitments as next steps; the honest expectation is roughly a 50% dismissal rate, and it is the only part of this phase where a language model writes anything. It ships last, on purpose, so the review screen has real use behind it first.
- [ ] Retire `kbqivepqykccdyexgnhu` — rename now, delete once it has sat unused for a couple of weeks.

## Decision log

| Date | Decision | Why |
|---|---|---|
| — | Separate Supabase project from InspectQA | Spinout separability + protecting a live client-facing app from CRM migrations |
| — | Building-level contract and rate data, accounts as a rollup | Correct revenue reporting; can lose a building without losing the account |
| — | Accounts + activity logging before pipeline | Activity logging is the habit everything downstream depends on |
| 2026-08-12 | **Contract value is a history table, not a column.** `building_contract_periods` holds effective/end dates per value; `buildings` has no monthly value at all. The UI still shows one "Monthly value" field and calls `set_building_monthly_value()` behind it | A single column cannot answer "what was MRR in March", which makes the revenue growth waterfall (new / expansion / contraction / churn) unbuildable. Ryan has only today's values, so history starts at go-live and accrues forward |
| 2026-08-12 | Churn comes from a contract period ending, never from `buildings.status = 'lost'` | A building marked lost with no period end would keep billing forever in the reports |
| 2026-08-12 | Deal stages, property types, loss reasons, lead sources are **tables, not Postgres enums** | Admins must rename them without a migration, and the stage names are explicitly unsettled. Enums are reserved for values the app code branches on |
| 2026-08-12 | **Pay/bill rates live in separate tables** (`employee_compensation`, `employee_assignment_rates`) rather than as columns on employees/assignments | Rate visibility is Ryan, Jon and Robert Mulligan only. Postgres RLS filters rows, not columns, so hiding a column means moving it to its own table. Everyone can still see who works where and for how many hours |
| 2026-08-12 | Activities carry five nullable FKs, and a trigger stamps `account_id` from the building / opportunity / contact | A complaint logged against a building must appear on the account timeline in one indexed query, with no joins at read time |
| 2026-08-12 | Audit triggers are on from day one, though the audit UI is Phase 6 | History cannot be backfilled. The trigger ignores `updated_at` so no-op saves don't fill the log with noise |
| 2026-08-12 | Every importer-created row carries `import_batch_id` | Ryan will re-import several times. Undoing a bad import is one delete, not hand-cleaning the portfolio |
| 2026-08-12 | Schema is verified with PGlite (`npm run db:verify`), not Docker | No Docker on this machine, and 700 lines of SQL should not reach a real database unverified. It caught two real bugs: the audit trigger assumed every table has an `id` column, and the MRR waterfall invented a phantom churn month one month in the future |
| 2026-08-12 | Login is password-primary with magic link as the forgot-password path | Ryan's choice. Field staff may not have easy email access, but nobody should be locked out |
| 2026-08-12 | Phase 1 split into 1a (schema + CRUD) and 1b (importer + migration) | Ryan sees working screens sooner; the importer is the bigger, fiddlier half |
| 2026-08-12 | `middleware.ts` → `proxy.ts` | Next 16 deprecated the middleware filename and prints a codemod notice. Greenfield project, so take the new name now |
| 2026-08-12 | **InspectQA is `illxdfvqvuwoqwbplgiy` (`beales-inspections`), not `kbqivepqykccdyexgnhu`** | The original ref in this file was wrong and pointed at an abandoned project. Verified in the table editor: `beales-inspections` holds the inspection tables and is flagged PRODUCTION. Getting this wrong at Phase 7 would mean aiming a sync job at a live client system. Always verify by ref |
| 2026-08-12 | `kbqivepqykccdyexgnhu` ("CRM - Beales and AFS") is a dead earlier attempt, to be retired | Ryan confirmed it is not live. Renaming it out of the way first, deleting once it has sat unused — a Supabase project delete is permanent |
| 2026-08-13 | **`opened_on` is a nullable column, not derived from `created_at`** | Every deal imported from the spreadsheet is created within the same second, so a sales cycle measured from `created_at` reads zero days for all 64 historical deals — wrong, and wrong with no error. Null where the sheet genuinely does not say, and the report counts the unmeasurable ones out loud rather than averaging a lie |
| 2026-08-13 | `win_reasons` is a lookup table that **ships empty**, with `win_notes` beside it | "Tipped the win" has to be rankable next to the loss reasons, and free text cannot be grouped. But the sheet's ten values are compound phrases, not categories, so seeding a list would repeat the placeholder mistake this phase cleaned up. The importer offers the real phrases for Ryan to curate in the preview |
| 2026-08-13 | Closing a deal stamps `actual_close_date` from a **BEFORE** trigger, separate from the stage-event trigger | An AFTER trigger cannot assign to `NEW`, so it needs a second UPDATE, which writes a second audit row for one drag. Keeping it separate also stops the `security definer` stage-event function growing a second job |
| 2026-08-13 | Reopening a deal clears its close date, but **raises** if the deal was already converted | Silently clearing it would leave a live, billing building underneath a deal that says it never closed. Loss and win reasons are deliberately *not* cleared: tidy-looking, and it throws away context on a mis-drag |
| 2026-08-13 | `convert_opportunity_to_building()` lives in Postgres; the account match lives in TypeScript | Supabase gives the app no transaction, and a failure between creating the building and setting its value leaves a building with no contract period — invisible, and $0 MRR forever. Matching a name to an account is a guess, and a guess belongs where a person sees it first |
| 2026-08-13 | A required loss reason is a **UI rule, not a constraint** | The drag sets the stage before any dialog can collect a reason, so a database rule would make the drag itself fail. Required fields are the enemy; the deal moves either way |
| 2026-08-13 | Competitors stay writable by every member, unlike the other reference data | Reviewed and rejected making them admin-only. Someone closing a deal lost has to name who beat them at that moment, not raise it with an admin — and that is exactly the moment the information exists |
| 2026-08-13 | Charts are CSS bars; no Recharts | Every chart in the pipeline report is a ranked horizontal bar. A ~100kb dependency that then needs overriding to match the hairline design earns nothing. Revisit only if Phase 5 needs a real time series |
| 2026-08-13 | `@dnd-kit/core` for the board, with a `md` breakpoint that drops it entirely | It is the only option that works with mouse, touch **and** keyboard. But eight columns on a phone is a horizontal scroll with one card visible, so below `md` the same deals render as a grouped list with a stage dropdown — which is faster than dragging anyway |
| 2026-08-13 | `DndContext` carries a fixed `id` | dnd-kit numbers its generated `aria-describedby` from a counter that restarts on the client, so it never matched the server and React reported a hydration failure on every load of the board |
| 2026-08-13 | **Every understated total states its own coverage, on the tile, in the same block as the number** | Most of the portfolio has no contract figure and 28 of 30 open deals have no price, so nearly every total in this app is smaller than the truth. The adoption bar governs: this team has never used a CRM, and a number they later discover was wrong costs far more trust than a number that admitted its gap the first time they read it. "A number nobody trusts is worse than no number" is the rule this implements |
| 2026-08-13 | **`correct_open_contract_value()` sits beside `set_building_monthly_value()`**, with a checkbox on the building form to choose | A price change and a typo are indistinguishable in a form field and opposite in the revenue report. Correcting the $30,000 figure on 91 Longwater Drive through the normal path would have recorded a $27,500 contraction that never happened, permanently, with no screen to undo it. The correction amends the open period in place and writes no history at all. It restates the movement it belongs to — correcting 2000 to 2500 means an earlier drop from 3000 was always 500, never 1000 — which is the point, not a side effect |
| 2026-08-13 | **The 13 import-stamped close dates were nulled in the data, not filtered in the reports** | `stamp_opportunity_close_date()` correctly stamps `current_date` when someone drags a card, and wrongly stamped it on 13 already-closed deals that tab 1 carried no date for. Filtering in six report queries would have left the same wrong date on each deal's own detail page. Once null, `closed_month` and `days_to_close` are null too and every report excludes them for free, while `v_opportunity_win_rate.closed_without_date` keeps the gap visible. Matched on the batch's own creation date, never a literal |
| 2026-08-13 | Win rate is a **view**, not a line of TypeScript | It was computed in the pipeline report; the dashboard needed the same number. Two implementations of one number eventually disagree, and the one place that must never happen is the figure the owners quote to each other |
| 2026-08-13 | `v_mrr_coverage` counts its denominator from `buildings`, not from the MRR views | `v_building_mrr_by_month` inner-joins contract periods, so a building with no contract silently disappears — and that is exactly the building being counted. Reading both halves from the same source would have reported 100% coverage, always, and looked correct |
| 2026-08-13 | Revenue growth leads with **MRR over time**, and the waterfall's four columns sit in a table beneath it that says when three of them are structurally zero | All 11 contract periods are open and none has ever been superseded, so expansion, contraction and churn are $0 in all 27 months. Three empty columns read as a broken report; a sentence saying "every change so far is new business" reads as an honest one |
| 2026-08-13 | Still no Recharts, now that there is a real time series | 27 months of MRR is `MonthBars` — flex columns with percentage heights, ~30 lines. A ~100kb dependency that then needs overriding to match the hairline design still earns nothing. Revisit only if a report needs two series on one axis |
| 2026-08-13 | `grant … on all tables` was re-run and backed by `alter default privileges` | The original grant was a snapshot taken mid-migration, so six objects created afterwards — including `v_opportunity_outcomes`, which a later migration drops and recreates — were never visible to `authenticated`. Hosted Supabase's own defaults hid the bug entirely. `db:verify` now asserts every view is selectable, which is the check that would have caught it |
| 2026-08-13 | **Top focus and next follow-up are derived, never typed** | The spreadsheet's version was a line Ryan wrote himself each morning. Asking five people who have never used a CRM to maintain a to-do list inside one is how you get a CRM nobody opens — required fields are the enemy, and a required *sentence* is worse. If the data can rank it, the app ranks it |
| 2026-08-13 | Top focus ranks by **stage**, not by expected close date | The obvious ranking was close date, and the data killed it: only 2 of 30 open deals have one in the future and 16 cluster in a month five months gone, so every row would have read "165 days late" — noise, not a priority. Stage is populated on every deal and genuinely means something, so furthest-along-first is the one honest ranking available. The overdue count is still surfaced, as a nudge to fix the dates rather than as the ordering |
| 2026-08-13 | The company tiles stayed company-wide, with the personal section **above** them | "The dashboard should be on a per user basis" could have meant filtering all six tiles. It did not: those six mirror tab 0, which Ryan had confirmed minutes earlier, and all five people see all data by design. The personal part is additive — *what needs me* on top, *how are we doing* underneath |
| 2026-08-17 | **A gap fill is undone by replaying a per-field journal, never by deleting batch-stamped rows** | The whole existing undo model is "delete what carries this batch id". A gap fill only ever *updates* records that already existed, so stamping them would mean undo deleted Ryan's real buildings — the worst bug this app could have. `import_field_changes` records the before and after of every field it touches, and `rollback_field_changes()` puts them back. `commitWonLost` had already met this wall and dodged it by refusing to stamp rows it updated; this is the general answer |
| 2026-08-17 | Undo **leaves alone** any field edited by hand since the commit, and says how many | Five people can edit a building between the commit and the undo. The batch filled a *blank*, so a later hand edit is almost certainly the more considered value, and silently reverting it would be worse than an incomplete undo. The count is written to the batch rather than only shown on the button, because the list revalidates the moment the undo lands and the button disappears with it |
| 2026-08-17 | **A blank cell leaves the field alone. There is no way to clear a field through an import at all** | Ryan's call, and the one that makes everything else safe: a half-filled re-upload cannot wipe anything. The consequence is that an unparseable cell has to be a hard error — `parseMoney`, `parseDate` and `parseHealth` return null for both "empty" and "could not read that", which is right for a messy spreadsheet and would here mean a typo silently did nothing. A `CLEAR` sentinel was considered and rejected: a text field whose literal value is "CLEAR" is a footgun nobody needs yet |
| 2026-08-17 | A contract value from a gap sheet is always the building's **first** period; a building that already has one is refused | A price change and a typo look identical in a spreadsheet cell and mean opposite things in the revenue report. The building form already distinguishes them with a checkbox, so the importer sends you there rather than guessing. It also closes a real trap: `set_building_monthly_value()` returns the *existing* period id when the value has not moved, and the sheet exports current values — so a naive re-upload would have stamped a pre-existing period with the batch id and undo would have deleted it |
| 2026-08-17 | The value's effective date is the row's **contract start date**, falling back to today | Backdating is what makes the MRR history real rather than one step in the month of the import. 26 of the 27 unpriced buildings have no start date, so the fallback is what most rows would get — which is why contract start is editable in the same sheet, and why the preview says per building whether the value reads as new business this month or reaches back |
| 2026-08-17 | The gap census is a **view**, and reads `v_mrr_coverage` and `v_pipeline_coverage` rather than recounting | Same rule as win rate: two counts of one number eventually disagree, and the place that must never happen is a screen telling Ryan how wrong his revenue report is. It also means no future session has to count the blanks by hand — every one so far has started by doing exactly that |
| 2026-08-17 | The preview separates **overwrites** from fills instead of stamping the export with a timestamp | The stale-file problem is real: download Monday, edit until Thursday, and Wednesday's fix in the app gets reverted. The obvious guard — stamp the file and compare — dies on contact with Excel, which reformats `2026-08-17` to `8/17/2026` on save and would then flag every row as changed. Separating "this replaces something that was already there" from "this fills a blank" catches the same problem, needs no extra column, and is what a person actually wants to read |
| 2026-08-17 | One `gap-fill` importer key carrying a `scope`, not four keys | Four keys would have taken `importer.tsx` to nine parallel preview arrays, nine union members and nine near-identical preview blocks. The four sheets differ only in their field lists, so one key with a scope is one preview component — less code than the five importers that came before it |
| 2026-08-17 | **Mail, calendar and Granola jump the integration queue, ahead of InspectQA, payroll and Phase 6** | Ryan's call, and both reasons are about the same thing. Activity logging is the habit the whole CRM depends on and nobody is doing it by hand, so the app gets less true every week it waits. And 374 of 667 activities are attached to nothing — the moment to fix how matching works is before more data arrives, not after |
| 2026-08-17 | **The nightly job signs in as a real Supabase profile, not the service role key** | `.env.local.example` says in capitals not to put that key on Vercel, and the invariant it protects is "the deployed app can never do more than a signed-in member can do". A leaked ingest password gives away one member account; the service role key gives away every row with RLS switched off, and `auth.uid()` would be null so `audit_log.changed_by` would record nobody — on the table whose entire purpose is tracking who changed what. There was already a precedent: the QA logins are non-human profiles too |
| 2026-08-17 | `profiles.is_service` is a column, not a `user_role` value or a deactivation | `is_member()` requires `is_active`, so a deactivated machine account cannot write at all — "hide it by deactivating" is unavailable. A role value was rejected because `alter type … add value` cannot be used in the transaction that adds it, `is_admin()` branches on role, and role means *permission level* while this means *is a person*. Three edits keep it out of owner pickers; the "logged by" filter on `/activity` deliberately still shows it, because filtering the feed to *Nightly ingest* is how you audit a bad night |
| 2026-08-17 | **`isPublicPath()` lets `/api/cron/` through** | The proxy matcher covers `/api/*` and Vercel Cron carries no cookie, so every nightly run would have redirected to `/login` and returned a 307 that nothing reads. It would have looked like the job was running for as long as nobody checked. One line, found by reading the proxy rather than by it failing |
| 2026-08-17 | **A link is applied only on an exact address match; a domain match links the account and nothing else; anything read out of text is never applied** | Three tiers rather than a score, because a number invites "is 0.8 enough?" and nobody can answer that. What actually matters is *what* matched. The domain tier's cost is stated out loud rather than hidden: `cbre.com` and `jll.com` can never be mapped where an agent's buildings sit under separate accounts, so the tier is quietest on the largest relationships in the book |
| 2026-08-17 | Two live contacts sharing an address means **no** link, not the first one | `contacts_email_idx` is on `lower(email)`, is not unique, and has no `deleted_at` clause. Picking one of two is exactly the guess this phase exists to refuse |
| 2026-08-17 | **`next_steps` is its own table, not a status column on `activities`** | Every index on activities is `(something, occurred_at desc)`, so a future-dated row would sit at the top of every timeline until the day it happened — and `fetchMyFocus` computes "days quiet" from `max(occurred_at)`, so a meeting booked for Friday would make an account read as touched today and drop off the follow-up list. A status column would also be meaningless on all 667 existing rows and would have to be filtered by every query already written |
| 2026-08-17 | A suggestion is **a proposed write**: `subject_id` set means patch, null means insert | Four kinds all reduce to those two verbs, so `kind` only groups and words the review screen instead of forking the code — which makes a fifth kind free. `quiet_deal` was considered and rejected as a kind: it has no write to propose, so it is a report, and a stored report is stale the second somebody logs a call. Silence is `v_quiet_accounts`, read when displayed |
| 2026-08-17 | **Accepting a suggestion goes through `apply_gap_fill()`**, and nothing new was built for undo | It already journals every field, refuses anything off the allowlist, never clears with a blank, casts through the column's own type and writes one audit row per record. So a night of accepted suggestions is one `import_batches` row with the Undo button that has existed since Phase 5b. The allowlist gained exactly four pairs — what an activity is *about*, never what it *says*, and money stays absent |
| 2026-08-17 | **The proposer names `account_id` in the payload rather than letting the trigger fill it** | `set_activity_account()` is a BEFORE trigger that fills `account_id` when `building_id` is set, but `apply_gap_fill` journals only the columns it wrote itself — so undo would put the building back and leave the account stamped, a state the row was never in. `db:verify` now asserts both that the trap is real and that naming the column undoes cleanly, so a future session cannot remove the workaround thinking it is dead code |
| 2026-08-17 | **`dedupe_key` is unique across every status, including rejected** | One line of DDL, and it is what decides whether the review screen is usable in month three: without it the job re-proposes the same 113 links every night forever. The payload is hashed into the key, so a genuinely different proposal about the same record still gets through — "no" sticks to *this* proposal, not to the record |
| 2026-08-17 | Email bodies pass through the job; they do not land | Ryan's call on scope. Exchange is the mail archive and has retention behind it; a second copy of every client email in Postgres is a liability with no read path, readable in full by four people who were not on the thread. Subject, participants and ~500 characters are enough to review a suggestion against, and a quote stored as evidence is a sentence, not a message |
| 2026-08-17 | The unknown-sender tray is a **mirror row**, not a table of its own | The promise about scope was "address, domain, count and last-seen — no subject, no body". A row with `status = 'ignored'`, an empty subject and a null snippet *is* that promise, expressed as data rather than as a comment somebody could quietly stop honouring |
| 2026-08-17 | One email to several colleagues becomes **one** activity | Otherwise a five-way client thread puts five identical rows on one account timeline and inflates every activity count in the app. Credited to the sender when the sender is one of the five, since an outbound email is that person's work |
| 2026-08-17 | **The relink matches orphan activities to deals, not accounts** | The plan said accounts. The data said otherwise: re-running the account matcher over the 374 resolves **zero**, because the ones that were going to match already did during the original import. What is left is deals — and 113 of them match an opportunity name exactly, with no ambiguous cases. Not one of the 667 activities carried an `opportunity_id` before this, which is exactly why no report can say a deal has gone quiet and why `my-focus.ts` ranks by stage |
| 2026-08-17 | The relink writes **suggestions**, so it needed none of the five-place importer framework | Adding a seventh `ImporterKey` would have meant a preview array, a union member, a commit action, a counter and a preview block. Writing suggestions instead means the review screen *is* the preview and accepting is what creates the undoable batch — less code, and the same undo |
| 2026-08-18 | **A building is one account's contract at one place; `sites` is the place** | Phase 0 assumed one building, one account, and recorded the doubt as an open question. The answer is yes and it is common — Beale's has contracts with landlords *and* with their tenants at the same address. `buildings` is left exactly as it was, and the physical building becomes its own row that several of them point at. The revenue model is deliberately untouched: three of the records this exists to untangle carried $13,100 of a reported $47,148 MRR between them, so a change that could move the dashboard as a side effect was never worth the elegance. `tenancy` is `landlord`/`tenant` rather than `owner`/`tenant`, because `buildings.owner_id` already means the Beale's person responsible |
| 2026-08-18 | Consolidating two buildings repoints contract periods, never closes and reopens them | Ending a period on one building and opening it on the other writes churn AND new business into the same month — a contraction and a win that never happened, permanently. `move_contract_periods_to_building()` moves the rows. Three `db:verify` checks assert company MRR is identical in every month afterwards and that neither churn nor new business moved. Same argument as `correct_open_contract_value()`: a correction restates history rather than recording a movement |
| 2026-08-18 | **The clean-up screen can only ever soft-delete** | `activities.account_id` is `on delete cascade`, so one "Delete row" on a duplicated account in the Supabase table editor would take every activity logged against it — 44 on the Cancer Center account alone — with no undo and no screen to show it. `/admin/cleanup` sets `deleted_at` and nothing else. It also refuses to archive an account that still owns buildings, or a building that still bills, naming the amount: a tidy-up must not be able to change the revenue report |
| 2026-08-18 | Granola's match signal is the note **title**, not the attendee list | Measured against all 231 real notes: not one carries an external attendee address, because most are solo site inspections dictated into a phone. The participant matcher that mail uses resolves *nothing* on any of them. Titles carry building addresses and deal names instead. Matching is phrase-based, never single-word: a single-token version scored worse (40 clean matches vs 98) and filed a family hospice note under Beth Israel Lahey on the word "Beth". All nine personal notes in the corpus match nothing under the phrase rule, which is the privacy promise proved on real data rather than asserted |
| 2026-08-18 | `--password` on an existing account was silently doing nothing | `create-user.mjs` fell through to a branch that updated the profile and never touched the auth record, then printed "Password unchanged" — while reporting success. It is the script the whole team gets onboarded with and all four remaining colleagues already have profile rows, so every one of them would have failed quietly. Fixed, and `npm run user:password` added: it prompts with the echo suppressed rather than taking the value as an argument, because arguments land in shell history and in `ps` |
| 2026-08-17 | The fixture source exports the same shape the real connectors will | `graph.ts` and `granola.ts` swap in at one line in the route. That is what let every hard decision — RLS under a machine account, undo through `apply_gap_fill`, dedupe, idempotency, the privacy rule — be proved against the real database before a single credential existed. Its addresses are `.invalid`, so a fixture run against production creates nothing |
| 2026-08-13 | Health dots are the one semantic use of colour in the app | Green/amber/red is what the team already reads on the spreadsheet, and navy cannot carry that meaning. It stays inside the brand rules because they are **dots, never text** — the label sits beside each one in normal charcoal, so nothing depends on seeing the colour. Amber is the brand gold, used as a fill, which is exactly what the guide permits |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
