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
- [ ] **Phase 5b** — The gap-filler. Export blanks to CSV → fill in Excel → upload → preview →
      commit → undo, matching on record **id** rather than fuzzy names. Ryan chose all four
      scopes: buildings (value, segment, hours, end date), open deals (value, close date,
      account), contacts (link to account), accounts (primary contact, owner). **This is next.**
      Every number in the app is understated until it exists — see the gap census below
- [ ] **Phase 6** — Mobile polish, global search (Cmd-K), audit log, empty states, error handling, invite the team
- [ ] **Phase 7+** — Integrations, one per phase, in the order above

## Current status

**Phase:** 5 shipped and **deployed**. The dashboard, six reports and the revenue views are live
at `https://beales-crm.vercel.app` against real data, and Ryan has signed in. **All five
spreadsheet tabs are imported** — 22 accounts, 38 buildings, 97 contacts, 667 activities,
55 opportunities. The Google Sheet is no longer the source of truth for anything the CRM holds.
**Last session:** 2026-08-13

**Next: Phase 5b, the gap-filler.** The app is now feature-rich and data-poor. Every report opens
by apologising for its own numbers, which is honest but is not what the other four should meet on
day one. See the gap census below — that, not new features, is what unlocks the rest.

Live counts: 5 committed import batches, 8 win reasons (Ryan kept every phrase the Won/Loss
preview offered), 1 competitor (Janitronics). **`employees`, `employee_assignments` and `projects`
are all still empty** — nothing in the workbook feeds them, which is the first thing Phase 4 has
to solve.

### The gap census — what Phase 5b has to fix (measured 2026-08-13)

| Records | Missing |
|---|---|
| Buildings with no contract value | **27 of 38** |
| Buildings with no property type / segment | **38 of 38** |
| Buildings with no contracted hours | **37 of 38** |
| Buildings with no contract end date | 30 of 38 |
| Buildings with no square footage | 25 of 38 |
| Open deals with no monthly value | **28 of 30** |
| Open deals whose expected close is absent or in the past | **28 of 30** |
| Open deals not linked to an account | 28 of 30 |
| Contacts not linked to an account | **63 of 97** |
| Accounts with no primary contact | **22 of 22** |
| Accounts / buildings with no owner | 1 each |

Re-run that census before building anything, since Ryan may have filled some in by hand.

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

**Accounts:** all five are created and active — Ryan, Jon, Robert Mulligan, Bob Mulligan and
Victor Melo. Earlier versions of this file said only Ryan's existed; that was stale. Brendan
Mulligan is a sixth profile, deactivated. There is also a seventh, `qa-phase5@bealesllc.com`,
**deactivated, do not delete** — it holds the audit row for the 91 Longwater Drive contract
correction, and removing the profile would erase who made that change.

**Live at `https://beales-crm.vercel.app`** since 2026-08-13, deployed from GitHub `main`. Two
environment variables are set on Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
and **`SUPABASE_SERVICE_ROLE_KEY` is deliberately not among them** — nothing under `src/` reads it
and it bypasses every RLS policy. `NEXT_PUBLIC_SITE_URL` is not set either: `siteUrl()` falls back
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
| `npx supabase db push` | Applies migrations to the real Supabase project |
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
- [ ] Can one building ever be billed to two accounts? Assumed no.

**Opened by Phase 5:**
- [ ] **`property_type_id` is null on all 38 buildings** — segments never came across in the Active
      Clients import, so revenue-by-segment cannot be built. Needs a re-import of that column or a
      bulk edit. The pipeline side is fine; opportunities carry it.
- [ ] **374 of the 667 activities are attached to nothing** — no account, building, deal or
      contact. They came from the Activity Log import and count towards nobody on
      `/reports/activity`, which says so. Worth deciding whether to re-import with a link column.
- [ ] **27 of 38 buildings have no contract figure.** Every revenue number is understated until
      these are filled in. The screens say so, but the fix is data entry, not code.
- [ ] Only 2 of 30 open deals carry a price, so the weighted pipeline is near-meaningless. Same
      shape of problem as above.
- [ ] **Expected close dates are stale on 28 of 30 open deals** — 16 sit in March 2026. The
      dashboard nudges about it rather than ranking by it. Until they are refreshed, no
      close-date-driven forecasting is possible.
- [ ] **Only Ryan and Robert own anything.** Jon Beale, Bob Mulligan and Victor Melo own no deals,
      accounts or buildings, so their personal dashboard section is empty. Assign owners before
      inviting them, or their first impression of the CRM is three empty panels.
- [ ] The `WIN RATE` formula in cell H5 of `0-Dashboard` — its 86% matches none of the four
      denominators the data supports. Needed to close the last reconciliation gap.
- [ ] The rest of the daily briefing (Meetings Today, Client Matches) needs Granola and calendar
      integrations — Phase 7.

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
- [ ] Sender email addresses for the weekly payroll emails, plus 3–4 real samples before the parser is written — Phase 7.
- [ ] InspectQA read-only credentials for `beales-inspections` (`illxdfvqvuwoqwbplgiy`) — Ryan provides at Phase 7. The project is identified; the credentials are not yet issued.
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
| 2026-08-13 | Health dots are the one semantic use of colour in the app | Green/amber/red is what the team already reads on the spreadsheet, and navy cannot carry that meaning. It stays inside the brand rules because they are **dots, never text** — the label sits beside each one in normal charcoal, so nothing depends on seeing the colour. Amber is the brand gold, used as a fill, which is exactly what the guide permits |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
