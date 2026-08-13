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

The file lives at `private-data/Beales_CRM.xlsx` (git-ignored). **Every tab has its headers on row 4** — rows 1–3 are title banners. Row counts: Pipeline 52, Active Clients 38 + a `TOTAL ACTIVE ARR` row that must be skipped, Contacts ~57, Activity Log ~670, Won/Lost 19.

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
- [ ] **Phase 1b** — CSV importer (upload → map columns → preview → confirm). Migrate tabs 2 and 3.
- [ ] **Phase 2** — Quick-add activity logging, timelines, activity feed with filters. Migrate tab 4. *This is the daily-habit feature — the whole project rests on it.*
- [ ] **Phase 3** — Opportunities kanban, stage history, weighted pipeline, closed-lost capture, closed-won conversion to account + building, pipeline report. Migrate tabs 1 and 5.
- [ ] **Phase 4** — Employees, assignments, staff movement history, projects
- [ ] **Phase 5** — Revenue views in Postgres, dashboard (mirror tab 0 first), six reports with CSV export
- [ ] **Phase 6** — Mobile polish, global search (Cmd-K), audit log, empty states, error handling, invite the team
- [ ] **Phase 7+** — Integrations, one per phase, in the order above

## Current status

**Phase:** 1a built and self-tested, awaiting Ryan's sign-off. Phase 1b (the importer) next.
**Last session:** 2026-08-12

**What works right now:** Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui. Login by
password or magic link, verified end to end — Ryan signed in and reached the dashboard
shell. All three migrations are applied to `beales-crm` (`pjcitahktwnawucoznhk`), and
`npm run db:check-remote` confirms against the live database that a stranger holding the
public key can read and write nothing.

**Accounts created:** Ryan only. The other four are pending (see Open questions).

**Not set up yet:** Vercel. The app runs locally only.

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

**Next action (Phase 1b):** the CSV/Excel importer — upload, map columns, preview, confirm.
It must derive accounts by splitting `Client Name` on the em-dash, parse `Service Scope`
for address and square footage, skip the `TOTAL ACTIVE ARR` row, and let Ryan merge
proposed account groupings by hand before anything is written. Every row it creates carries
`import_batch_id` so a bad run is one delete.

The building form's monthly value calls `set_building_monthly_value()`; never write to
`building_contract_periods` directly.

### How to work in this repo

| Command | What it does |
|---|---|
| `npm run dev` | Local app on http://localhost:3000 |
| `npm run db:verify` | Runs every migration + `seed.sql` against a throwaway in-memory Postgres and asserts RLS, triggers, revenue views and pay-rate access all behave. **Run this after any schema change** — no Docker needed |
| `npm run user:create -- --email … --name … --role …` | Creates one of the five accounts. Only place the service role key is used |
| `npm run lint` / `npm run typecheck` / `npm run build` | The usual checks |
| `npx supabase db push` | Applies migrations to the real Supabase project |

Note: `next dev` appends an auto-generated block to the bottom of this file. Leave it committed.

### Gotchas already paid for

**Naming a foreign key in a PostgREST embed.** `contacts` and `accounts` are joined *twice* — `contacts.account_id` and `accounts.primary_contact_id` — so `select('*, account:accounts(...)')` fails with "more than one relationship was found". Write `accounts!contacts_account_id_fkey(...)`. The same applies wherever two tables have two FKs (buildings↔profiles via `owner_id` and `secondary_owner_id`).

**Query errors must not become 404s.** Detail pages check `error` separately from a missing row and throw, because the ambiguous-embed bug above showed up as a bare "page not found" and cost real time. There is an `error.tsx` boundary that prints the message.

**A user cannot be hard-deleted once they have changed anything.** `audit_log.changed_by` references `profiles`, deliberately — deleting the person would erase who did what. **Deactivate instead**: `npm run user:create -- --email … --name … --inactive`. That blocks sign-in and hides all data from them, while their name still shows on records they owned.

**This project lives in `~/Desktop`, which is synced to iCloud Drive.** iCloud created conflict copies (`routes.d 2.ts`) inside `.next/`, which broke `tsc` with duplicate-identifier errors. Fix is `rm -rf .next`. Worth moving the project somewhere outside Desktop/Documents — iCloud should not be syncing `node_modules` and build output.

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
- [ ] Bob Mulligan's legal first name, for the Phase 7 payroll parser — Paychex will say "Robert" or similar where the team says "Bob", and there is already another Robert Mulligan to tell him apart from.
- [ ] Vercel project — not set up yet.

**Blocking Phase 1b (the import):**
- [ ] Exact column headers of `2-Active Clients` and `3-Contact Directory`, or a CSV export of both.
- [ ] Are the sheet's contract values monthly or annual, and do they include project/extra work or only the recurring contract?
- [ ] Building statuses beyond pending / active / lost — on hold, seasonal, month-to-month?
- [ ] Does a building ever move between Beale's LLC and AFS? If so, `entity` needs dating the way contract value is.
- [ ] Can one building ever be billed to two accounts? Assumed no.

**Review when convenient:**
- [ ] `property_types`, `loss_reasons` and `lead_sources` are seeded with placeholders — see `20260812180100_reference_data.sql`. Replace with the real lists.
- [ ] Phase 2 decision: offline outbox for unsent activities (IndexedDB). Conflicts with the "no localStorage" rule; argued for in the Decision Log.

**Later phases:**
- [ ] Deal stage names — Phase 3. The seven seeded stages are placeholders; derive real ones from the stage column in tab `1-Pipeline`.
- [ ] `0-Dashboard` formulas or screenshot — needed before designing the Phase 5 dashboard.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
