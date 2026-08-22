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
- **Vercel** — the `beales-crm` project is on the **Hobby** plan (verified in the dashboard 2026-08-18, correcting an earlier note in this file that said Pro)

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

**How a tenant is modelled, settled 2026-08-18 on the first real case.** Gener8 is a janitorial
customer of Beale's *and* a tenant of Ciminelli Real Estate, who owns 181 and 187 Ballardvale Rd.
Gener8 is its **own account**, with its own building row at 181 Ballardvale pointing at the same
`site` as Ciminelli's, `tenancy = 'tenant'` against Ciminelli's `'landlord'`. The test is: **do they
sign their own contract and pay their own invoice?** If yes it is an account, because account MRR is
a roll-up of its buildings — filing Gener8 under Ciminelli would silently report money Gener8 pays
as Ciminelli revenue, and Gener8 leaving would read as Ciminelli contracting. Same shape at 851
Middle St, where suite 2100 (HTA) and suite 3500 (Brown University Medical) are two accounts at one
site. A suite is only a *building* detail when the same customer pays for both.

**A consequence worth knowing before adding a tenant:** the moment a second building exists at an
address, the bare street phrase is claimed by two records and the Granola matcher calls it
**ambiguous** rather than linking it — which is correct, since a note saying only "181 Ballardvale"
genuinely could be either contract. The fix is one alias per tenant. And a one-word name like
`Gener8` never becomes a derived phrase at all: the phrase rule needs two meaningful words, which is
what stops "Beth" filing a hospice note under Beth Israel. Single-word identities always need a
curated alias, by design.

**Note for Phase 8:** InspectQA calls a serviced site a **`building`**, not a "site" — confirmed in its own table editor 2026-08-22. The CRM's `inspectqa_site_id` column and `inspectqa_site_map` table map to InspectQA's `buildings.id`, which is a uuid. It also has `organizations`, so it is multi-tenant — filter to Beale's own org (`5949ef54-0743-4b02-a85f-3f14014ca…`, slug `beales`) when syncing. **That table holds exactly one row today, so the filter is a no-op and must be written anyway:** this project is being prepared as a spinout, so a second org is the plan. Full measured schema is in Open Questions.

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
- [x] **Phase 6a** — Global search (⌘K / a header button), one Postgres `search_records()`
      replacing the three-way fan-out behind Quick Add, plus two audit migrations: profiles
      now carry an edit history, and the audit log stopped leaking pay rates
- [x] **Phase 6b** — The audit-log screens (History on all four record pages, `/admin/history`),
      plus `not-found.tsx` × 2, `global-error.tsx`, `loading.tsx` × 2 and the contacts empty
      state. **The core product is finished; the team can be invited**
- [x] **Phase 7a** — The nightly ingest spine. Migration, the machine account, the cron route, the
      three confidence tiers, `next_steps`, the review queue, the domain map, and the workbook
      relink that gives 113 orphan activities a deal. Runs on fixtures; no external credentials
      needed or used
- [x] **Phase 7b** — Microsoft Graph: mail and calendar, `ingest_runs`, the mailbox list, the
      probe. **Shipped and running against the real mailbox.** No delta tokens and no cursor
      table, deliberately — see the decision log. Not yet deployed
- [x] **Phase 7c** — Granola. The title matcher, `match_aliases`, `profile_email_aliases`,
      `granola.ts`, the admin screens, and the probe/backfill scripts. Shipped and tested end to
      end against the real database. **Two things are Ryan's to run:** archive the two duplicate
      records then `npm run sites:backfill --commit`, and `npm run granola:backfill --commit`
      once he is happy with the alias list. The calendar join key is
      `calendar_event.calendar_event_id`, **not** `iCalUId` — this account is on Google Calendar
- [ ] **Phase 7d** — The extraction layer: written commitments as next steps, non-revenue
      gap-fill proposals. Money is never model-proposed
- [ ] **Phase 8+** — The remaining integrations: InspectQA, then the payroll email ingest

**The order changed on purpose.** This file used to put InspectQA and payroll before mail, after
Phase 6. Ryan moved mail, calendar and Granola to the front on 2026-08-17, for two reasons worth
keeping: activity logging is the habit the whole CRM depends on and nobody is doing it by hand,
and 374 of 667 activities are attached to nothing — so this was the moment to fix how matching
works before more data arrived. Phase 6 and InspectQA follow.

## Current status

**Phase:** 7b shipped and then hardened twice — a moved meeting updates, and a cancelled
one is flagged. Phases 1–7 are complete except 7d.
**Last session:** 2026-08-22 (second session).

### What changed on 2026-08-22 (second session): a cancelled meeting stops sitting there

**The other half of the reschedule problem, and a different KIND of problem.** A move
ARRIVES carrying a new time and `nextStepPatch()` compares it. A cancellation arrives as
nothing at all — delete a meeting in Outlook and Graph simply stops returning it from
`calendarView` — so there was no item, no mirror lookup, and nothing that could ever
notice. The next step went overdue, dropped into *Still open*, and stayed there for ever.

**It flags. It never closes.** Ryan's call and the right one: absence is an inference, and
this app applies a link only when it is a fact. A wrong flag costs a glance; a wrong
auto-dismissal silently removes a real meeting from the only screen it appears on. The
row stays `open` and gains a marker; the person still presses Dismiss, which already has
an Undo. There is deliberately **no new `next_step_status` value**.

| Thing | Why it is the way it is |
|---|---|
| **`SourceFetch` gained an OPTIONAL `calendar` field, so `fixtures.ts` and `granola.ts` did not change at all** | This was the real design question and the answer is that silence IS the vouching. A source emits a `CalendarWindow` only for a mailbox whose calendar came back **200, untruncated, before the deadline**. No window means no sweep, so a 403, a truncated page, a deadline stop and a Graph outage all fail safe **by construction** rather than through a branch somebody has to remember to write |
| **`present` is built from the PRE-collapse page. Trap one, and it would have been catastrophic** | `collapseRecurringSeries` keeps only the earliest occurrence still ahead of each series, so a seen-set built after it is missing most occurrences of every standing meeting — a sweep against it would flag them all. The collapse itself is untouched |
| **A meeting is only judged if its `due_at` is INSIDE the window that was actually asked for** | The safety rail, and it is what stops the *Still open* pile — the very rows this exists to serve — being flagged wholesale on the first night. A next step due five days ago was never requested, so its absence proves nothing |
| **`calendarExternalId()` was lifted OUT of `eventToItem`** | The sweep and the mapper must agree about what identifies a meeting, and here a disagreement would read as every occurrence of a series being cancelled at once. Same argument as `siteKey()` |
| **A bug found and fixed on the way: cancelling one occurrence made the NEXT one disappear** | `collapseRecurringSeries` ran on the raw page **before** `eventToItem` dropped `isCancelled`. So cancelling the next occurrence of a weekly series meant the collapse elected that occurrence, it was then discarded, and the occurrence after it got no next step that night. The series went quiet and nothing said why. Cancelled events are now separated first |
| **The counters live on `ingested_items`, NOT on `next_steps`** | `next_steps` is audited and the mirror deliberately is not. Believing an absence takes three misses, so counters on the audited table would write three rows per vanished meeting into the history a person actually reads. **Proved on the real database: six miss-writes produced ZERO audit rows.** It is also where they belong on the merits — the mirror records what the source said, and not seeing something tonight is a fact about the source object. `next_steps.vanished_at` is written once, so a flag is one clean line |
| **Three misses AND 48 hours, not either** | The job fires twice a night, so three misses alone is about a night and a half rather than the three nights it is meant to mean. `first_missed_at` is stamped on the FIRST miss and never moved — move it each time and the elapsed test measures the gap between the last two runs, roughly two hours, quietly reducing the whole rule to "three misses". Both directions are pinned by self-tests and were proved against the real database |
| **An explicitly cancelled event flags the SAME night** | Graph tombstones some cancellations rather than removing them, and that cannot be a bad night: the event came back fine, with a flag on it. Waiting three nights to repeat something the source stated outright would be timid. `vanished_reason` records which, because *"Cancelled in Outlook"* and *"No longer on the calendar"* deserve different confidence from the person reading them |
| **A meeting that COMES BACK is un-flagged, counters and reason with it** | Otherwise the strip goes on saying a live meeting is gone, and the flag would be a one-way door |
| **The marker is gold FILL with navy on top, on the row's second line** | Gold is 1.9:1 on white and can never carry text. The right-hand side belongs to Done and Dismiss — at 375px the row has ~295px and they take 121px — so the tag rides the second line beside the date and `flex-wrap`s onto its own line rather than pushing anything off. Measured: `document.body.scrollWidth` 375, no overflow |
| **The tag retires the moment the row is closed** | A row reading *"Dismissed · Undo"* does not also need to be told why. The person has acted |

**Tested end to end against the real database** under `qa-cancelled@bealesllc.com` (admin,
rates), now **deactivated, do not delete** — with one disposable `next_steps` row and its
own mirror row, swept by a synthetic window naming **only the QA mailbox**, so none of
Ryan's rows were reachable.

- One miss → counted, `first_missed_at` stamped, **not** flagged.
- Three misses within seconds → **still not flagged**, and `first_missed_at` unmoved.
- Backdated 21 hours, a fourth miss → **still not flagged**. Backdated 50 hours → **flagged**,
  reason `absent`, `nextStepsVanished: 1`, and the row still `open`.
- Absent again while flagged → **0**, counter frozen. Present → flag, reason and counters
  all cleared. Cancelled → **flagged on the same pass** with no misses at all; saying so
  twice wrote nothing.
- **Six miss-writes, zero audit rows.** Only the three conclusions were recorded, each
  attributed to *Nightly ingest* rather than to "—".
- `/admin/history` reads *"Off the calendar — → Aug 22, 2026, 12:09 PM · Because — →
  Cancelled · changed by Nightly ingest"*, and the clearing reads in reverse.
- Browser: the tag renders in *Still open*, Dismiss and Undo both still work, and at 375px
  it wraps to its own line with no horizontal overflow.

**And then the real job, by hand against localhost, reported `nextStepsVanished: 0`** —
the load-bearing safety proof, with Ryan's calendar window complete and swept.

**It also found something real on that first run, and it is NOT test residue.** *Monthly
BI Inspection*, due 19 Sep, took its first genuine miss. Chased before believing it:
`calendarView` across 15–26 Sep returns 13 events and none is that meeting, and **all 260
events on the mailbox, fully paged, hold nothing by that name and nothing carrying its
`iCalUId`**. The meeting has been deleted. So Ryan has an open next step for a meeting
that no longer exists — exactly the bug this session set out to fix — and it will flag
itself after two more nightly misses. **Its counter was deliberately left alone**, because
it is a true observation from a real run.

**Counts before and after are identical: accounts 23, contacts 100, live buildings 53,
activities 843, `next_steps` 5 (2 open, 3 dismissed), `ingested_items` 292, `audit_log`
2193, and MRR $46,086.33.** `ingest_runs` 18 → 19, the one hand-run. The six audit rows
the disposable row produced were removed with it — unlike earlier QA logins, they recorded
nothing of value about real data.

`db:verify` **230 → 238**. `graph:probe --selftest` **51 → 70**. The live probe now also
says, per window, whether anything came back **cancelled** and whether the window was
**complete enough to sweep at all** — it reads *"this window was complete"* and *"none of
them is marked cancelled"* on 2026-08-22. `typecheck`, `lint` and a cold
`rm -rf .next && npm run build` all pass.

**What this has NOT been proved against: a real deletion, end to end through the cron.**
The synthetic window proves every rule; what no session can force is Ryan deleting one of
the two meetings that carry next steps, both of which have a customer on the invite. The
*Monthly BI Inspection* row above is now the live test case, and it will answer on its own
within about three nights.

### What changed on 2026-08-22: a rescheduled meeting stops lying

**The migration comment was right and the code was not.** `20260818090000_ingest.sql:107`
has always said a calendar event that moves "is updated rather than duplicated". The
`unique (source, external_id)` it describes did stop the duplication. **Nothing anywhere
performed the update** — so a meeting dragged from Tuesday to Thursday in Outlook read as
Tuesday for ever, and once Tuesday passed it dropped into *Still open* as though somebody
had missed it. Survivable while next steps were invisible; not survivable now they are the
first panel on the first screen anybody opens.

**The comment is now TRUE, so the migration file was deliberately not edited.**

| Thing | Why it is the way it is |
|---|---|
| **The already-seen short-circuit's CONDITION is untouched** | `run.ts:195` keys on `status === 'linked' && (activity_id \|\| next_step_id)`, and that keying is load-bearing for something else entirely — it is what lets an unmatched Granola note be re-evaluated after an alias is added. The reconcile happens **inside** the branch, before it returns, so nothing about alias retro-linking changes |
| **The identity key was already right and was NOT changed** | `graph.ts:277` suffixes `iCalUId` with **`originalStart`** — the original slot, not the moved one — so a rescheduled occurrence still matches its mirror row while the time underneath it changes. A one-off keeps its bare `iCalUId`, stable across a move too. Identity was never the problem; only the update path was missing |
| **Only `status = 'open'` rows are touched. Ryan's call and the right one** | Closing one was a decision, and a nightly job that quietly reopens it is how somebody stops trusting the strip. There is a second reason that is easy to miss: `collapseRecurringSeries` keeps the earliest occurrence still ahead, so a dismissal is **meant** to hold while that occurrence is in the future. Reviving it on a move would undo the documented "dismiss means not this week" behaviour |
| **`due_at`, `all_day` and `title` — exactly what the strip renders** | A rename to `CANCELLED - site walk` is worth seeing, and it is the **only** signal available for a cancellation the organiser renames rather than deletes. A slight rename simply reads correctly rather than staler. `detail` is deliberately left out: nothing in the app renders it, so keeping it current would be audit-log noise and nothing else |
| **`due_at` is compared as an INSTANT, never as a string** | The line the whole feature turns on. Postgres hands back `2026-08-29T11:00:00+00:00`; the item carries `2026-08-29T11:00:00.000Z`. Same moment, different text — so a string comparison would report a change **every single night**, write an audit row per meeting per run, and make the new counter mean nothing. Proved against the real database: an identical second run reported `nextStepsUpdated=0` |
| **It is deliberately NOT re-matched** | If the attendees changed, the account and contact links stay exactly as they were. A meeting silently moving to a different account overnight is a suggestion-shaped problem, not an update |
| **`nextStepPatch()` is PURE, and lives in `src/lib/ingest/index.ts`** | No database, no clock, no network — which is what lets `graph:probe --selftest` pin all ten of its rules on a machine with no credentials at all. Beside `toSnippet`/`toBody`, where this repo already keeps its pure shaping rules |
| **`nextStepTitle()` is shared by the insert and the patch** | The insert's fallback was `item.subject \|\| 'Meeting'` inline. Two copies would drift, and `next_steps.title` has `check (title <> '')`, so an untitled meeting patching to `''` would fail the write rather than fail quietly |
| **The mirror lookup gained the next step by EMBED** | One round trip rather than two. It costs nothing on the paths that never use it: mail and Granola carry no `next_step_id`, so the embed comes back null. `MIRROR_COLUMNS` is one long string literal on purpose — supabase-js infers the row type from the select STRING, and a concatenation widens every column to `string` |
| **`occurred_at` and `subject` on the mirror move too, but ONLY when something moved** | An ordinary re-sighting stays the single-column write it has always been. `/review` and `/admin/ingest` read these rows, and the mirror must not go on saying Tuesday while the strip says Thursday |
| **One additive column, `ingest_runs.next_steps_updated`** | Instructed by that table's own comment: *"When that type gains a number, this table should gain a column."* It is what makes the fix **visible** — without it the only evidence a reschedule landed is the dashboard reading differently from how somebody remembers it yesterday. Rendered on `/admin/ingest` **only when above zero**, because a sixth number reading 0 on almost every run is the dead number this app refuses everywhere else |
| **`/admin/history` needed no work at all** | `next_steps` was already on the audit renderer's allowlist with `title`, `due_at` and `all_day` labelled, so a reschedule renders as *"Due Aug 27 → Aug 29 · changed by Nightly ingest"* for free |

**Also fixed: a broken *Coming up* rendered as an empty *Coming up*.** `fetchUpcomingNextSteps`
destructured a bare `const { data }` while both siblings returned an error. It now matches
them — **and the deeper half is that `today.error` and `overdue.error` were already returned
and already rendered nowhere**, so all three sections failed silently. The first non-null of
the three now reaches the strip, and the strip's `return null` no longer swallows an error
when there is nothing else to show.

**Tested end to end against the real database** under `qa-reschedule@bealesllc.com` (admin,
rates), now **deactivated, do not delete** — with one disposable `next_steps` row and its
own mirror row, so none of Ryan's rows were touched.

- Moved two days **and** renamed → `nextStepsUpdated=1`; the row followed on both fields,
  and so did the mirror's `subject` and `occurred_at`.
- The identical run again → **`nextStepsUpdated=0`**, which is the instant comparison
  working rather than a string comparison flooding every night.
- Set `done`, then `dismissed`, each with the source claiming a move to 30 Sep → **0 both
  times, and neither the title nor the date shifted.**
- Reopened → it follows again, `nextStepsUpdated=1`.
- Six `audit_log` rows, every one attributed to the QA profile by name.

**Counts before and after are identical: accounts 23, contacts 100, live buildings 53,
activities 843, sites 51, deals 55, `ingested_items` 292, `ingest_runs` 16, `import_batches`
13, and MRR $46,086.33.** `next_steps` is back to **5 — 2 open, 3 dismissed**. `audit_log`
2181 → 2190, fully accounted for: **7 rows written by QA**, all on the next step it created
and then deleted, plus **2 `profiles` rows for the QA account itself**, which read
"changed by —" because `user:create` uses the service role key and has no `auth.uid()`.

`db:verify` **227 → 230** (one migration, plus that moving a next step records the old time,
the new one and who moved it). `graph:probe --selftest` **41 → 51**. `typecheck`, `lint` and
a cold `rm -rf .next && npm run build` all pass.

**What this has NOT been proved against: a real moved meeting.** `npm run graph:probe` now
counts occurrences whose `start` differs from their `originalStart` — meetings somebody has
already dragged — and reads **"none of them has been moved from its original slot in this
window"** on 2026-08-22. It says so plainly rather than implying the path is proved. Ryan
moving one of his own meetings in Outlook and running the job by hand is the outstanding
end-to-end check. (The same window read **70 events, 53 occurrences across 10 series, 40
ahead, 13 after collapsing** — ordinary drift from yesterday's 11 and 14.)

### What changed on 2026-08-21: a next step can finally be closed

**The strip built earlier the same day could only ever fill up.** Nothing anywhere in the app
wrote `next_steps.status`, `completed_at` or `activity_id` — the only writer was the nightly
ingest, which inserts and never updates. The two rows ever closed were dismissed from the
Supabase SQL editor, which has no `auth.uid()`, which is why they read as "changed by —".

And there was a second half nobody had noticed: `fetchUpcomingNextSteps` filters
`due_at >= now` while Today is a midnight-to-midnight window, so **a meeting nobody marked
done vanished the following morning and never came back**. A Done button without an overdue
surface would have left rows that could never be reached at all.

| Thing | Why it is the way it is |
|---|---|
| **"Still open" is its own section and is NOT gated on today being empty** | Unlike Coming up. The day you have five meetings is exactly the day yesterday's gets forgotten. It cannot become permanent furniture either, because it **drains**: closing what is on screen brings the next five within reach, so no separate `/next-steps` page is needed and none was built |
| **Most recent first — the opposite of the other two sections** | Oldest-first fills the cap of five with the stalest rows and hides yesterday's meeting behind "and N more". Yesterday's is the one you can still answer |
| **The overflow count comes off the SAME query**, via `{ count: 'exact' }` | Two queries counting one number is how the two eventually disagree, and this one tells you how wrong the section is about itself |
| **Overdue rows are labelled with `ago()`, not a date** | "2 days ago" answers the question an overdue row actually raises. `ago()` was already the shared phrasing for the activity timeline and record history, and it puts the year back on anything past a month — which is exactly where `whenLabel()`'s "no year" rule would have started lying |
| **Done writes `status` and `completed_at`. It does NOT write `activity_id`** | Ryan's call and the right one. Required fields are the enemy, and a picker is worse than a required field because it is a search — one that would be **empty most times you opened it**, because the activity usually does not exist yet when you mark the meeting done (the Granola note lands that night, the email later). The honest way to fill that column is a **join at ingest time** on `(source, external_id)`, which the next step and the activity already share from the same calendar event. A judgement nobody has to make, rather than a picker nobody uses |
| **Closing a next step CANNOT cause the ingest to re-create it** | `run.ts:195` short-circuits on `existing.status === 'linked' && (existing.activity_id \|\| existing.next_step_id)` — which tests that the row still **exists**, not that it is open. This is why nothing here may ever become a delete |
| **…but Dismiss means "not this week", not "never again"** | `collapseRecurringSeries` keeps the earliest occurrence still ahead, so while the one you dismissed is still in the future the dismissal holds and nothing slides in behind it. Once its start time passes, the next occurrence becomes earliest-ahead, gets its own `external_id`, and arrives as a new next step. That is correct and it is not obvious |
| **A closed row STAYS IN PLACE, muted, with an Undo** | Nothing jumps under the cursor mid-tap; the section counts stay true to what is on screen without recomputing; and a mis-tapped Dismiss is recoverable, which it was not before — the only way back would have been the SQL editor again, the very thing this session exists to remove |
| **…so `setNextStepStatus` is the ONE action in the app with no `revalidatePath`** | Revalidating re-renders the dashboard and drops the row out of the strip the instant it is closed, taking the Undo with it. It is safe precisely because **nothing else on any screen reads `next_steps`** — one reader file, one page. The reason is written into the action, because a missing `revalidatePath` otherwise reads as an omission somebody should fix |
| **The refill is a button, not an automatic refresh** | Closing the last visible row could refresh and pull in the next five — and would delete the Undo on the five you just closed. So it is offered, and only once there is nothing left on screen to undo into |
| **`.eq('owner_id')` on the update, with `.select('id')` and an explicit refusal** | Without the select, a row that is not yours updates **zero** rows and PostgREST still reports success — the strip would say "Marked done" over a write that never happened. `db:verify` now asserts out loud that any member *can* close another member's next step, so nobody mistakes the owner filter for a security boundary. It is app policy: closing somebody else's work silently is rude, not forbidden |
| **Coming up now also waits for overdue to be empty** | Still open plus Coming up is ten rows above *Top focus* on the first screen anybody opens, which is the same argument that gated Coming up on Today in the first place. Overdue drains, so Coming up comes back on its own |
| **The whole strip became one client component** | The headings carry counts and a count that disagrees with the rows beneath it is worse than no count, so rows and counts have to live together. A per-row button island cannot mute its own parent row either. The **policy** — which sections may appear — stays in `page.tsx` and arrives as props |
| **`TodayMeeting` was renamed `NextStep`** | The name was already wrong (`fetchUpcomingNextSteps` never filtered `origin`) and an Overdue section that will one day hold a written commitment made it worse |
| **A row's title is a `<p>`, not the `<span>` it was** | `truncate` sets `overflow:hidden`, which an inline element ignores — so a long title pushed the new controls off a narrow screen instead of ellipsing. Pre-existing, invisible until there was something on the right to push |
| **The label moved to the second line, beside the account** | At 375px the row has ~295px, two buttons take ~121px of it, and "Thu 27 Aug, 7:00 AM" on the right would have left the title almost nothing. Measured in the browser at 375px: no overflow, `scrollWidth` 375 |

**Found in passing and NOT fixed: a rescheduled meeting never updates.** The migration comment
at `20260818090000_ingest.sql:107` says a calendar event that moves "is updated rather than
duplicated". It is not: the same `alreadySeen` short-circuit at `run.ts:195` means a new
`due_at` is never written back. Real, out of scope here, and worth knowing before trusting a
time on the strip.

**Tested end to end against the real database** under `qa-nextsteps@bealesllc.com` (admin,
rates), now **deactivated, do not delete** — with twelve disposable `next_steps` of its own,
so none of Ryan's rows were touched.

- *Still open · 2 from before today* rendered above everything, most recent first, and
  **Coming up was correctly suppressed** even though the QA login had a row a week out.
- Done left the row in place reading *"Marked done · Undo"*; `/admin/history` showed
  *"Status Open → Done · Completed — → Aug 21, 2026, 4:56 PM"* **changed by QA Next Steps**,
  which is the whole point — the three stale rows say "changed by —".
- Undo reopened it and cleared `completed_at`, proved in the database both ways.
- With nine overdue the aside read *"Showing 5 of 9"*; closing all five left five Undos and
  the line *"4 more still open. Show the next 4"*, which loaded them and re-read
  *"4 from before today"*.
- With a row due later today, **Today rendered BELOW Still open** rather than replacing it.
- At 375px both buttons fit, the title ellipses, `document.body.scrollWidth` is 375.
- The QA login could not close one of Ryan's rows: **0 rows affected, status unchanged**.
- With every QA row deleted the strip **disappears entirely** rather than sitting empty.

**Counts before and after are identical: accounts 23, contacts 100, live buildings 53,
activities 843, sites 51, deals 55, `ingested_items` 292 (181 linked / 14 needs review / 97
ignored), `ingest_runs` 14, `import_batches` 13, and MRR $46,086.33.** `next_steps` is back to
**5 — 2 open, 3 dismissed**, the same five ids with the same statuses. `audit_log` 2142 →
2179; **everything the QA login ever wrote is 34 rows, all on `next_steps`**, being its own 12
inserts, 10 status changes and 12 deletes, and nothing outside that table.

`db:verify` **223 → 227** — no migration, four behavioural checks: a member can mark their own
next step done, closing one records **who** closed it, undo clears the completion date, and
any member can close another member's (so the owner check is the app's job). `typecheck`,
`lint` and a cold `rm -rf .next && npm run build` all pass.

**The 14 `needs_review` items are all one collision: `90 Libbey`.** Eleven are Wound Center
inspections, three are Fox Rock conversations (Kristen Riordan, day porter hours), and one
names both 97 and 90. This is the documented consequence of the landlord/tenant split — Fox
Rock's `90 Libbey` and South Shore Health's `Wound Center (90 Libbey Pkwy)` both claim the
bare street phrase, so the matcher correctly refuses. A single `90 libbey` alias resolves all
fourteen and **misfiles the three Fox Rock ones**; that trade is Ryan's to make, not a
session's.

### What changed on 2026-08-21: a next step is visible before the day it happens

**`fetchUpcomingNextSteps()` was written, exported and called from NOWHERE.** Its own
docstring said *"Used by the dashboard when there is nothing on today"* — it was not. The
consequence was that **no screen anywhere showed a next step before the morning it
happened**: `fetchTodaysMeetings()` is a local-midnight-to-midnight window, so a meeting six
days out was invisible until the day it landed.

Found because the four wrong `46 Obery St` rows could not be seen on the dashboard at all,
which is also why nobody noticed them. *Next follow-up* is a different thing entirely —
`fetchMyFocus()` ranking **accounts** by how long they have gone quiet — and is easy to
mistake for this.

| Thing | Why it is the way it is |
|---|---|
| **"Coming up" renders only when today is empty** | What the function was built for, and it keeps the strip short. Showing both would put up to ten rows above *Top focus* on the first screen anybody opens, competing with the two panels that are already there |
| **It is fetched alongside today's, not after** | One indexed query capped at five rows — `next_steps_owner_idx` is `(owner_id, due_at) where status = 'open'` and covers it exactly. Asking for it only once today turned out empty would put a second round trip on the critical path of the dashboard |
| **`MeetingRow` is shared by both, and only the right-hand label differs** | Two copies of one row would drift, and this is the same argument as `ago()` moving into `@/lib/format` |
| **"Coming up" shows the DATE, "Today" shows the time alone** | `7:00 AM` with no day is useless six days out; the year is left off because nothing in a five-row upcoming list is months away. An all-day row shows the day and no time |
| **`fetchUpcomingNextSteps()` does NOT filter `origin = 'calendar'`, and that is right** | *Today* is about meetings. *Coming up* is about everything still open and owned by you, which is what 7d's written commitments will land in |

**Tested end to end against the real database** under `qa-upcoming@bealesllc.com` (admin,
rates), now **deactivated, do not delete** — with three disposable `next_steps` of its own,
so none of Ryan's rows were touched. With one due later today the strip read *"Today · 0 of 1
with a client we know · 7:22 PM"* and **Coming up was correctly suppressed** even though two
future rows existed; dismissing it flipped the strip to *"Coming up · Nothing on today"* with
*"QA — site walk next week · Thu, Aug 27, 4:22 PM"* above *"QA — all-day inspection · Sun,
Aug 30"* — soonest first, and the all-day row with no time. All three test rows were then
deleted. **`next_steps` is back to 5 — 2 open, 3 dismissed.** Also confirmed in passing that a
deactivated profile sees zero of everything even while holding a live session.

### What changed on 2026-08-21: four next steps from one weekly meeting — and why

**The bug was a DEPLOY GAP, not a matcher fault. Read this before touching `graph.ts`.**

The 07:51 UTC production run wrote **four** next steps from `46 Obery St Cleaning
Inspection`, one weekly series — 27 Aug, 3 Sep, 10 Sep and 17 Sep, all within 300ms. The
obvious suspect was Graph declining to return `seriesMasterId`, which would send every
occurrence through the `if (!series)` guard in `collapseRecurringSeries()`. It is not that,
and chasing it would have cost a second session.

`collapseRecurringSeries()` **was not running, because the commit holding it was not
deployed.** It landed locally on 2026-08-20 at 20:05 EDT (`40c41ab`); `origin/main` did not
move until 2026-08-21 at **14:33 EDT**. The run fired at 07:51 UTC — 03:51 EDT — roughly ten
and a half hours earlier, against `659bc91`, in which `git show 659bc91:src/lib/ingest/graph.ts`
finds neither `collapseRecurringSeries` nor `seriesMasterId`. This file's own "Still to do"
list had item 0 as *"Push. The 2026-08-20 hardening is committed and not yet pushed."*

`659bc91` **did** already carry the `/originalStart` suffix, which is why the four
occurrences got four distinct `external_id`s and four rows instead of colliding into one.

| Thing | Why it is the way it is |
|---|---|
| **`seriesMasterId` IS returned on a `calendarView` row** | Measured, not assumed. `npm run graph:probe` reads the live tenant as **70 events — 53 occurrences across 11 recurring series, 17 one-offs; 39 still ahead; 14 after collapsing.** It could not count 11 series without the field. 39 → 14 is exactly 11 series contributing their earliest plus 3 future one-offs, so **the collapse is now proved against real data**, which no session had managed before |
| **The sampled events all print `seriesMasterId: null`, and that is not a contradiction** | `calendarView` returns start order, and the first few in this window happen to be one-offs (`type` is 14 characters — `singleInstance`). It is the same sampling trap that made the `$top=5` probe wrong on 2026-08-20. **Read the counts the probe prints, never the sample** |
| **Nothing in the app could answer "is my fix live?", so now it does** | The Sources panel on `/admin/ingest` already reports what this deployment's environment holds; it now names the commit too, from `deployedCommit()` in `src/lib/env.ts`. `VERCEL_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_MESSAGE` are plain server variables set on every deployment, the same mechanism `siteUrl()` leans on. Locally it says so rather than leaving a gap |
| **The three stale rows were DISMISSED, not deleted** | Soft-delete is the standing rule, every reader filters `status = 'open'`, and the audit trigger on `next_steps` records it. Their `ingested_items` rows were deliberately **left alone**: they are a true record of what Graph returned, and the collapse means those occurrences are not fetched again until each becomes the earliest one ahead |
| **`audit_log.changed_by` is null on those three** | They were dismissed from the Supabase SQL editor, which has no `auth.uid()`. There is no UI for dismissing a next step, and building one for a three-row one-off correction was not worth it. It shows as "changed by —" on `/admin/history` |

**The lesson worth keeping: a commit that is merely committed is a commit that is not
running.** Vercel builds from `main`, so pushing *is* the deployment — and until this
session there was no way to tell the two apart from inside the app.

**Tested end to end against the real database, 2026-08-21**, under `qa-deploy@bealesllc.com`
(admin, rates), now **deactivated, do not delete**. The nightly job was run by hand twice,
which is the established pattern and writes real rows — a nightly run passes no
`import_batch_id`, so there is no Undo button for it.

- **The proof the collapse works, which no session had before: `nextStepsCreated: 0`.**
  84 seen, 5 ingested, 24 already known. The 27 Aug occurrence was already in the mirror
  pointing at a live row, so it reported as already-seen; 3, 10 and 17 Sep were collapsed
  out before they were ever mapped, so they were never touched.
- A second identical run created **nothing** — 84 seen, 0 new, 29 already known.
- `/admin/ingest` shows three runs with **"Earlier runs (7)"** collapsed, and the run of
  12 hours earlier reads *"124 seen · 9 new · 28 already known · 5 activities · **4 next
  steps** · 1 suggestion"*, which is the bug itself, on the screen.
- The Sources line reads *"Running locally, so there is no deployed commit to name."*
- The mailbox list read **six** addresses while the QA login was active — which is the
  panel doing its job, and why it names them rather than counting them. Five again after.
- `/activity` renders the *Show all* disclosure on 50 rows, all collapsed, each excerpt
  ending in an ellipsis, and clicking one opens it. Expect most existing Granola bodies to
  have one: 122 of 138 sit at exactly the old 500-character cap, which is over the
  threshold. Not a bug.

**Counts before and after: accounts 23 → 23, contacts 99 → 99, live buildings 53 → 53,
`next_steps` 5 → 5, and MRR $46,086.33 → $46,086.33.** Activities 838 → **843** and
`ingested_items` 287 → 292 — five real new emails and notes, which is the feature working
rather than test residue. `ingest_runs` 12 → 14, the two hand-runs.

`db:verify` **223/223, unchanged — there is no migration in this work.** `graph:probe
--selftest` **41/41**, `typecheck`, `lint` and a cold `rm -rf .next && npm run build` all
pass.

**One thing the browser pass could NOT check: the dashboard.** `fetchTodaysMeetings()` and
`fetchUpcomingNextSteps()` both filter `owner_id = <you>`, and the four Obery rows are
Ryan's, so a QA login sees none of them. **Ryan verifies "one 46 Obery St row, not four" on
his own dashboard after running the dismissal.**

### What changed on 2026-08-21: a Granola note is now kept whole

**Read this first if you are a later session: nothing here needed a migration**, so
`db:verify` is still **223**, and the two probe self-tests grew instead — `granola:probe`
14 → **30**, `graph:probe` 35 → **41**. That is where the new rules are pinned, because the
repo still has no unit runner and both probes run with no network and no credentials.

**This session ran in a cloud container with no `.env.local` and no database access**, so
nothing below was verified in a browser or against the real data. Everything was proved by
the self-tests, a cold build, and one component rendered to static markup by hand. Ryan's
browser pass is still outstanding at the time of writing.

| Thing | Why it is the way it is |
|---|---|
| **A Granola note keeps its whole summary; an email is still cut at 500** | `granola.ts` had already downloaded the entire summary and `toSnippet` threw about two thirds of it away — no API call and no bandwidth saved by the cap, just less note. Mail stays capped because *"no full bodies, ever"* is a promise about a **mailbox**, not about text in general, and it costs nothing to keep: `graph.ts` asks only for `bodyPreview`, which Graph caps at 255, so 500 is a stated ceiling rather than an active cut |
| **`BODY_LIMIT` is an exhaustive `Record<IngestSource, number \| null>`** | Ten entries, one per `activity_source` value, `granola` the only `null`. A new enum value makes **that object** fail to compile naming the source it is missing — the same guarantee an exhaustive switch buys, written as a table you can read. A `Partial` with a default would have been shorter and would have let a future connector inherit an answer nobody chose |
| **…and it is keyed on the ITEM's source, never on the source descriptor** | The descriptor's `name` is a display string. One connector called `graph` emits **both** `outlook` and `outlook_calendar` items, and `fixtures.ts` emits items marked `outlook` too — so a per-descriptor limit could not express the two separately, and would have capped a fixture row and a real Graph row differently while every stored field on them was identical |
| **Only `activities.body` changed. The mirror snippet and `next_steps.detail` are still 500** | Three call sites, one changed, and the two that did not now say so in a comment. The mirror is a **review aid**: `/review` and `/admin/ingest` are lists somebody triages, and a 1,400-character block per row turns a triage queue into a reading queue. `next_steps.detail` is graph-only in practice — a Granola note is never future-dated — and nothing renders it yet anyway |
| **A summary is a DOCUMENT, not a paragraph, and that was measured** | One real note pulled through the Granola connector: *46 Obery St, 20 Aug inspection* — about 1,700 characters across five headed sections with bullets, nested sub-bullets and blank lines between blocks. `toSnippet` flattens all whitespace, which is right for a 500-character extract and destroys this. So `toBody` keeps the shape |
| **Multi-line bodies were NOT new to the column** | `src/lib/import/activities.ts:144` has always joined an outcome and a next step with `\n\n`, and both render sites already carry `whitespace-pre-wrap`. `toSnippet`'s flattening was the odd one out, not the rule — which is why this needed no render change beyond the clamp |
| **Leading indentation survives; trailing whitespace does not** | It looks like whitespace worth collapsing and is not. Once the markdown fallback has had its list markers taken off, a sub-point's **indent is the only thing left** saying it was a sub-point. Tabs become two spaces so one nesting level is one nesting level however it was typed. Found by rendering the component and reading the output, not by reading the code — the first version stripped the indent while a comment two files away claimed it was kept |
| **CRLF is normalised FIRST, and the order is load-bearing** | Tidy the spaces before that and the stray `\r` is eaten as one of them, so the rule reads as though it never did anything |
| **The markdown fallback is stripped, the primary path is not** | `fetchText` returns `summary_text ?? summary_markdown`, and the repo's own measured note says `summary_text` arrives plain while the markdown is *"the same content with list markers"*. Flattened into 500 characters a stray `###` never showed; stored whole it would render literally down the middle of the timeline. `stripListMarkers()` is deliberately **not** a markdown parser — heading hashes and leading bullets, nothing else |
| **A clamp had to come with an EXPANDER, because there is no activity detail page** | `src/app/(app)/activity/` holds `actions.ts` and `page.tsx` and nothing else. The timeline `<p>` is the **only** place in the app a note can be read, so clamping without a disclosure would have stored 1,400 characters and shown 240 of them for ever |
| **The excerpt goes in the `<summary>`, not the whole note under a `line-clamp`** | The tempting version puts the body inside the summary and toggles `group-open:line-clamp-none`. A `<summary>`'s text content is its **accessible name**, so that would have a screen reader announce the entire note as the button's label, every time, with no way past it. This way the label is bounded at ~240 characters, and the copy people select and paste is an ordinary paragraph that does not toggle when clicked |
| **`ActivityBody` is shared, because the two render sites were byte-identical** | `activity-timeline.tsx` and `activity/page.tsx` carried the same three lines. Granola notes are stored whole now, so both would have grown the same clamp on the same day and drifted the first time only one was touched. Same argument as `ago()` |
| **`EXCERPT_LENGTH` is 240 and is deliberately NOT `SNIPPET_LENGTH`** | One is about what gets stored and why; the other is about how much vertical space a row of a 200-row feed may take. Tying them would let a storage decision silently relay out every screen. `WORTH_HIDING = 80` on top, because a "Show all" that reveals one more line is more annoying than the line |
| **`RawItem.text`'s doc comment had to be REWRITTEN, not left** | It promised *"the full text never lands in the database"*. That sentence is now false for Granola. Comments are treated as rules in this repo, so a stale one would have had a later session revert this thinking it was the policy |
| **`splitName` lost the suffix a shared mailbox carries** | *"Eley, Thelma @ Charlotte"* split on the comma and produced a **first name** of "Thelma @ Charlotte"; *"Nick Deletsky / Anthony"* has no comma, so the last word won and it came out first "Nick Deletsky /", last "Anthony". Both are real, both came through the nightly ingest as contact suggestions. The spaces around the separator are required, which is the whole safety of it — `O'Brien-Smith` and an address that reached the function by accident are untouched. It can still keep the wrong half if a mailbox is ever written *"Reception / Jane Smith"*, and that is accepted: it is a name on a suggestion somebody reads and can edit before accepting |
| **Three runs on `/admin/ingest`, the rest behind a disclosure** | The panel listed all ten it fetched and pushed the sources and the domain map off the screen. It still **fetches ten**, so the 26-hour staleness rule is untouched — that is read off `runs[0]` inside `fetchRunHealth`, before anything renders, so what is displayed cannot reach it |
| **…and the disclosure is a SIBLING of the list** | `<details>` is not valid as a direct child of `<ol>`, so it is two lists with the disclosure between them. The summary carries a run row's own `px-2 py-2.5` and `border-b` and the second `<ol>` has no `border-t`, so the hairline rhythm runs straight through the seam open or shut. It says *"Earlier runs (7)"* — how many are **hidden**, not how many exist, because `ingest_runs` has no delete policy and ten is only the window this panel fetches |

**Forward-only, and that is Ryan's call rather than a limitation.** The ~138 Granola activities
already in the app keep their 500-character bodies: `ingestOne` short-circuits at `run.ts:195`
on any item already `linked` with something behind it, so nightly re-runs will never revisit
them. The door is not locked — the backfill stamped an `import_batch_id`, so undoing that batch
at `/admin/import` and re-running `granola:backfill --commit` would bring the archive back at
full length. It is not clean (it deletes and recreates real activities, and anything a nightly
run ingested since carries no batch id), which is exactly why forward-only was the right call.

**What it costs, measured rather than waved at.** `activities` is in the `audited` array, so
every insert copies the whole row into `audit_log.new_values` — the body is stored **twice**.
Ryan's ~300 KB of history and ~3.25 MB/year become roughly **600 KB and 6.5 MB/year**. It is a
one-time doubling per note rather than a growing one: the job inserts an activity once and never
updates it. The mirror staying at 500 is what holds it to two copies rather than three, and
`ingested_items` is deliberately not audited. A nightly insert never *prints* a body on
`/admin/history` either — `src/lib/audit/index.ts:36` leaves the change list empty on an insert —
so only a hand edit of an ingested note would, and `record-history.tsx` renders that unclamped.
Left alone deliberately: a diff has to be literal.

**Two things to expect in the browser, neither of them a bug.** 122 of the 138 existing Granola
bodies sit at exactly 500 characters, which is over the 320-character threshold, so **they get a
disclosure too from day one** — the feed gets tidier, and if that is unwanted the threshold is
one number. And a collapsed `<details>` still carries its full text in the DOM, so `/activity` at
200 rows gets heavier; if that ever bites, the fix is a lower **row** limit, never a `substring()`
in the query or a second hidden ceiling, which would be a second truncation number destined to
drift from the first.

### What changed on 2026-08-20: the first production runs, and what they exposed

**The first two production runs including Graph fired at 07:51 and 09:45 UTC.** Both clean over
`{fixtures, granola, graph}`. The first ingested 2 items — the *42 Industrial* thread with Kristen
Riordan at Fox Rock, inbound and outbound, both `exact`; the second ingested nothing, which is
idempotency working. **Vercel Hobby cron is approximate to the hour**: `vercel.json` says 07:00 and
09:00 and they landed 45 and 51 minutes late. Do not read a late run as a broken one.

Chasing the two things 7b had never proved turned up one bug worth more than either.

| Thing | Why it is the way it is |
|---|---|
| **A contact with no account used to match NOTHING, and most of the book has no account** | `matchParticipants` matched contacts by address, reduced them to the set of their non-null `account_id`s, and returned a match only when that set held exactly one. An accountless contact contributes nothing to that set, so it counted for nothing — and **63 of the 99 live contacts have no account, 47 of them with an address**. It was doing it in production every night: `meghan.szafran@cancer.org`, a contact since the August import, was sitting on `/review` in the "people writing in from somewhere we don't know" list. A sole accountless contact is now an `exact` match with a **null account**, which is honest rather than invented. **It does NOT backfill:** `set_activity_account()` is a BEFORE trigger on `activities`, so giving her a contact record an account fills the account in on her *next* activity and leaves the ones already written alone (corrected 2026-08-21 — this line used to say "fills it the day she gains one", which is wrong) |
| **…and the domain tier now carries the contact too** | It hardcoded `contactId: null`, so a known person at a mapped domain was linked to the company and then thrown away. The account still wins — an account is worth more than a person — but both are kept |
| **TWO accountless contacts is still nothing** | Deliberate, and it bites immediately: `jfallon@` and `lwebber2@bwh.harvard.edu` are both accountless contacts, so a message naming both refuses while a message naming one links. The fix is data — map `bwh.harvard.edu`, or give either of them an account — not code |
| **Recurring meetings are the NORM, and this file said they did not exist** | It recorded that every event in the tenant was a `singleInstance` and that the occurrence path had never met real data. That came from a probe capped at **`$top=5`**, and `calendarView` returns events in start order, so the sample was five one-offs. The real window holds **40 occurrences across 11 series** against 8 single instances |
| **…so a standing meeting would have written five next steps** | 35 future occurrences of 11 meetings inside `FORWARD_DAYS = 30`. `collapseRecurringSeries()` keeps every occurrence that has **already started** — each of those really did happen — and only the **earliest still ahead** of each series. Stable rather than merely smaller: the earliest is still the earliest two hours later, so the second nightly pass touches a timestamp, and once it passes the one after it takes its place. A series rolls forward a meeting at a time |
| **Two documented Graph facts are wrong, neither harmfully** | `originalStart` **is** populated on an occurrence, so the schema's rule holds. But occurrences do **not** share the series master's `iCalUId` — Graph gives each its own, 40 ids for 40 occurrences — so the `iCalUId + '/' + originalStart` suffix was already belt and braces rather than the thing keeping them apart. It stays, for a tenant that behaves as documented. `seriesMasterId` is populated and is what the collapse groups on |
| **The probe now COUNTS the window before sampling it** | `$top` raised 5 → 200, and it prints how many events, how many are occurrences of how many series, how many are ahead, and how many would become next steps. The old output was the reason this file was wrong for a day: a sample answers "what does this look like" and never "what is in here" |
| **The unknown-sender tray could be crowded out by Granola** | `fetchUnknownSenders` asked for the 25 most recent `ignored` rows, and `ignored` covers two different things — 14 real senders and 84 Granola notes that matched nothing, which by design carry no participants at all. Nothing looked wrong only because mail is touched last each night. It now asks for `external_id like 'unknown:%'`, which is exactly the tray |
| **Contacts can be archived from `/admin/cleanup`** | `archiveRecord` has accepted `'contacts'` since it was written and the action is generic; only the page never rendered them, so the one sanctioned way to archive a contact was no way at all. It matters because an archived contact stops being matched by the nightly ingest, which is how a former colleague comes back out of it. Contacts get a filter where accounts and buildings do not — 22 and 53 rows read fine as a list, 99 does not |
| **`npm run user:remove` exists, and mostly refuses** | Deactivating is still how somebody leaves. This is for a profile that turned out not to belong in the app at all, and **anyone with a single `audit_log` entry cannot be removed at any flag** — that is why the QA logins are kept. It cannot half-finish: every FK to `profiles` is NO ACTION bar one, so once the owner columns are reassigned the delete either succeeds or Postgres refuses the whole thing and names the constraint. Dry run unless `--commit` |

**Brendan Mulligan has been removed from the app, on Ryan's instruction.** His profile had **zero**
audit rows, so nothing historical was lost. It owned the **Dermatology of Cape Cod** account and
building and had logged one activity (24 Mar); all three went to **Ryan Beale**. His **contact row
was archived, not deleted** — it carries two March coaching notes about his performance, and the
standing rule here is soft-delete only. He was the one internal address leaking into the client
matcher, because a deactivated profile drops out of `colleaguesByEmail` and reads as an outsider
from then on.

**All five colleagues also exist as `Internal` CONTACT rows.** The four active ones are harmless
because `colleaguesByEmail` catches them. Worth knowing before deactivating anybody else.

**`contact_role` is free text and is NOT safe to build matcher logic on.** Nineteen distinct values
came across in the import — `Client Contact` (34), `Client` (4), `Active Client Contact` (1),
`Prospect Contact` (1) and so on. It reads like a lever and is not one.

### Tested end to end, 2026-08-20

Under `qa-7bh@bealesllc.com` (admin, rates), now **deactivated, do not delete**. The nightly job was
run by hand twice against the real database, which is the established pattern and writes real rows —
a nightly run passes no `import_batch_id`, so there is no Undo button for it.

- **The first `next_step` in the app's life.** *Monthly BI Inspection*, due 2026-09-19, owner Ryan,
  contact **Brittany Hampton**, account **null** — she is an accountless contact, which is precisely
  the case that could not match this morning. Its `external_id` ends `/2026-09-19T14:00:00Z`, so the
  occurrence suffix is proved on real data.
- **And exactly one, from six occurrences of that series in the window.** The 19 Aug occurrence had
  already happened, so it became an **activity**; only the next one ahead became a next step.
- 17 activities in total: 7 Granola notes against the BILH and Contemporary Dermatology buildings
  Ryan created that afternoon, plus 10 emails — three to Meghan Szafran and one to Jessica Fallon,
  **both accountless contacts who were in the strangers tray that morning**, alongside domain-tier
  matches to Beth Israel and Tufts Medicine.
- A second identical run created **nothing**: 102 seen, 0 new, 28 already known. No second next step.
- `/api/cron/ingest` still returns **401** with no header, not a redirect.
- The Archive button on `/admin/cleanup` archived Brendan's contact and wrote its audit row; the
  filter reported *"Showing 1 of 99"*; the tray on `/review` lost Szafran and Brendan and kept the
  12 genuine strangers plus the two `bwh.harvard.edu` contacts described above.
- `db:verify` **223/223, unchanged — there is no migration in this work.** `graph:probe --selftest`
  **17 → 35**, `typecheck`, `lint` and a cold `rm -rf .next && npm run build` all pass.

**Counts before and after: accounts 22 → 22, live buildings 53 → 53 (50 active / 2 pending / 1
lost), deals 55 → 55, sites 51 → 51, contract periods 12 → 12, and MRR $46,086.33 → $46,086.33.**
Contacts 99 → 98 (Brendan archived). Activities 816 → 833, `next_steps` 0 → **1**,
`ingested_items` 261 → 280, `ingest_runs` 8 → 10, `audit_log` 2075 → 2099. The mailbox list reads
**exactly five addresses** again now the QA login is deactivated.

**One thing left on `/review` deliberately: a `create_contact` suggestion for
`thelma.eley@cbre.com` at Tufts Medicine, whose first name parsed as "Thelma @ Charlotte" from an
Outlook display name of "Eley, Thelma @ Charlotte".** Ryan's to accept, edit or dismiss.
**`splitName` was fixed on 2026-08-21** so it stops happening, but only for contacts suggested
from then on — this suggestion and any row already created from one are a data fix.

**Two things this session did NOT prove.** No calendar event has yet matched on the DOMAIN tier —
the one that worked was a contact. And of Ryan's 11 recurring series only that one matches anything
at all; the other 10 stay invisible until a domain is mapped or a contact gains an account.
`bidplymouth.org`, `bbmfacility.com` and `bostonbuildingmaintenance.com` are the three that appear
on real meetings and are unmapped.

### What changed on 2026-08-19: Phase 7b, mail and calendar

The connector is live and reading Ryan's mailbox. **Everything below was measured with
`npm run graph:probe`, not taken from documentation** — and three of the shapes are not what the
docs imply.

| Thing | Why it is the way it is |
|---|---|
| **`graphTime()` is the most dangerous line in the file** | Graph returns a calendar time as `"2026-08-06T15:00:00.0000000"` with the zone in a **sibling field** and no marker on the string, so `new Date()` reads it as LOCAL. In Boston that is every meeting four or five hours out, silently, for ever, and nothing would look broken enough to investigate. Six self-tests around it, including one that **refuses** rather than guessing if Graph ever answers in a non-UTC zone |
| **It never asks for a body** | `$select` takes `bodyPreview` only, which Graph caps at **255 characters** — so the 500-char snippet limit can never be filled, and that is fine. It makes "no full bodies, ever" a fact about the network traffic rather than a promise about storage: there is no copy to leak because none is fetched |
| **Inbox and Sent Items by name, not `/messages`** | `/users/{id}/messages` sweeps every folder including Junk and Deleted Items. A spoofed message from a known contact's address sitting in Junk must not become an activity |
| **`internetMessageId`, never `id`** | Confirmed on real data: Graph's `id` changes when a message is filed, so the same email would arrive again as new. 84 characters outbound, 58 inbound from Gmail |
| **A 403 is the expected answer, not an error** | Four of the five mailboxes are outside the ingest group and answer 403 every night. Counted, not raised. But if **nothing** is readable it throws, because that means tonight achieved nothing and tomorrow will too |
| **No Granola↔calendar join, deliberately** | Measured before deciding: **1 of 17** notes carried a calendar event at all, and that one matched no Outlook meeting. The two sources barely intersect — Granola captures site inspections dictated into a phone, Outlook holds scheduled meetings. Building a reconciliation for a collision with no real example is the speculative machinery this project has refused twice. **The risk is recorded rather than built for:** a meeting could in principle produce both a calendar activity and a note activity. If it ever shows up, build the join then, on `scheduled_start_time` ↔ `start.dateTime`, with a real case to test against |
| ~~**The recurring-meeting rule is written blind and says so**~~ | **Superseded 2026-08-20 — this row was WRONG.** It said every event in the tenant was a `singleInstance` and the occurrence path had never met real data. That came from a probe capped at `$top=5`; Ryan's calendar is 40 occurrences across 11 series. `originalStart` IS populated, occurrences do NOT share the master's `iCalUId`, and `collapseRecurringSeries()` now keeps one next step per series. See the 2026-08-20 section |
| **`/admin/ingest` says which connectors this deployment can use** | A *Sources* panel reading `hasGraphEnv()` / `hasGranolaEnv()` at render time. Before it, the only way to learn a credential had not reached production was to wait for 3am and read the `sources` column of a run that had already happened. It also states the thing that catches everybody: **a variable added in Vercel only takes effect on the next deployment** |
| **It NAMES the mailboxes rather than counting them** | It first read *"6 mailboxes will be tried"*, which looks fine until you remember there are five people. The sixth was a QA login created ten minutes earlier — `fetchMailboxes()` returns every active non-service profile, and a QA account is one until it is deactivated. Six addresses makes the wrong one obvious; a count never could |
| **`fetch` had no timeout anywhere** | Found by a probe run that looked like a hang and was merely slow. `granola.ts` could stall until Vercel killed the function at 300s — and a killed function cannot record why it died. Both clients now cap a request at 20s |

Where things live: `src/lib/ingest/graph.ts` (the connector), `scripts/graph-probe.ts`
(`npm run graph:probe`, and `-- --selftest` for the 17 checks that need no network), plus the
route wiring. `makeGraphSource(creds, mailboxes)` closes over the mailbox list because
`SourceFetch` takes only `{ since, deadline }`.

**Tested against the real mailbox on 2026-08-19.** Nine emails from the last two days matched
known contacts on the `exact` tier and became activities on the right accounts, inbound and
outbound correctly told apart; thirteen strangers were recorded as an address and nothing else;
two calendar events matched nothing and were left as id-and-date; a second run created **nothing**
(112 seen, 0 ingested, 14 already known). `db:verify` 223/223, the probe self-test 17/17,
typecheck, lint and a cold build all pass.

**Activities moved 804 → 814** — ten real emails, which is the feature working rather than test
residue. Accounts, buildings, contacts, deals, sites and **MRR $46,086.33** are all unchanged.
One `create_contact` suggestion is waiting on `/review` and is Ryan's to accept or dismiss.

**Two things the run has NOT proved.** No calendar event has yet become a `next_step`, because
none in the two-day window matched anything — the mechanism was proved in 7a with a disposable
account, but not with a Graph item. And no recurring meeting has been seen at all.

### What changed on 2026-08-19: the 7b groundwork

Not the connector — the half of it that does not depend on seeing a real Graph message. Two
things came out of reading the 7a spine, and the first is the reason this session exists:

**Nothing had ever recorded whether the nightly job ran.** The only trace was the JSON the route
returns and Vercel's own cron log. `/admin/ingest` reported the last time something was
*ingested*, which only moves when there is something to ingest — so a quiet week and a dead cron
were indistinguishable, as were a failed sign-in and a rotated Granola key. That was live for the
Granola ingest already running in production.

**`runIngest` was throwing the source's `cursor` away.** Granola has always returned
`cursor: 'truncated'` when it stopped short, with a comment saying a short run must be "visible
rather than silent", and `run.ts` destructured only `{ items }`. The signal existed and went
nowhere.

| Thing | Why it is the way it is |
|---|---|
| **The run row is written when the run STARTS, not when it finishes** | A run killed mid-flight — a timeout, the platform pulling the plug — leaves a row saying it never finished, which is exactly the failure the table exists to surface. A row written only on success is missing precisely when it matters. `ok` null plus a `started_at` older than twice `maxDuration` is "died"; `ok` null and recent is "running now" |
| **A failed SIGN-IN cannot be recorded, and the screen says so** | Writing the row needs the session that just failed. So that case leaves no row at all — the same shape as the cron never firing. Both are caught by **staleness**: `/admin/ingest` flags when nothing has run for over 26 hours (it runs twice a night) and points at the Vercel log. Staleness is the load-bearing signal, not the rows |
| **`sources text[]` records which connectors were switched on** | "Granola was not configured" and "Granola found nothing" are different facts and would otherwise both read as zero. Proved by running with the key blanked: the row says `{fixtures}` rather than `{fixtures,granola}` |
| **No delete policy on `ingest_runs`, not even for an admin** | Nothing in the app removes a run and a history of failures is worth more than a tidy table. Asserted in `db:verify` |
| **Not audited** | Machine-written twice a night. Auditing it would grow `audit_log` faster than the thing it records — the same call `ingested_items` made |
| **There are NO delta tokens and no cursor table, deliberately** | The original 7b sketch had them. The existing design already refuses: *"idempotency lives in `ingested_items`, which is one fact rather than two that can disagree"*. A durable cursor would be that second fact. Mail does not need it — an email never changes, and `$filter` on a received date plus a two-day lookback is enough for a nightly job. Calendar events *do* change, and a rolling window re-read handles that because the mirror makes a re-seen item a timestamp touch |
| **No `ingest_mailboxes` table either** | The Entra security group decides who is readable, and the app cannot read that group: `Group.Read.All` was never consented and would let this client id enumerate every group in the company. So the app asks for all five active non-service profiles and lets the **ApplicationAccessPolicy** answer — a 403 is recorded as "not in the ingest group", not as a fault. The policy stays the boundary; the list only says who we try |

Where things live: `supabase/migrations/20260823090000_ingest_runs.sql`,
`src/lib/ingest/runs.ts` (`startRun` / `finishRun` / `failRun`, called from the **route** so a
directory-load failure is still recorded), `src/lib/ingest/run-health.ts` (`fetchRunHealth`,
`died`, the 26-hour staleness rule), `src/lib/ingest/mailboxes.ts`, and `graphCredentials()` /
`hasGraphEnv()` in `src/lib/env.ts`. The *Last run* panel is at the top of `/admin/ingest`.

**Tested against the real database** by running the job by hand four times, under
`qa-phase6b@bealesllc.com` (reactivated for the test, now **deactivated again, do not delete**).
Proved: 401 without the secret; a real run recorded clean at 3.7s over `{fixtures,granola}`; an
identical second run created nothing (8 seen, 0 new, 4 already known); two runs with the Granola
key blanked recorded `{fixtures}` alone; and the stale banner fired reading *"Nothing has run for
40 hours"* after backdating the rows, which were then restored. `db:verify` **216 → 223**,
typecheck, lint and a cold build all pass.

**One thing that moved and should stay moved:** running the job by hand did tonight's real
Granola ingest about twelve hours early, so **activities went 800 → 804** — four site
inspections from 2026-08-19 (Cancer Center, 797 Main St, Wound Center, 187 Ballardvale), each
matched to both an account and a building. Real data, not test residue. `ingested_items` 233 →
237 for the same reason, and `ingest_runs` holds the four test runs. Accounts, buildings,
contacts, sites, deals and **MRR $46,086.33** are all unchanged.

**Also confirmed while testing: the production cron IS firing.** The two `.invalid` stranger rows
in the mirror are stamped 07:08 UTC on 2026-08-19, which is the real nightly run, not a local
one. **Every migration is applied to `beales-crm`**, including `20260821090000_search.sql`,
`20260821091000_profile_audit.sql`, `20260821092000_audit_rate_privacy.sql` and
`20260822090000_audit_recent.sql`. 6a is pushed and deployed; **6b is committed but not yet
pushed**.

### What changed on 2026-08-19: Phase 6b, the audit-log screens

Two thousand audit entries had been accumulating since the first migration with no screen
anywhere reading them. Now every record has a **History** — a tab on accounts and deals, a
section on buildings and contacts — and an admin has `/admin/history` across everything.

| Thing | Why it is the way it is |
|---|---|
| **The renderer is an allowlist twice over: which tables, and which fields** | Exactly the `gap_fill_allows()` argument. A denylist starts printing a new column the day somebody adds one. Eleven tables in `src/lib/audit/fields.ts`; `match_aliases` / `profile_email_aliases` / `account_domains` are left off as admin plumbing already visible on `/admin/ingest`, and `projects` has no screens yet |
| **Both rate tables are off the list, though 6a already fixed the policy** | Two independent locks on one door. The database now refuses those rows to anyone without `sees_rates`; leaving the tables off the renderer as well means the screen would still not print a rate if that policy were ever reverted |
| **`annual_value` is suppressed everywhere** | It is a generated column, so it changes on every single `monthly_value` edit and would print the same change twice, once per month and once per year |
| **A building's History folds in `building_contract_periods`** | The money is what anybody opening a history is looking for, and it does not live on `buildings`. No join needed: a period row carries `building_id` in its own snapshot, so the filter is `new_values->>building_id` |
| **…and one price change writes TWO entries, of which one is dropped** | `set_building_monthly_value()` inserts the new period and updates the old one's `end_date`. The second is the same call tidying up after itself. `isPeriodBeingClosed()` drops it **by name**, so nobody deletes it as dead code — and `db:verify` asserts both that the closing shape exists and that a `correct_open_contract_value()` edit, which touches the same table, survives the rule |
| **The subject comes from the entry's own snapshot, never a lookup** | `new_values->>'name'`, so a record archived since still reads by name rather than as a uuid |
| **`src/lib/reference.ts` is NOT reused for the uuid lookups** | `getOwners()` excludes service accounts — which is precisely the profile that wrote every ingest row — and most of the others filter `is_active = true`, so a diff naming a retired stage or competitor would render "— ". `src/lib/audit/names.ts` filters nothing, because history has to name what was true at the time |
| **The feed hides import rows by default, and says how many** | 1,544 of the 1,855 allowlisted entries are spreadsheet imports, which have their own screen and their own Undo at `/admin/import`. Hiding them silently would be the dead-number mistake this app argues against, so the toggle names the count |
| **`ago()` moved from `activity-timeline.tsx` into `@/lib/format`** | It was module-private and the two timelines sit on the same page; two ways of phrasing "3 days ago" on one screen is the "two implementations disagree" rule in miniature |
| **A bug found in the browser: a page past the end 416s** | PostgREST answers an out-of-range `range()` with *"Requested range not satisfiable"* rather than an empty list, so `?page=2&table=buildings` rendered an error where it should have said "nothing here". It counts first now and skips the query |
| **`(app)/not-found.tsx` AND `src/app/not-found.tsx`** | The eight `notFound()` callers all live in the group, so they keep the sidebar — the fastest thing after a dead link is the nav you were already using. A URL matching no route has no shell, so that one carries the logo and its own way home |
| **`global-error.tsx` does not re-import Montserrat** | That font import is why `next build` is pinned to `--webpack`. A second copy is a second way to break a cold build, for a screen almost nobody will ever see. The body stack is Arial-first anyway |

One migration, `20260822090000_audit_recent.sql`: an index on `audit_log (changed_at desc)`.
`audit_log_record_idx` is `(table_name, record_id, changed_at desc)` and serves one record's
History exactly; the feed orders by time alone and had nothing.

Where things live: `src/lib/audit/fields.ts` (the allowlist, `TABLE_META`, `subjectName`),
`src/lib/audit/names.ts` (batched uuid→name), `src/lib/audit/index.ts` (`fetchRecordHistory`,
`fetchAuditFeed`), `src/components/record-history.tsx` (`RecordHistory` and the shared
`HistoryLine`), `src/app/(app)/admin/history/page.tsx`.

**Tested end to end against the real database** under `qa-phase6b@bealesllc.com` (admin, rates)
and `qa-phase6b-field@bealesllc.com` (field, no rates), both now **deactivated, do not delete**.
Proved: a health-score edit appears immediately as *"Changed by QA Phase 6b · just now · Health
— → Needs attention"*, and reverting it appears as its own entry; the 91 Longwater Drive
correction from Phase 5 renders as *"Monthly value $30,000 → $2,500"* under a **Contract value**
chip on the building's own page; owner uuids resolve to *Robert Mulligan* and *Jon Beale*; the
feed's import toggle reads 1,544 and the per-table count matches the database exactly (90 for
buildings); a field user is turned away from `/admin/history` and still sees each record's own
History; both 404s render correctly; `?page=2` on a 30-row filter says "Nothing here yet".
Company numbers identical before and after — **21 accounts, 46 live buildings (43/2/1), 97
contacts, 800 activities, 44 sites, 55 deals, MRR $46,086.33**. `audit_log` moved 2008 → 2010,
which is exactly the one test edit and its reversal. `db:verify` **208 → 216**, typecheck, lint
and a cold `rm -rf .next && npm run build` all pass.

### What changed on 2026-08-19: Phase 6a, global search

⌘K on a laptop, a Search button in the header on a phone. It searches **buildings, accounts,
contacts and deals** — deliberately not activities, because 800 rows of free text would drown the
four things anybody navigates to.

| Thing | Why it is the way it is |
|---|---|
| **One Postgres function, not four PostgREST queries** | There were already TWO implementations of "find a record" — `searchRecords()` in `activity/actions.ts` fanning out three ilike queries for Quick Add, and a `q` filter on each of six list pages — and a palette would have made a third. Quick Add now calls the same function, so the two can never rank the same records differently |
| **…and ranking across types is only possible in one query** | The old fan-out could only interleave three result sets by a fixed order, which is why buildings always came first however badly they matched. Now 3 = the field equals the term, 2 = starts with it, 1 = contains it, and an exact hit on an account name beats a partial hit on a building |
| **`search_records()` is SECURITY INVOKER, and says so in a comment** | It is the default, written down so nobody "tidies" it to definer: the caller's own RLS decides what comes back, exactly as on the list pages. A definer function would hand every row to anyone holding the public key |
| **Plain `ilike`, no `pg_trgm` and no tsvector** | Nothing in this schema installs an extension and `db:verify` runs a bare PGlite with none available, so reaching for one would take the whole schema out of test on the day it was added. Over 21 accounts and 46 buildings it is instant |
| **LIKE metacharacters in the term are escaped** | Somebody typing `90_Libbey` is looking for an underscore, not for any character at all |
| **Each kind is capped at 8, the whole result at 20** | Typing "st" must not fill the list with 40 buildings and hide the account somebody was after |
| **The trigger is in the header, not a second FAB** | The bottom-right corner belongs to Quick Add, and its position is the whole reason logging is fast; two floating circles would cost it that. The header is sticky, so search is one tap at any scroll position, and it is `h-9` on a phone against the app's usual `h-7` because 28px is under every thumb-target guideline |
| **Radix Dialog from the umbrella `radix-ui` package, not `cmdk`** | Focus trap, scrim, Escape and the aria wiring for no new dependency. `cmdk` would have been a new direct dep next to the umbrella pattern, and then needed re-styling anyway |
| **A trap worth knowing: Radix only calls `onOpenChange` when RADIX closes the dialog** | Closing it from our own code — which is what pressing Enter on a result does — skips the reset, so the next ⌘K opened on the last search somebody ran. Every close goes through `onOpenChange` now. Found in the browser, not by reading |
| **`/` opens it, but never while you are typing** | Guarded on `INPUT` / `TEXTAREA` / `SELECT` / `contentEditable`, tested by typing `north/river` into the deal filter box |
| **Closed and lost records still appear** | Unlike the Granola phrase book, which admits only OPEN deals because a phrase from a deal closed two years ago would misfile tonight's note. Search is navigation, not matching: somebody looking up a past deal wants to find it |

**The two audit migrations, each its own commit.** `profiles` now has the edit-history trigger the
`audited` array left out, so a role change on the People screen is recorded rather than vanishing.

And a **live leak was found and closed while planning the 6b screen**: `employee_compensation` and
`employee_assignment_rates` are both audited, so every pay rate ever set was sitting in
`audit_log.new_values` as raw jsonb — and `audit_log_select` tested only `is_member()`. Anyone who
could sign in could read every rate change off `/rest/v1/audit_log`; the rate tables' RLS was being
walked around by their own history. Fixed in the **policy**, not in the screen, because a screen
only protects itself and a report, a CSV export or a request from a phone all go around it.
**6b should still render the feed from an explicit allowlist of tables** — a denylist would start
printing a new rate-carrying table the day somebody audits one, which is the `gap_fill_allows()`
argument exactly.

Where things live: `supabase/migrations/20260821090000_search.sql` (the function),
`src/lib/search.ts` (`SearchHit`, `SEARCH_KINDS`, `PLACE_KINDS`, `hrefFor`, the single `rpc` call),
`src/app/(app)/search-action.ts` (`search()` and `searchPlaces()` — a file at the route-group root
exporting only actions creates no route), `src/components/global-search.tsx` (the palette).
`activity/actions.ts` lost its 60-line fan-out.

**Tested end to end against the real database** on 2026-08-19 under two temporary logins,
`qa-phase6@bealesllc.com` (admin, rates) and `qa-phase6-field@bealesllc.com` (field, no rates),
both now **deactivated, do not delete**. Proved: ⌘K and `/` open it and `/` does not while typing;
"Libbey" returns all three live buildings each labelled with its account, and neither archived
duplicate; "Fox Rock" returns the account above the closed-won deal of the same name; arrow keys
and Enter navigate; Escape closes and the box reopens empty; Quick Add returns the same three
records in the same order through the same function; at 375px the button is 83×36 at the top right
and opens a full-height 375×812 sheet with the input focused. Company numbers before and after are
identical — **21 accounts, 46 live buildings (43 active, 2 pending, 1 lost), 97 contacts, 800
activities, 44 sites, 55 deals, MRR $46,086.33**, dashboard still reading "45 buildings under 19
accounts". `audit_log` moved 2000 → 2002, which is the two QA profiles the new trigger recorded.
`db:verify` **193 → 208**, and each of the three commits is independently green at 203 / 205 / 208.
`typecheck`, `lint` and a cold `rm -rf .next && npm run build` all pass.

**What changed on 2026-08-18 (third session): the Settings panel.** No schema change, no
migration. Five screens moved: `/admin/import` and `/admin/cleanup` came **out** of the main
sidebar, `/admin/ingest` and `/admin/reference` became reachable for the first time, and `/review`
went **into** the main sidebar because it is everyday work for any member, not admin work.
`/settings` is the way in, from your name in the sidebar footer.

| Thing | Why it is the way it is |
|---|---|
| **The service role key is still nowhere near `src/`** | Creating an account and setting somebody else's password both need it, so both stay terminal jobs — `/settings/people` prints the two commands with a sentence saying why they are not buttons. Changing your OWN password IS in the app: `updateUser({ password })` works on your own session and needs nothing elevated |
| **Editing a profile needed no new policy** | `profiles_admin_all` has granted an admin `for all` on `profiles` since the initial schema. Verified before building rather than assumed, and it is why this task added no migration |
| **Your own password change asks for the current one first** | `signInWithPassword` against your own address, then `updateUser`. Without it an unattended open laptop is enough to lock somebody out of their own account. Minimum 12 characters, the same floor `scripts/set-password.mjs` asks for |
| **Three refusals on the People screen, in the SERVER action and not only greyed-out controls** | You cannot demote yourself (admin is the only role that reaches the screen, so one careless save locks the company out with no way back inside the app); you cannot deactivate yourself; and you cannot deactivate a **service** account, because `is_member()` requires `is_active` and deactivating `ingest@` silently stops the nightly job writing anything. All three were tested by stripping the `disabled` attributes so the request actually reached the server |
| **Email is read-only on the People screen** | `profiles.email` mirrors the auth record. Editing it here would desync the two with no warning, and fixing the auth side needs the service role key |
| **Review is hidden from the nav when the queue is empty** | It is empty until 7b has credentials, and a permanent "Review 0" is the dead number this app argues against everywhere else. One `count`/`head: true` query in the layout. It stays reachable by URL, and `/dashboard` and `/admin/import` already link to it when there is something in it. The count renders as a **gold fill with navy on top**, never gold text |
| **`ADMIN_SECTIONS` is data in `src/lib/settings.ts`** | Same shape as `REPORTS`, so adding an admin screen is one entry rather than a new block of JSX |
| **Sign out is in BOTH places** | Ryan's call. The footer keeps it at one click for the daily action; Settings offers it too because that is where you would look |

Where things live: `src/lib/settings.ts`, `src/app/(app)/settings/page.tsx`,
`settings/password-form.tsx`, `settings/people/{page,people-editor,actions}.tsx`. Nothing under
`src/app/(app)/admin/` changed — those screens are only reachable now.

**A follow-up worth knowing: `profiles` has NO audit trigger.** The `audited` array in
`20260812180000_initial_schema.sql` covers accounts, buildings, contacts and seven more, and leaves
`profiles` out — so a role change made on the new People screen leaves no history. That was fine
when roles were only set from the terminal. It is a one-line migration plus a `db:verify` check,
deliberately not done in a task that was meant to be schema-free.

Tested end to end against the real database under a temporary admin login
(`qa-settings@bealesllc.com`, now **deactivated, do not delete**). Proved: the admin sees all five
Administration rows and every one opens; a **leadership** user sees no Administration section at
all and `/settings/people` turns them away; a name change saves and shows in the sidebar
immediately; all three refusals fire and the row snaps back to the truth; a wrong current password
is refused; the real change works, with the old password then **rejected** and the new one
**accepted** on a fresh sign-in. Company numbers before and after are identical — 45 buildings
under 19 accounts, 30 open deals, 97 contacts, MRR **$46,086**, win rate 80%. `db:verify` 193/193,
typecheck, lint, and a cold `rm -rf .next && npm run build` all pass.

**One thing NOT verified in the browser:** the mobile drawer. The preview pane stopped accepting
synthetic clicks at 375px, so the hamburger could not be opened. The footer link renders inside the
drawer and carries the same `onClick={() => setOpen(false)}` the nav already had — worth one look
on a real phone.

**What changed on 2026-08-18 (second session).** Phase 7c is built. Granola notes are matched on
their **title**, because measured against all 231 real notes not one carries an external attendee
address. `match_aliases` maps a curated phrase to exactly one account, building or deal;
`profile_email_aliases` maps `ryanbeale26@gmail.com` to Ryan so notes are credited to him rather
than to the machine account. `npm run granola:probe` prints what every note would match and writes
nothing; `npm run granola:backfill` logs the history as one undoable batch.

**The measured coverage, and it moves a long way on nine aliases:**

| | Clean | Ambiguous | Matched nothing |
|---|---|---|---|
| With no aliases at all | 36 | 27 | 168 |
| With the nine Ryan confirmed | **98** | 27 | 106 |

98 is the same number Ryan's own prototype reached, from a different direction. Every one of the
private notes matches nothing in both runs — including a long, extremely sensitive note about a
family member's health and employment, which names Beale's and would have been readable by four
colleagues had it matched. That is the "store nothing but the id and the date" rule earning its
keep on real data rather than in the abstract.

**Live counts, measured 2026-08-20: 22 accounts, 53 live buildings (50 active, 2 pending, 1 lost),
98 contacts, 833 activities, 51 sites, 1 next step, MRR $46,086.33.** (The 7c-era figures below —
21 accounts, 46 buildings, 800 activities, 44 sites — are superseded; Ryan added the BILH and
Contemporary Dermatology buildings on 2026-08-20.) Two accounts have no building yet, which
is why the dashboard reads "45 buildings under 19 accounts" — the tile counts buildings that are
not lost, and accounts that have one. The book has grown since Phase 7c; earlier figures in this
file (20 accounts, 39 buildings, 667 activities, MRR $47,148) are the 7c-era numbers and are no
longer current. The backfill was committed,
inspected, undone, re-committed and undone again to prove reversibility both ways; the mirror was
then emptied. `import_batches` is **9, not 7** — two rolled-back rows of test residue, the same
ignorable kind the 5b session left.

### What Phase 7c shipped

| Thing | Why it is the way it is |
|---|---|
| **The signal is the note TITLE, not the participants** | Measured, not assumed: not one of 231 notes carries an external attendee address, because most are solo site inspections dictated into a phone. `matchParticipants` resolves nothing on any of them — and worse, returned null, which `run.ts` read as "file the sender in the strangers tray", so Ryan's own Gmail address would have gone in it |
| **A derived phrase must be a PHRASE; a street address must carry its NUMBER** | Requiring the number is what makes `199 Reedsdale Road` in a private sleep-study note match nothing, and stops a bare "Main St" matching anything. A single-word matcher filed a family hospice note under Beth Israel Lahey on the word "Beth" |
| **Containment decides, not length** | Two situations look identical to a naive longest-wins. `851 middle st suite 2100` CONTAINS `851 middle`, so the longer one is simply more specific and wins. `Quincy Ambulatory and Plymouth Cordage Park` names two different places at two different points in the title, and longest-wins would silently have picked one — so that is ambiguous |
| **A curated alias outranks a derived phrase at the same words** | Curation is the whole reason `match_aliases` exists, so it has to beat the thing it was created to correct |
| **A building and its own account are one place, not two candidates** | Real: the building `Braintree Hill Office Park` sits under the account of the same name, as does `Dermatology of Cape Cod`. Two candidates printing identical words is not a decision anyone can make, and the account is the same either way, so the building — the more specific — wins |
| **Three outcomes, and only one of them writes** | One record → the link is applied. Two or more → the title is KEPT, the row is `needs_review`, and it is listed on `/admin/ingest` where one alias fixes it and every future note shaped like it. Nothing → the note id and date, and **nothing else** |
| **No suggestions, and no `inferred`, in 7c** | A deliberate narrowing of the original plan. An activity has one `account_id`, so two competing suggestions on one activity would let a reviewer accept both and have the second silently overwrite the first. `/review` therefore needed no change; quotes and offsets stay in 7d where they belong |
| **`RawItem.fetchText` is a lazy thunk, called only AFTER a match** | Granola's list endpoint returns the title but not the summary. Fetching lazily means the body of a note that matched nothing is never downloaded, let alone stored — and the notes that match nothing are, by construction, the private ones. The privacy promise as control flow rather than as a comment. `graph.ts` will not set it |
| **`match_aliases` uses three nullable FKs with `num_nonnulls(...) = 1`** | Not a `(target_table, target_id)` pair, which has no referential integrity: deleting a building would leave a phrase pointing at a ghost the matcher resolves to nothing, with no way to see why. `on delete cascade` means tidying a record up takes its aliases with it |
| **No minimum length on an alias** | "HTA" is three characters and is a real alias; "SSMC" is four. A short alias is safe *here* because a person typed it. The admin screen still refuses a phrase made only of words that appear across the whole book |
| **`profile_email_aliases` is not `account_domains`** | `gmail.com` stays permanently on the never-mappable list. A domain claims a company; an address claims a person. Three live bugs fall out of this one table: crediting, the strangers tray, and treating Ryan as external |
| **The mirror's "already done" check requires a LIVE activity or next step** | Both FKs are `on delete set null`, so undoing the backfill leaves rows claiming `linked` with nothing behind them. Without the second condition those notes would be skipped for ever and **the undo would have been a one-way door** — proved by undoing and re-running, which re-created all 98 |
| **`normalise_alias()` is duplicated in SQL and TypeScript** | `v_alias_candidates` has to apply it and a view cannot call TypeScript, while the matcher runs over hundreds of titles and cannot make a round trip per phrase. Exactly the `is_public_email_domain()` precedent, and `db:verify` asserts the two suffix tables agree in both directions |
| **The probe is a terminal script, not a screen** | Its most useful output is the list of titles that matched nothing — which is precisely where the private notes are. Ryan needs to read them to know which alias to add, and they must not be stored anywhere four colleagues can read. A terminal is the only place both are true |
| **The probe calls `matchItem()`, the same function the job calls** | A probe that reasons about matching slightly differently from the job is the "two counts of one number eventually disagree" mistake, and this number is the one that decides what gets aliased |
| **The backfill is a local script, not a cron drain** | Draining a year of notes across several 300-second invocations would need new state to carry one batch id between them, or produce eight Undo buttons for one decision. Run from a laptop there is no cap: one batch, one button. It signs in as a real **admin**, prompted, because `import_batches` is admin-write and a year of history appearing in the app should have somebody's name on it |
| **Nothing new was built for undo** | Activities carry `import_batch_id` and `activities` was already in `rollbackImport`'s table list. That is the whole of what makes the backfill reversible |

**What the Granola API actually does**, measured against the real account, because two documented
facts are wrong:

- **`limit` is ignored.** Every page is 10 notes regardless. This file previously recorded a maximum
  page size of 30. 231 notes is therefore ~24 requests, not ~8.
- **The calendar join key is `calendar_event.calendar_event_id`, not `iCalUId`.** This account is on
  Google Calendar and reports a Google event id. 7b must match on that field.
- `summary_text` is already plain text, so nothing needs markup stripping. `transcript` is null
  unless asked for, and `granola.ts` never asks.
- A list row carries **no** attendees and **no** calendar event — which is what makes the lazy
  `fetchText` worth its keep.
- `updated_after` and `created_after` both work and correctly return `hasMore: false` with a null
  cursor when the filtered set fits on one page.

### Data findings the probe turned up — Ryan's to decide

These are data, not code, and none of them is safe to guess at:

- **`46 Oberry St` is spelled with a double R in the CRM.** Every Granola title says "46 Obery st",
  so the address matches nothing. Eight or more notes are affected. Either correct the building or
  add an alias.
- **`797 Main St + Industrial Park`** is one building record, named after its own account, with two
  addresses crammed into one field. It is why "797 main" is ambiguous while "797 main st" is clean.
- **Several sites Beale's demonstrably services are not in the CRM at all** — 851 Middle St
  (suites 2100 and 3500), 295 Old Oak St Pembroke, 143 Longwater, 186 Tremont St, Stetson,
  Kneeland St. Some are closed-won deals whose buildings were never created, which is also why the
  matcher cannot see them: **only OPEN deals enter the phrase book**, since a phrase from a deal
  closed two years ago would file tonight's note against history.
- **Archive the two duplicate records BEFORE `sites:backfill --commit`.** The dry run reports 39
  buildings → 36 sites and names both strays inside the shared sites: `90 Libbey` under South Shore
  Health, and `97 Libbey Pkwy, Weymouth` under South Coast Dermatology. The script filters
  `deleted_at is null`, so archiving first makes both sites come out right; backfilling first builds
  a site around records that are about to vanish. Archiving also collapses roughly seven of the 27
  ambiguities on its own.
- `101 Columbian St` does **not** appear as a multi-contract site, so the Cancer Center merge left
  one building there. Nothing to do.

### Still to do, in this order

**Items 1–4 of the old list are DONE.** Ryan finished them between 2026-08-18 and 2026-08-19, and
this section went on telling later sessions to do them again — which is exactly how a stale
checklist wastes a session. Measured against the live database on 2026-08-19: **44 sites and 0
live buildings without one**, so the site backfill has run; **134 `match_aliases` and 231
`ingested_items`**, so the alias curation and the Granola backfill have both run over the whole
corpus. Ryan confirms the four Vercel environment variables are set.

0. **The browser pass on the Granola-whole-note work.** It was built in a cloud container
   with no database access, so the self-tests, a cold build and a hand-rendered component are
   all that stand behind it. `/admin/ingest` **was** confirmed on 2026-08-21 to show three
   runs with *"Earlier runs (7)"*; what is still unchecked is that a Granola note ingested
   after the change reads as a collapsed excerpt on `/activity` that opens to the whole
   summary with its line breaks intact.
1. **Map a domain that appears on real meetings**, and the calendar starts paying for itself:
   `bidplymouth.org`, `bbmfacility.com`, `bostonbuildingmaintenance.com`. Also worth deciding
   whether **BBM Facility Services** should be an account at all — Brittany Hampton is its CEO and
   BBM subcontracts non-union work to Beale's, so it is a source of revenue rather than a customer
   in the usual sense. Left as a contact-only link for now, deliberately, so nothing appears in MRR
   that Ryan did not put there.
2. ~~**Give `jfallon@` and `lwebber2@bwh.harvard.edu` an account, or map `bwh.harvard.edu`.**~~ —
   **done.** `bwh.harvard.edu` is mapped, **20 domains are mapped and `v_domain_candidates` is
   empty**, measured 2026-08-21. There is nothing left for anyone to map by hand.
3. **Invite the team.** Phases 1–6 are done and there is nothing structural left in the way.
   Onboarding is `npm run user:password`, not a magic link — see the Defender Safe Links note
   below, which will otherwise burn the token before anybody clicks it.
4. ~~**Deploy 7b.**~~ — **done.** Graph is live in production and confirmed by the Sources panel.
3. The gap-fill data entry, still the thing that makes every number in the app more truthful.
4. ~~`profiles` has no audit trigger~~ — **done 2026-08-19**, its own migration and commit.
5. ~~The audit-log screens, 404s, loading states~~ — **done 2026-08-19**, Phase 6b.

**The "two duplicate Libbey records" are settled, and do NOT need archiving again.** This trap has
now caught one session, so it is written down. There are five buildings at 90/97 Libbey Pkwy and
they are not five copies of one thing:

| | Account | State | What it is |
|---|---|---|---|
| `90 Libbey` | South Shore Health | **archived** | Import duplicate, batch `769c4d19`, 2026-08-13 |
| `97 Libbey Pkwy, Weymouth` | South Coast Dermatology | **archived** | Import duplicate, same batch |
| `Wound Center (90 Libbey Pkwy, Weymouth)` | South Shore Health | live | The **tenant** contract |
| `90 Libbey` | Fox Rock Properties | live | The **landlord** contract, created by hand 2026-08-18 |
| `97 Libbey` | Fox Rock Properties | live | Created by hand 2026-08-18 |

The two live Fox Rock rows share a name and an address with the two archived ones and are a
different thing entirely — they are the landlord side of exactly the case the `sites` table was
added for, and the Fox Rock `90 Libbey` shares its `site_id` with the Wound Center as it should.
**Do not archive them.** Judge a Libbey record by its ACCOUNT and its `created_at`, never by its
name.

**Also fixed on 2026-08-18:** the Supabase **Site URL was missing its `https://` scheme**, so every
magic link and password-recovery link landed on
`pjcitahktwnawucoznhk.supabase.co/beales-crm.vercel.app` and died. Earlier versions of this file
recorded the Site URL as configured — it was, but wrongly, and it would have broken the first
sign-in for all four remaining colleagues. **Ryan corrected it to `https://beales-crm.vercel.app`.**

Separately, **Defender Safe Links on Exchange Online pre-opens recovery links and burns the
one-time token** before a human clicks, so a Supabase recovery email can arrive already expired
(`otp_expired`). That is not retryable and it will affect all five accounts. `npm run user:password`
exists to take email out of the loop entirely.

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
2. **The Vercel environment variables**, or the cron runs nowhere. The function is capped at
   **300s** by the Hobby plan; raising it needs Pro *and* Fluid Compute, and a value above the
   plan ceiling fails the build rather than the request.
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
| `supabase/migrations/20260825090000_next_step_vanished.sql` | `ingested_items.missed_sightings` / `first_missed_at`, `next_steps.vanished_at` / `vanished_reason`, `ingest_runs.next_steps_vanished` |
| `src/lib/ingest/index.ts` | `CalendarWindow` and the optional `calendar` on `SourceFetch`; `sightingPatch()` and its two thresholds — pure, so the probe can pin them with no credentials |
| `src/lib/ingest/run.ts` | `sweepVanished()` — what the calendar no longer holds, judged only inside a window a source vouched for |
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

Sites got their screens after 7c, when the first real tenant account was created:

| File | Job |
|---|---|
| `src/lib/sites.ts` | `siteKey()` — the one rule for "is this the same place", built on `normaliseAlias()`. `fetchSiteOptions()` and `findOrCreateSite()`, which **reuses before it creates** |
| `src/app/(app)/buildings/building-form.tsx` | *Physical building* picker and *We contract with* (landlord / tenant) |
| `src/app/(app)/buildings/[id]/page.tsx` | Shows the site, and links to the other contracts at the same address |
| `scripts/backfill-sites.ts` | Was `.mjs` with its own copy of the suffix map. Now TypeScript importing `siteKey`, so the script and the form cannot disagree about what one place is — and it **joins an existing site** rather than making a second one at the same address |

Phase 7c added:

| File | Job |
|---|---|
| `supabase/migrations/20260820090000_match_aliases.sql` | `normalise_alias()`, `match_aliases`, `profile_email_aliases`, `ingested_items.matched_on`, `v_alias_candidates` |
| `supabase/migrations/20260820091000_alias_candidates_distinct.sql` | One offer per phrase per record — a building named after its own address was offered twice |
| `src/lib/ingest/titles.ts` | Normalisation, date/time stripping, `addressPhrases()`, the phrase rule, `matchTitle()` with the containment rule, `activityTypeForTitle()`. **No database, no network** |
| `src/lib/ingest/granola.ts` | `listGranolaNotes()`, `granolaListItem()` with the lazy `fetchText`, `makeGranolaSource()`. Rate-limited, read-only, never asks for a transcript |
| `src/lib/ingest/match.ts` | Gained `usesTitleMatching()`, `matchItem()` and the phrase book in `loadDirectory()` |
| `scripts/granola-env.ts` | `.env.local`, sign in as the ingest profile, sign in as an admin with a hidden prompt |
| `scripts/granola-probe.ts` | The probe, plus `--selftest`: 14 hazard cases, no network, no database |
| `scripts/granola-backfill.ts` | Dry run then `--commit`. One batch, one Undo button |
| `src/app/(app)/admin/ingest/alias-map.tsx` | The phrase book, candidate chips, and the ambiguous-title list |
| `src/app/(app)/admin/ingest/profile-aliases.tsx` | Other addresses that are one of us |

`db:verify` grew from 118 to **157 checks**, and is **238** today.

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

**Microsoft 365 — the app registration EXISTS as of 2026-08-19.** Mike (IT) created it and sent
the proof:

| | |
|---|---|
| **`GRAPH_CLIENT_ID`** | `60ed8f27-94ae-49e0-b4c6-931ed3099b90` |
| **Mailbox scoping** | `Test-ApplicationAccessPolicy` returns **Granted** for `ryan@bealesllc.com` and **Denied** for `jbeale` |
| **Admin consent** | Granted 2026-08-19. `Mail.Read` and `Calendars.Read`, both **Application** type, both showing *Granted for Beales LLC* in the portal |

**The `ApplicationAccessPolicy` is load-bearing and nothing in the portal will warn you.** The
two permissions are described on the consent screen as *"Read mail in all mailboxes"* and
*"Read calendars in all mailboxes"*, and that is literally true — an application permission is
tenant-wide by definition. The **only** thing confining this app to Ryan's mailbox is the
`New-ApplicationAccessPolicy` command below. If that policy is ever removed, or is not
re-applied after a tenant change, the nightly job silently gains all ~150 mailboxes and
**nothing anywhere raises an error**. Re-run `Test-ApplicationAccessPolicy` against a second
mailbox after any Entra work and confirm it still returns **Denied**.

**Two things are still outstanding before a line of Graph code is written:**

1. **`GRAPH_TENANT_ID`** — the Directory (tenant) id. Not a secret; ask Mike.
2. **`GRAPH_CLIENT_SECRET`** — goes straight into `.env.local` and the Vercel env vars.
   **Never paste it into a chat or a commit.**

Then **3–4 real samples**, as below.

**Ryan's meetings are in Outlook / Exchange, not Google — confirmed 2026-08-19.** This matters
because `granola.ts:35` records that Granola reports a **Google** `calendar_event_id`, which
means Granola is watching a *personal* Google calendar rather than the work one. So the
note↔meeting join 7b assumes may not line up at all: Graph will report `iCalUId` for an Outlook
event, and Granola holds a Google event id for what may be a different calendar entirely.
**Settle this with one real calendar sample before building the join.**

`bealesllc.com` is on Exchange Online (verified from public DNS: MX →
`bealesllc-com.mail.protection.outlook.com`), so **one app registration covers mail and calendar
together**.

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
made and is also in `.env.local`. **The route asks for `maxDuration = 300`**, the Hobby ceiling.
It asked for 800 from Phase 7a until 2026-08-18 and Vercel rejected the build outright, which is
why the 7a commit never deployed. Raising it needs Pro *and* Fluid Compute.

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

**Accounts.** The five real people are active — Ryan, Jon, Robert Mulligan, Bob Mulligan and
Victor Melo. **Brendan Mulligan was removed entirely on 2026-08-20** — profile deleted (it held no
audit rows), Dermatology of Cape Cod and its building reassigned to Ryan, his one activity
reassigned with them, and his CONTACT row archived rather than deleted because of the coaching
notes on it. Earlier versions of this file said he was merely deactivated. The QA logins — `qa-phase5@`, `qa-phase5b@`,
`qa-phase7@`, `qa-phase7c@`, `qa-settings@`, `qa-phase6@`, `qa-phase6-field@`, `qa-phase6b@`,
`qa-phase6b-field@`, `qa-sources@`, `qa-7bh@`, `qa-upcoming@`, `qa-deploy@`, `qa-nextsteps@`
and `qa-reschedule@` — are **deactivated, do not delete**: they hold the audit rows for the 91
Longwater Drive correction and for the Phase 5b, 7a, 7c, Settings, 6a and 6b testing, and removing
a profile would erase who made those changes. Several of them are now visible **by name** on
`/admin/history` and on record pages, which is exactly why they are kept. (Earlier versions of this file counted eleven profiles and named four QA logins;
both numbers had already fallen behind, which is why this now names them rather than counting.)

The machine account is **`ingest@bealesllc.com`, "Nightly ingest"** — `role = field`, `sees_rates = false`,
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
| `npm run db:verify` | Runs every migration + `seed.sql` against a throwaway in-memory Postgres and asserts RLS, triggers, revenue views and pay-rate access all behave. **Run this after any schema change** — no Docker needed. **238 checks** |
| `npm run graph:probe` | What Microsoft Graph really returns. **Writes nothing.** Proves the tenant id, client id, secret and admin consent in one command, then repeats the mailbox access-policy test from the code that runs at 3am. Redacted and **safe to share** by default; `-- --raw` prints real content, `-- --selftest` runs **70** checks with no network — redaction, the timezone trap, the confidence tiers, the recurring-series collapse, the shared-mailbox display names, the reschedule rules and the absence rules. Its live output also counts occurrences already moved from their original slot, says how many came back **cancelled**, and states whether the window was complete enough to sweep at all |
| `npm run granola:probe` | What the title matcher would make of every Granola note. **Writes nothing, anywhere.** Prints clean / ambiguous / matched-nothing, and the last of those is the list to read before adding aliases |
| `npm run granola:probe -- --selftest` | **30** checks: the hazard cases for what a title MATCHES, plus what a matched note BECOMES — the per-source body limit, the whitespace rules and the timeline's excerpt threshold. No network, no database, no credentials — runs anywhere |
| `npm run granola:backfill` | Dry run: what the history would create. `-- --commit` writes it, as one undoable batch, prompting for an admin email and password |
| `npm run user:create -- --email … --name … --role …` | Creates one of the five accounts. One of two places the service role key is used |
| `npm run user:remove -- --email … --reassign-to …` | Removes a profile that never belonged in the app. **Dry run unless `--commit`**, and it REFUSES anyone with a single `audit_log` entry — deactivate those instead. Reassigns everything they own first, then deletes; Postgres refuses the whole delete if anything still points at them |
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

**`CRON_SECRET` in `.env.local` is a PLACEHOLDER, and Vercel's real one cannot be read back.**
Found 2026-08-22 after two 401s. The local file still holds the example value from
`.env.local.example`, which works fine against `localhost:3000` — the dev server and the curl
read the same file, so it matches itself — and returns **`{"error":"Not authorised"}`** against
production, because Vercel has a real value. Vercel's copy is marked **Sensitive**, so *Copy to
Clipboard* is locked and `vercel env pull` will not return it either; it is write-only by
design. **The nightly cron is completely unaffected** — Vercel Cron supplies its own value on
both sides, and 16 runs prove it. So: hand-run the job against **localhost**, and treat the
nightly run as the production proof. **Do not rotate the Vercel value without redeploying
immediately afterwards** — an env var change only takes effect on the next deployment, so
between the rotation and the redeploy the cron would 401 every night and nothing would say so
except staleness.

**A `maxDuration` above the plan's ceiling fails the BUILD, not the request.** `src/app/api/cron/ingest/route.ts`
declared 800 — the Pro-with-Fluid-Compute number — while the project runs on Hobby, which allows at
most 300. Vercel rejects the whole deployment with *"Builder returned invalid maxDuration value"*.
Two things made it expensive: the failure is at build time so nothing about the route being unused
protects you, and **a failed build leaves the previous deployment serving happily**, so production
looks fine while every push silently fails. The Phase 7a commit sat unpushed and undeployed for a
day because of it. Check the plan before raising it.

**The in-app preview browser does not HYDRATE until the pane has a viewport, and nothing says so.**
Found on 2026-08-20 after twenty minutes of chasing a phantom bug. Straight after `preview_start` the
pane reports `0x0`: `read_page` returns "(empty page)", `document.body.innerText` returns the shell
alone while `textContent` holds the whole page — and **React never hydrates**, so every
`element.click()` and every synthetic `input` event silently does nothing while the server logs a
clean 200. It looks exactly like a broken client component. **Take a `computer {action:
"screenshot"}` first**: that gives the pane a real viewport, hydration completes, and the same
clicks work immediately. Check it directly with
`Object.keys(el).filter(k => k.startsWith('__react')).length` — zero means not hydrated yet, and it
is *not* a world-isolation artefact, because `javascript_tool` runs in the main world. This is
almost certainly what the Settings session recorded as "the preview pane stopped accepting synthetic
clicks at 375px". Assert with `textContent`, never `innerText`, for the same reason.

**The in-app preview browser needs `ArrowDown`, not `Down`, and its screenshots go stale.**
`computer` with `text: 'Down'` reports "pressed Down" and the page receives nothing, so a keyboard
feature looks broken when it works. `ArrowDown` / `ArrowUp` are the names that arrive. Screenshots
also lag the live DOM by a beat, so **read the DOM to assert and use the screenshot only to look**
— `javascript_tool` querying a `data-` attribute is the reliable check. And at 375px the pane
refuses synthetic clicks outright: drive mobile through `element.click()` and native value setters
rather than coordinates.

**There is no Prettier in this project, and `npx prettier --write` will rewrite whole files.**
Learned the expensive way on 2026-08-22: there is no `.prettierrc`, no `prettier` key in
`package.json` and no prettier plugin in `eslint.config.mjs` — the formatting here is
hand-maintained at about 100 columns. `npx` happily downloads its own copy, applies its
**80-column default**, and reformats every line it touches, so a 20-line change came back
as 507 changed lines in one file. `git checkout --` the file and re-apply the edit by
hand. `npm run lint` is the only formatter this repo has.

**A PostgREST `select` must be a single string LITERAL, not a concatenation.** supabase-js parses
the select string at the *type* level to work out the row type, and `'a, b, ' + 'c(d)'` widens to
`string` — so every column comes back as `GenericStringError` and the whole query fails to typecheck
with errors that look like the columns do not exist. Keep long selects on one long line.

**A script cannot import `@/lib/...` or anything marked `server-only` without help.** Node 24 strips
types but does not resolve tsconfig `paths`, and `server-only` throws outside a React Server
Component. Both are solved by how the scripts are launched:
`node --conditions=react-server --import tsx <script.ts>` — `tsx` resolves the alias, and the
condition resolves `server-only` to its own empty module. `tsx` is a devDependency for exactly this,
and the reason it is worth one is that the alternative is a second copy of the title matcher, which
is the mistake this repo has a standing rule against.

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

**Opened or closed by Phase 6a:**
- [x] ~~`profiles` has no audit trigger~~ — done, its own migration and commit.
- [x] ~~Would an audit screen leak a pay rate to Victor?~~ — it would have, and so did the
      database already. Closed in `audit_log_select` rather than in any screen.
- [ ] **Should search include employees?** Left out on purpose: Ryan named four kinds, and all
      three employee tables are empty until Phase 4 answers where the data comes from. The
      `kinds` argument makes it one arm of a union to add later.
- [ ] **Nothing surfaces `score` yet.** The function returns it and `SearchHit` carries it; the
      palette does not show why something matched. Worth revisiting only if somebody asks.

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
- [x] ~~The Entra app registration~~ — created 2026-08-19. Client id `60ed8f27-94ae-49e0-b4c6-931ed3099b90`. **Tenant id and client secret still needed.**
- [x] ~~Admin consent for `Mail.Read` and `Calendars.Read`~~ — granted 2026-08-19, both **Application** type, both reading *Granted for Beales LLC*.
- [x] ~~The `New-ApplicationAccessPolicy` scoping~~ — done and proved: **Granted** for Ryan, **Denied** for jbeale.
- [x] ~~Does the Granola note↔calendar join work?~~ — **no, and it does not need to.** Measured 2026-08-19: 1 of 17 notes carries a calendar event, and it matches no Outlook meeting. Not built; the risk is written down instead.
- [x] ~~3–4 real samples~~ — taken 2026-08-19 with `npm run graph:probe`, and they changed three things. The parser was written from them, not from the docs.
- [x] ~~**No calendar event has become a `next_step` yet.**~~ — **done 2026-08-20.** *Monthly BI Inspection*, due 19 Sep, owner Ryan, contact Brittany Hampton, no account. It could not happen before because both contacts on that meeting were accountless, which the matcher treated as nobody.
- [x] ~~**The recurring-meeting rule has never met real data.**~~ — **it has now, and the assumption behind it was wrong.** 40 occurrences across 11 series in one nightly window. `originalStart` is populated; each occurrence carries its own `iCalUId`; `seriesMasterId` is what groups them. One next step per series, rolling forward. **And it is now proved on real data, which it was not when this line was first ticked** — the probe reads 70 events, 53 occurrences across 11 series, 39 ahead, **14 after collapsing**, which is 11 series plus 3 future one-offs. The four-next-steps incident of 2026-08-21 was the code not being deployed, not the rule being wrong.
- [x] ~~**No calendar event has matched on the DOMAIN tier.**~~ — **five have, measured 2026-08-21**, four of them becoming next steps, once Ryan mapped `bidplymouth.org`. Calendar `matched_by` reads 5 domain, 2 exact. `bbmfacility.com` and `bostonbuildingmaintenance.com` stay unmapped **on purpose** — BBM subcontracts to Beale's rather than buying from it, so mapping them would file a supplier in the customer book.
- [ ] **10 of the 11 recurring series match nothing** and leave no trace at all, because Ryan organises them and `recordUnknownSender` skips a colleague. That is correct, and it does mean the calendar is quieter in the app than it looks in Outlook.
- [ ] The Vercel environment variables. (The `maxDuration` question is settled: 300, the Hobby ceiling.)
- [ ] Whether the other four should be added to the ingest group, and whether they know their client mail would be logged. Ryan chose to start with his mailbox alone; widening it is a group membership change and no code.

**Opened 2026-08-21:**
- [x] ~~**There is NO way to complete or dismiss a next step in the app.**~~ — **done
      2026-08-21.** Done and Dismiss on every row of the dashboard strip, with an Undo, plus a
      *Still open* section so a meeting nobody closed stops vanishing the next morning. No
      migration, as predicted. **`activity_id` is still written by nothing, deliberately** —
      see the decision log: the honest way to fill it is a join at ingest time on
      `(source, external_id)`, never a picker.
- [ ] **A next step with no `due_at` is invisible to all three queries.** `due_at` is nullable
      and `.lt()` / `.gte()` both drop nulls. Zero such rows exist — only the calendar path
      inserts, and a calendar event always has a start — but **7d's written commitments are
      exactly the case that would create them**. `whenLabel()` already has a `'no date'`
      branch, so the original author saw it coming. Decide where an undated commitment belongs
      before 7d writes one, rather than bolting an `.or()` onto a query that is currently a
      clean index scan.
- [x] ~~**A rescheduled meeting never updates its `due_at`.**~~ — **done 2026-08-22.** The
      behaviour was fixed rather than the comment, so `20260818090000_ingest.sql:107` is now
      **true and the migration file was deliberately not edited**. Only `open` rows move,
      only `due_at` / `all_day` / `title`, and never a re-match.
- [ ] **The reschedule path has not yet met a REAL moved meeting, and cannot easily be made
      to.** Proved six ways against the real database with a synthetic Graph payload, and
      `graph:probe` reports no occurrence moved from its original slot in the current window.
      The obstacle is not the code: **calendar events match on ATTENDEES, not titles**
      (`usesTitleMatching` is granola-only), so the only two meetings in Ryan's entire
      calendar that carry a next step are `46 Obery St Cleaning Inspection` and
      `Monthly BI Inspection` — **and both have a customer on the invite.** Ryan declined to
      move either to test software, which is the right call. Moving any other meeting reports
      `nextStepsUpdated: 0` **correctly**, because it has no next step to update. So this
      gets proved the day one of those two genuinely moves, and `/admin/ingest` will say
      `· 1 rescheduled` on its own. Do not read a 0 as a failure without first checking
      whether the meeting had a next step at all.
- [x] ~~**A CANCELLED meeting sits as an open next step for ever.**~~ — **done 2026-08-22
      (second session).** It **flags, and never closes**: three complete windows in a row
      without it, spanning at least 48 hours, or one that Graph returns marked cancelled.
      Both traps were answered structurally rather than remembered — the seen-set is built
      PRE-collapse, and a window is only swept if the source vouched for it, which a 403,
      a truncated page or a deadline stop cannot do. `SourceFetch` gained one **optional**
      field, so `fixtures.ts` and `granola.ts` did not change at all.
- [ ] **A next step whose meeting moved BEYOND the 30-day horizon reads as absent.** Known,
      accepted and commented rather than fixed: `FORWARD_DAYS = 30`, so a meeting dragged
      past it leaves the window and looks deleted. The wording on the strip — *no longer on
      the calendar* — stays true of the stretch we can see, and the flag clears itself the
      moment the meeting comes back into range. Worth revisiting only if it happens to a
      real meeting.
- [ ] **14 `ingested_items` are `needs_review`, and they are all the same collision: `90
      Libbey`.** Read 2026-08-21: eleven are Wound Center inspections, three are Fox Rock
      conversations with Kristen Riordan about day porter hours, one names both 97 and 90.
      Fox Rock's `90 Libbey` and South Shore Health's `Wound Center (90 Libbey Pkwy)` both
      claim the bare street phrase, so refusing is correct. One `90 libbey` alias clears all
      fourteen **and misfiles the three Fox Rock ones** — Ryan's trade to make.

**Opened or closed by Phase 7c:**
- [x] ~~Alias `ryanbeale26@gmail.com` to Ryan's profile~~ — done, through `profile_email_aliases`.
      All 98 matched notes are credited to Ryan Beale, none to the machine account.
- [x] ~~Backfill or forward-only for the 231 historical notes~~ — forward-only nightly, with the
      history as a separate deliberate batch run from a laptop. Built, tested, undone twice.
- [x] ~~Seed `match_aliases` with what Ryan confirmed~~ — the nine are in: `cancer center`,
      `wound center`, and `bilh` / `beth israel` / `beth israel lahey` / `beth israel deaconess` /
      `bidmc` onto `Beth Israel (BIDMC)`.
- [ ] **Roughly a dozen recurring business shapes still match nothing** and are worth one alias
      each — 851 Middle St by suite, 295 Old Oak, 143 Longwater / SSMC, 186 Tremont, Stetson,
      Kneeland St, Foxrock building 42, Gener8, Elevation Apartments. Run the probe and work down
      the list. Some of these have no building record at all, which is the deeper fix.
- [x] ~~**Is `46 Oberry St` a typo for `46 Obery St`?**~~ — yes, and Ryan corrected the building. It is
      now `BILH - 46 Obery St`, and the weekly inspection meeting matches Beth Israel (BIDMC).
- [x] ~~**`797 Main St + Industrial Park`** is one building record with two addresses in one
      field, named after its own account.~~ — **fixed, confirmed 2026-08-22.** The building is
      now `797 Main St, Weymouth` under **South Shore Health**, the Industrial Park Rd sites
      are three separate Fox Rock buildings (38, 40 and 44), and no account of that name
      survives. InspectQA calls the same building *Grayken Center*.
- [ ] Whether a **closed-won** deal should be able to lend its name to the matcher. Today only open
      deals do, deliberately — but several closed-won deals are places Beale's still services whose
      buildings were never created, so their notes match nothing.

**Opened by Phase 7a:**
- [x] ~~`account_domains` is empty~~ — **18 domains are mapped and no candidates remain**, measured 2026-08-19. Ryan did this between sessions and this file had not caught up. The middle confidence tier is live.
- [ ] The 261 orphan activities the relink could not place. Worth a look at the "what still matches nothing" list before deciding whether they are worth hand-linking at all.
- [ ] **There is still no `ANTHROPIC_API_KEY` and no `INSPECTQA_*` variable anywhere in this
      repo.** Re-measured 2026-08-22, because both are easy to assume have appeared. `.env.local`
      holds exactly `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_USER_EMAIL`,
      `INGEST_USER_PASSWORD`, `CRON_SECRET`, `GRANOLA_API_KEY`, `GRAPH_TENANT_ID`,
      `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`. **7d and Phase 8 are both blocked on Ryan, not
      on code.** For Phase 8 the shape is four variables following the ingest-profile pattern —
      `INSPECTQA_SUPABASE_URL` (`https://illxdfvqvuwoqwbplgiy.supabase.co`, not a secret), that
      project's anon key, and a dedicated account whose **RLS grants select and nothing else**,
      because read-only has to live in policies rather than in our good intentions. And as
      always the credentials are not the real blocker: **3–4 real rows from `buildings`,
      `inspections` and `organizations`** come before a line of sync code, the rule that caught
      Granola's ignored `limit` and the Graph timezone trap.
- [ ] **7d, the extraction layer, is DEFERRED. Ryan declined it on 2026-08-22 and asked to be
      asked again on 2026-09-05.** A reminder is scheduled; it will re-measure rather than
      quote the figures below, which are already going stale.

      **The recommendation at the time was to build it, and it is logged here so the next
      session does not have to reconstruct it.** 7d reads ingested Granola notes with a
      language model and proposes written commitments as `next_steps` on `/review`. Money is
      never model-proposed. It is the only part of Phase 7 where a model writes anything, and
      the only slice that could be dropped without harming the rest — which is exactly why it
      was always sequenced last.

      **The case for:** the review queue and its undo path are built, tested and idle, so the
      machinery it needs already exists and costs nothing more. Granola is measurably the right
      target — 138 linked notes of genuinely commitment-shaped prose, against mail which cannot
      be one because `graph.ts` only ever fetches `bodyPreview` at 255 characters. And since
      notes started being stored **whole** rather than capped at 500 characters, the source text
      is far richer than when the estimate below was made, so **the 50% figure is stale in
      Ryan's favour and should be re-measured before it is quoted again.**

      **The case against, which is why deferring is defensible rather than merely cautious:**
      the honest expectation was roughly a **50% dismissal rate**, and the adoption bar governs
      every decision in this project. A review queue that fills with rejects is precisely the
      chore that kills adoption on a team that has never used a CRM — and the queue is at **0
      suggestions** today, so 7d would be the thing that populates it. It also adds a recurring
      API cost to a five-person internal tool and needs `ANTHROPIC_API_KEY` in `.env.local` and
      Vercel Production, which is still absent.

      **What should decide it in September:** how Ryan has treated the machine suggestions he
      already gets. If most `next_steps` end up dismissed, that is evidence against building a
      machine that makes more of them, and the right answer is to drop 7d permanently rather
      than defer it a third time.

- [ ] **Phase 8 / InspectQA — the SCOPE is now settled from screenshots, the SCHEMA is not.**
      Read from `beales.inspectqa.com` on 2026-08-22 (the app's own screens, not the database),
      and cross-checked against the live CRM. Two different things were still missing and only
      one of them is now answered.

      **What the screenshots settled — which nine buildings, and how they map:**

      | InspectQA building | Maps to CRM | How clean |
      |---|---|---|
      | `46 Obery - Beth Israel Lahey Hospital - Plymouth` | `BILH - 46 Obery St` / Beth Israel (BIDMC) | clean |
      | `187 Ballardvale St` *(- Ciminelli)* | `187 Ballardvale Rd, Wilmington` / Ciminelli | clean |
      | `797 Main Street` *(Grayken Center)* | `797 Main St, Weymouth` / South Shore Health | clean |
      | `Dana-Farber Brigham Cancer Center - South Shore Health` | `Cancer Center - Dana Farber / Brigham(101 Columbian St)` | clean |
      | `181 Ballardvale St` *(- Ciminelli)* | **two candidates** — Ciminelli's `181 Ballardvale Rd` and Gener8's `181 Ballardvale st` Suite 102 | needs the name suffix |
      | `The Wound Center - South Shore Health` | **two candidates** at 90 Libbey Pkwy — Fox Rock's `90 Libbey` and South Shore Health's `Wound Center` | needs the name suffix |
      | `Suite 2100 - 851 Middle St - Brown Health` *(- Urology)* | CRM has ONE `851 Middle St`, under **HTA Realty** | **conflict, see below** |
      | `Suite 3500 - 851 Middle Street - Brown Health` *(- Wound Care)* | **no CRM record at all** | missing |
      | `HTA` at *"800 test at Winchester ma"* | **nothing — it is TEST DATA** | must be excluded |

      **Four things follow, and each of them would have been a bug found late:**

      1. **The key belongs on `buildings`, never on `sites`.** Three of the nine sit at an
         address where the CRM holds two contracts, and InspectQA inspects the tenant's space.
         Matching on address alone would file the tenant's inspections against the landlord for
         3 of 9 — the landlord/tenant split biting exactly where it was predicted to.
      2. **The disambiguator is the NAME SUFFIX, not the address.** InspectQA appends the
         customer — `- Ciminelli`, `- South Shore Health`, `- Brown Health`. That suffix is the
         only thing separating the two 181 Ballardvale contracts and the two at 90 Libbey.
      3. **`851 Middle St` is one CRM building under HTA Realty and TWO InspectQA buildings
         under Brown Health.** This file has recorded suite 2100 as HTA and suite 3500 as Brown
         University Medical; InspectQA labels **both** suites Brown Health, 2100 as Urology and
         3500 as Wound Care. **Ryan's to settle — it is a data question, not a code one**, and
         it is the same gap already listed under the alias work.
      4. **One row is junk and a sync must skip it.** `HTA` at *"800 test at Winchester ma"*
         carries a 89% score and 0 open work orders. An importer that trusted the list would
         create a building in Winchester that does not exist.

      Also read off the screens, worth knowing before designing anything: **194 open work
      orders and all 194 overdue**; each building carries a **quality score of 89–100%**, which
      is adjacent to but NOT the same as the CRM's `health_score` and must not be auto-derived
      into it; and an inspection report carries id, building, date, inspector, duration,
      task counts (`1365/1371`), a pass threshold, per-item notes, assignee, resolved
      timestamps and before/after photos. **Nine buildings against 53 live CRM buildings**, so
      a sync enriches a slice and is never authoritative for the portfolio.

      **The SCHEMA is now settled too — read from the Supabase table editor on 2026-08-22.**
      Columns and sample rows below are measured, not assumed. What is still outstanding is
      only the four `INSPECTQA_*` variables and a role whose **RLS grants select and nothing
      else**, because read-only has to live in policies rather than in our good intentions.

      **`organizations`** — `id` uuid pk, `name` text, `created_at` timestamptz, `slug` text,
      `display_name` text. **Exactly ONE row today**: `5949ef54-0743-4b02-a85f-3f14014ca…`,
      *Beale's LLC*, slug `beales`, created 2026-04-21. So the multi-tenant filter this file
      has always insisted on is currently a **no-op — and it must still be written**, because
      InspectQA is being prepared as a SaaS spinout and a second org is the plan rather than a
      hypothetical. A sync that omits it works perfectly until the day it silently doesn't.

      **`buildings`** — `id` uuid pk, `org_id` uuid, `name` text, `subtitle` text, `address`
      text, `type` **enum `building_type`** (`healthcare`, `commercial_office` seen), `sqft`
      int4, `client_contact_email` text, `created_at` timestamptz, **`archived_at` timestamptz**.
      13 rows: 9 live and 4 archived, which is exactly the app's "9 in portfolio".

      - **`archived_at` is the soft delete** — the same shape as our `deleted_at`. A sync filters
        `archived_at is null`.
      - **But that does NOT remove the junk row.** `HTA` at *"800 test at Winchester ma"*
        (`9efd388e-…`) has `archived_at` **null**, so it is live as far as any query is
        concerned. It has to be excluded by hand or archived in InspectQA first. The four rows
        actually named `Test` / `TESt 123` *are* archived and filter out cleanly.
      - **`address` is ONE free-text field** — `46 Obery St Plymouth, MA 02360`, `181 Ballardvale
        St Wilmington, MA`. No structured city or postcode, so matching on address means parsing
        free text all over again. **Match on `id` once, by hand, and store it.** That is what
        `buildings.inspectqa_site_id` (uuid, present, **null on all 53**) and the empty
        `inspectqa_site_map` are already there for.
      - **`subtitle` is the customer**, and it is the disambiguator the mapping table above
        needs: `181 Ballardvale St - Ciminelli`, `at South Shore Health`, `Suite 3500 - Wound
        Care - Brown Health`. It is **null** on `The Wound Center`, `HTA` and one Test row, so a
        sync cannot depend on it being there.
      - **`sqft` is populated on 5 of the 9** — 46 Obery 30,080; 181 and 187 Ballardvale 100,000
        each; Cancer Center 182,000; Wound Center 15,000. The CRM is missing square footage on
        most of its book, so this is a legitimate **gap-fill suggestion** source. It is not
        money, so it does not run into the "money is never machine-proposed" rule.

      **`inspections`** — `id` uuid pk, `org_id` uuid, `building_id` uuid, `floor_id` uuid,
      `inspector_id` uuid, `status` **enum `inspection_status`** (`complete`, `in_progress`
      seen), `started_at` timestamptz, `completed_at` timestamptz, `score_pct` numeric,
      `tasks_total` int4, and one further `tasks_…` column cut off by the screenshot. **135
      rows.**

      - An `in_progress` inspection carries **null** `completed_at`, `score_pct` and
        `tasks_total`. A mirror must not read those as a zero score.
      - Some `complete` rows are **score 0.00 with `tasks_total` 0** — started and abandoned.
        Averaging over them would drag every building's number down.
      - **`floor_id` sits on the inspection**, yet the 46 Obery report renders findings across
        both 1st and 2nd floor. Whether an inspection is scoped to one floor or the column is
        optional is **not yet known** and should be settled before anything joins on it.

      **Other tables in that project, from the sidebar** — worth knowing before scoping v1:
      `action_items`, `audit_log`, `building_floor_sections`, `client_errors`, `floors`,
      `granola_notes`, `inspection_schedules`, `inspection_schedule_overrides`,
      `inspection_sections`, `inspection_tasks`, `marketing_leads`, `missed_walks`,
      `org_settings`, `permissions`, `photos`, `report_shares`, `role_permissions`, `rooms`,
      `section_tasks`, `sections`, `user_building_assignments`, `users`, plus views
      **`v_building_scoreboard`** and **`v_team_performance`**.

      **Two of those matter beyond the sync:**

      1. **InspectQA has its own `granola_notes` table.** Two systems may be reading the same
         Granola account, and the CRM already holds 138 linked Granola activities. Check what
         that table actually contains before Phase 8 writes anything — the "one email is one
         activity" rule assumed a single consumer of each source.
      2. **`v_team_performance` is flagged UNRESTRICTED**, meaning no RLS. A read-only role
         defined purely in policies would still expose it. Worth deciding deliberately rather
         than discovering.

      **Read `v_building_scoreboard` rather than recomputing a score.** The app already shows a
      per-building 89–100%, and a second implementation of one number is the mistake this repo
      refuses everywhere else.

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
| 2026-08-18 | **A tenant with its own contract is its own ACCOUNT, sharing a `site` with its landlord** | Settled on the first real case: Gener8 rents from Ciminelli at 181 Ballardvale and buys janitorial from Beale's directly. The test is whether they sign their own contract and pay their own invoice. Account MRR is a roll-up of its buildings, so filing a tenant under its landlord reports the tenant's money as the landlord's, and the tenant leaving reads as the landlord contracting — silently, and permanently in the revenue history |
| 2026-08-18 | **`findOrCreateSite()` and the backfill both REUSE a site before creating one, through one shared `siteKey()`** | The backfill grouped only the buildings that had no site yet, so a tenant added after it ran would have got a second site at an address that already had one — and `v_site_contracts` would then report two sites with one contract each, which is the exact double count `sites` was added to remove. The script was converted from `.mjs` to TypeScript to import the same key function the form uses: two spellings of "is this the same place" would eventually disagree, and the disagreement would split one physical building across two rows |
| 2026-08-18 | **A Granola note is matched on its TITLE, and the rule is containment rather than length** | Two shapes look identical to longest-wins and mean opposite things. `851 middle st suite 2100` contains `851 middle`, so the longer phrase is more specific and wins — which is how one address carrying a landlord contract and a tenant contract gets resolved. `Quincy Ambulatory and Plymouth Cordage Park` names two different places at two different points in the title, both true, and longest-wins would have silently picked one. So a phrase wholly inside another is discarded and what survives is counted by distinct record |
| 2026-08-18 | **A street address must carry its NUMBER; a derived name phrase must be a PHRASE** | This is the rule the whole phase rests on and it is not negotiable. `199 Reedsdale Road` appears in a private sleep-study note; requiring the number is why it matches nothing. A single-word matcher filed a family hospice note under Beth Israel Lahey on the word "Beth". Curated aliases are exempt because a person typed them — "HTA" is three characters and is real — so curation, not length, is the safeguard |
| 2026-08-18 | **A note matching nothing gets its id and its date and nothing else** | Ryan's call, and the strongest possible validation arrived from the data: the unmatched list contains a long note about a family member's suicidality, addiction and dismissal, which names Beale's. Had any phrase in it matched, its title and a 500-character summary would have been readable by four colleagues. A note matching TWO records keeps its title, because it is demonstrably about the business and one alias fixes it permanently |
| 2026-08-18 | **`fetchText` is lazy, and called only after a match** | Granola's list endpoint gives the title but not the summary, so the body costs a second request. Deferring it means the contents of a private note are never downloaded at all, rather than downloaded and then discarded. The privacy promise expressed as control flow, which is harder to quietly stop honouring than a comment |
| 2026-08-18 | **No suggestions and no `inferred` tier in 7c** | A narrowing of the plan, taken on looking at the data. An activity has one `account_id`, so two competing suggestions on one activity would let a reviewer accept both and have the second silently overwrite the first. An ambiguity is instead a `needs_review` row listed on `/admin/ingest`, where one alias resolves it and every future note shaped the same way. `/review` needed no change at all |
| 2026-08-18 | **The mirror's "already done" check requires a live activity, not just the status** | Both link columns are `on delete set null`, so undoing the backfill leaves 98 rows claiming `linked` with nothing behind them. Without the second condition those notes would be skipped for ever and the undo would have been a **one-way door** — the worst possible property for the button that exists to make a decision reversible. Proved by undoing and re-running: all 98 came back |
| 2026-08-18 | **The historical backfill is a local script signing in as an admin, not a cron drain** | The 300-second Hobby cap would need new state to carry one batch id across several invocations, or would produce eight Undo buttons for one decision. Locally there is no cap. It signs in as a real admin because `import_batches` is admin-write — correctly, since undo is an admin action and a year of history appearing in the app should have a person's name on it. Prompted rather than argued or added to `.env.local`: an argument lands in shell history and in `ps` |
| 2026-08-18 | **The probe is a terminal script and calls the same `matchItem()` the job calls** | Its most valuable output is the list of titles that matched nothing, which is exactly where the private notes are — so it belongs on Ryan's own screen and nowhere near a shared table. And a probe that matched slightly differently from the job would be two counts of one number, where the number decides what gets curated |
| 2026-08-18 | **The admin screens moved behind Settings, and `/review` moved into the main sidebar** | Import and Clean up sat in the nav where all five people saw them daily and four of them got "only an admin can do this" on every click — friction with no upside, on a team whose adoption is the whole risk. Ingest and Reference were the opposite problem: built, working, and reachable only by typing the URL. Review is neither: it is everyday work for any member, so it belongs in the nav — but hidden while the queue is empty, because a permanent "Review 0" is the same dead number this app refuses everywhere else |
| 2026-08-18 | **Your own password is changeable in the app; anybody else's is not** | The line is not "what is convenient", it is **which key it needs**. `updateUser({ password })` works on your own session with the anon key. Creating an account and resetting somebody else's both need the service role key, which bypasses every RLS policy and is deliberately absent from Vercel — so those two stay terminal jobs, and the screen prints the command rather than offering a form that could never work. A form that cannot work is worse than no form |
| 2026-08-18 | **A profile edit is refused in the server action, not merely disabled in the UI** | Three refusals: self-demotion, self-deactivation, and deactivating a service account. The first is the dangerous one — admin is the only role that can reach the People screen, so one careless save on your own row locks the company out of Import, Clean up, Reference and People at once, with no way back that does not involve the terminal. Greying out a `<select>` is a hint; the guard has to be where the write happens |
| 2026-08-19 | **Global search is one Postgres function, not four PostgREST queries** | Two reasons, and the second is the one that decides it. There were already two implementations of "find a record" — the three-way fan-out behind Quick Add and a filter box on six list pages — so a palette would have been the third, and Quick Add now calls the same function rather than its own. But separate queries also cannot rank against each other: three result sets can only be interleaved by a fixed type order, which is why the old search always put buildings first however badly they matched. One query lets an exact hit on an account name beat a partial hit on a building, which is what somebody typing a name expects |
| 2026-08-19 | `search_records()` is **SECURITY INVOKER**, and the comment says so | It is the default, so the note exists to stop a future session "tidying" it to definer. Invoker means the caller's own RLS decides, exactly as on the list pages, and the function cannot show anybody a row they could not already read. Definer would hand every row to anyone holding the public key |
| 2026-08-19 | Plain `ilike` with escaped metacharacters, **no `pg_trgm`** | Nothing in this schema installs an extension and `db:verify` runs a bare PGlite with none available, so adding one would take the whole schema out of test the day it went in — for a book of 21 accounts and 46 buildings where ilike is already instant. Escaping `%` and `_` is what makes `90_Libbey` a search for an underscore rather than for any character |
| 2026-08-19 | Search sits in the **header**, and Quick Add keeps the bottom-right corner alone | Two floating circles compete, and Quick Add's dominance of that corner is the reason logging is fast — the one thing this app cannot afford to slow down. The header is sticky, so search is one tap at any scroll position, and the button is `h-9` on a phone rather than the app's usual `h-7` because 28px is under every thumb-target guideline |
| 2026-08-19 | Closed and lost records **are** searchable, unlike the Granola phrase book | Opposite decisions from the same facts, for opposite jobs. A phrase from a deal closed two years ago would misfile tonight's note, so matching admits only open deals. Search is navigation: somebody looking up a past deal is looking for the past deal |
| 2026-08-19 | **The audit log's own policy now tests `can_see_rates()`, not just `is_member()`** | Found while planning the 6b screen, and it was a live leak with no screen involved: both rate tables are audited, so every pay rate ever set sat in `audit_log.new_values` as plain jsonb readable by anyone who could sign in. The rate tables' RLS was being walked around by their own history. Fixed in the policy rather than the renderer, because a screen only protects itself — a report, a CSV export or a request straight from a phone all go around it. The 6b feed should still render from an explicit **allowlist** of tables, since a denylist would start printing a new rate-carrying table the day somebody audits one |
| 2026-08-19 | Phase 6 was **split into 6a and 6b** rather than half-built | Ryan asked to be pushed back on if it was more than one session, and it is: turning jsonb diffs into English needs per-table field labels, value formatters and FK-uuid-to-name resolution across four record pages plus an admin feed. Search finished and tested beats three things started |
| 2026-08-19 | **The history renderer is an allowlist of tables AND of fields, not a filter over everything audited** | Same argument as `gap_fill_allows()`, and the same failure it avoids: a denylist starts printing a new column the day somebody adds one, and the column that eventually gets added is the one nobody wanted printed. It also puts a second lock on the pay rates — the policy fixed in 6a is the first, and this means the screen would still not print a rate if that policy were ever reverted |
| 2026-08-19 | A building's History includes its **contract values**, and drops the row that closes the previous period | The money is what anybody opening a history is looking for, and it does not live on `buildings`. `set_building_monthly_value()` writes two entries for one price change; the second only moves `end_date` and is the same call tidying up after itself. Dropped by a **named rule** rather than a filter, with `db:verify` asserting both that the shape exists and that a `correct_open_contract_value()` edit — which touches the same table and is the most consequential edit anybody makes — survives it |
| 2026-08-19 | The record's name comes from the entry's **own snapshot**, never a lookup | A record archived since still reads by name rather than as a uuid, and it costs no join. The uuids inside a diff do need looking up, and `src/lib/reference.ts` is the wrong tool for it: `getOwners()` hides service accounts, which wrote every ingest row, and the rest filter `is_active`, so a retired stage or competitor would render as a dash. History has to name what was true at the time |
| 2026-08-19 | The feed **hides spreadsheet imports by default and names the number** | 1,544 of 1,855 entries are one import. Showing them makes the first page fifty identical rows and the feed reads as broken; hiding them silently is the dead-number mistake this app refuses everywhere else. Imports already have their own screen and their own Undo, so the default is what people did by hand — with the count of what is not shown, one click away |
| 2026-08-19 | Two `not-found.tsx` files, not one | The eight `notFound()` callers all live inside `(app)`, so theirs keeps the sidebar — after a dead link the fastest thing is the nav you were already using. A URL matching no route at all has no shell and no session, so that one carries the logo and its own way home |
| 2026-08-19 | **The nightly job records every run, and the row is opened when the run STARTS** | Nothing recorded this before, so a quiet week and a dead cron were the same picture — "last seen" only moves when something is ingested. Opening the row first is what makes a killed function visible: a run that never closed its own row is a run the platform stopped, and a row written only on success would be missing exactly when it mattered |
| 2026-08-19 | …and **staleness**, not the rows, is the load-bearing signal | A failed sign-in cannot write a row at all, because writing needs the session that failed — and a cron that never fires writes nothing either. One mechanism catches both: nothing having run for over 26 hours, on a job that runs twice a night. The screen says this out loud rather than implying the absence of a row means nothing happened |
| 2026-08-19 | **No delta tokens, and no cursor table** | The original 7b sketch had both. The existing design already refused: idempotency lives in `ingested_items`, "one fact rather than two that can disagree", and a durable cursor is precisely that second fact. Mail does not need one — an email never changes, so a received-date filter plus a two-day lookback is enough. Calendar events do change, and a rolling re-read handles that because the mirror turns a re-seen item into a timestamp touch |
| 2026-08-19 | **No table of mailboxes: ask for all five and let the access policy answer** | The Entra group is the source of truth and the app cannot read it — `Group.Read.All` was never consented, and asking for it would let this client id enumerate every group in the company, on a registration whose whole design is minimum access. A refusal is recorded as "not in the ingest group" rather than as an error, which makes group membership visible in the app without duplicating it. The cost is stated rather than discovered: the day somebody joins that group their client mail starts being logged, with no further decision taken in the app |
| 2026-08-19 | **Every Graph shape was measured with a probe before a line of parser was written** | The rule that made the Granola title matcher come out right, applied again and earning its keep again: three of the shapes are not what the documentation implies. The worst is a calendar time returned with the zone in a sibling field and no marker on the string, which `new Date()` reads as local — every meeting four hours out, silently, with nothing ever looking broken enough to investigate |
| 2026-08-19 | The connector **never requests a message body** | `bodyPreview` only, which Graph caps at 255 characters, so the 500-char snippet limit can never be filled — and that is the point. "No full bodies, ever" becomes a fact about the network traffic rather than a promise about storage: there is no copy to leak because none is fetched. Inbox and Sent Items are read by name rather than sweeping every folder, so a spoofed message in Junk cannot become an activity |
| 2026-08-19 | **No join between an Outlook meeting and the Granola note about it** | Measured before deciding, which is why the answer is "do not build it": 1 of 17 notes carried a calendar event at all, and that one matched no Outlook meeting. The sources barely intersect — Granola captures inspections dictated into a phone, Outlook holds scheduled meetings. The collision a join would prevent has no real example, so the risk is written down and revisited if it ever appears. Same call as delta tokens and the cursor table |
| 2026-08-19 | **A screen states what the environment holds, rather than leaving it to be inferred from a run** | Setting a variable in Vercel and wanting to know whether it took should not mean waiting seven hours for the cron. The Sources panel reads the environment it is rendered in and says so. And it names the mailboxes rather than counting them, because a count is a number nobody can check — the first render said "6" when there are five people, and only a list made the stray QA account visible |
| 2026-08-19 | A 403 from a mailbox is **the expected answer**, but zero readable mailboxes is fatal | Four of five people are outside the ingest group and will answer 403 every night for as long as that stays true, so it is counted rather than raised. Nothing readable at all is different: it means the night achieved nothing and tomorrow will too, so it throws and shows up red |
| 2026-08-20 | **A contact with no account is still an exact match — to the PERSON, with a null account** | The exact tier reduced its matched contacts to the set of their non-null account ids and required exactly one, so an accountless contact counted for nothing at all. 63 of 99 live contacts have no account, 47 with an address, so most of the book was unreachable by the tier the whole design rests on — and it was filing a real contact in the strangers tray in production every night. A matched address is a fact about a person whether or not somebody finished filling their record in. What is genuinely unknown is the company, and null says so rather than inventing one. Two accountless contacts is still nothing, because picking one of them is exactly the guess this tier exists to refuse |
| 2026-08-20 | …and the domain tier now carries that contact as well | It hardcoded `contactId: null`, so a known person writing from a mapped domain was linked to the company and then discarded. The account still wins, because an account is worth more than a person, but there was never a reason to throw the person away |
| 2026-08-20 | **A recurring series contributes ONE next step, not one per occurrence** | `calendarView` expands a series across the window, which is what makes a standing meeting visible and, left alone, what would make it deafening: 35 future occurrences of 11 meetings inside a 30-day horizon. Every occurrence that has already started is kept, because each of those really did happen; only the earliest still ahead survives. It is stable rather than merely smaller — the earliest is still the earliest two hours later, so the second nightly pass touches a timestamp, and the series rolls forward a meeting at a time |
| 2026-08-20 | **The probe counts the window before it samples it** | `$top` was 5, and five was enough to reach the wrong answer: `calendarView` returns events in start order, the first five happened to be one-offs, and this file recorded on the strength of it that every event in the tenant was a single instance. It is 40 occurrences across 11 series. A sample answers what something looks like and never what is in there — the same mistake as counting a total from the view that computes it |
| 2026-08-20 | **Removing a profile is possible, refused by default, and cannot half-finish** | Deactivating stays the way somebody leaves, and the audit log is the test: anybody with a single entry cannot be removed at any flag, which is why the QA logins are kept. Brendan Mulligan had none, so he could go — and had to, because a deactivated profile drops out of `colleaguesByEmail` and starts reading as an outside client on every meeting he is on. His CONTACT row was archived rather than deleted: it carries two coaching notes about his performance, and soft-delete-only is the standing rule. The delete is safe by construction rather than by care — every FK to `profiles` is NO ACTION, so Postgres refuses the whole thing and names the constraint if anything still points at them |
| 2026-08-20 | Vercel Hobby cron fires within the hour, not on it | 07:00 and 09:00 in `vercel.json` landed at 07:51 and 09:45. A late run is not a broken one, and staleness — nothing for over 26 hours — remains the signal that means something |
| 2026-08-21 | **How much of a body is stored is a property of the SOURCE, and mail is the one that stays capped** | *"No full bodies, ever"* was a promise about a **mailbox** and it is kept exactly as it was — `graph.ts` asks only for `bodyPreview`, so there is no full message to store even if somebody wanted one. A Granola note is not a mailbox: it is a summary somebody at Beale's dictated about a Beale's building, `granola.ts` already downloaded all of it, and the 500-character cap was throwing about two thirds of the average note away for no saving of any kind. `BODY_LIMIT` is an exhaustive `Record` over the enum so a new source has to answer for itself rather than inherit a number nobody chose |
| 2026-08-21 | …and it is keyed on the ITEM's source, never on the source descriptor | The descriptor `runIngest` is handed carries a display `name`. One connector called `graph` emits **both** `outlook` and `outlook_calendar` items, and the fixture source emits items marked `outlook` too — so keying a storage policy off that string could not express mail and calendar separately, and would have capped a fixture row and a real Graph row differently while every field anyone can see on them was identical |
| 2026-08-21 | The mirror snippet and `next_steps.detail` stay at 500 while the activity body does not | Not an oversight, and each call site now says so. The mirror is a **review aid**: `/review` and `/admin/ingest` are lists somebody triages, and a 1,400-character block per row turns a triage queue into a reading queue. It is also what holds the same text at two stored copies rather than three, since `activities` is audited and `ingested_items` deliberately is not. `next_steps.detail` is graph-only in practice — a Granola note is never future-dated — and nothing renders it yet |
| 2026-08-21 | **A Granola summary keeps its shape, because it is a document rather than a paragraph** | Measured on a real note before deciding: about 1,700 characters across five headed sections, with bullets, nested sub-bullets and blank lines. `toSnippet` flattens all whitespace, which is right for a 500-character extract and destroys this. Multi-line bodies were never new to the column either — the workbook importer has always joined an outcome and a next step with a blank line, and both render sites already carried `whitespace-pre-wrap`, so the flattening was the odd one out. Leading indentation survives on purpose: once the markdown fallback loses its list markers, a sub-point's indent is the only thing left saying it was one |
| 2026-08-21 | **A clamp on the timeline had to come with an expander, because there is no activity detail page** | `src/app/(app)/activity/` holds `actions.ts` and `page.tsx` and nothing else, so that paragraph is the only place in the whole app a note can be read. Clamping without a disclosure would have stored 1,400 characters and shown 240 of them for ever. The excerpt goes in the `<summary>` rather than the whole note under a `line-clamp`, because a summary's text content is its **accessible name** — the tempting version would have a screen reader announce the entire note as the button's label, every time, with no way past it |
| 2026-08-21 | `EXCERPT_LENGTH` is its own number and is deliberately not `SNIPPET_LENGTH` | One is about what gets stored and why; the other is about how much vertical space a row of a 200-row feed may take. Tying them would let a storage decision silently relay out every screen. The same reasoning says that if the feed ever gets too heavy the fix is a lower **row** limit — never a `substring()` in the query, which would be a second truncation number destined to disagree with the first |
| 2026-08-21 | **Three runs on the Ingest screen, but still ten fetched** | The panel listed everything it fetched and pushed the sources and the domain map off the screen. What is *rendered* was always independent of the 26-hour staleness rule — that is computed from `runs[0]` inside `fetchRunHealth` before anything renders — so the fetch was left alone rather than lowered, which keeps the two facts from ever needing to agree. The disclosure says how many are **hidden**, not how many exist: `ingest_runs` has no delete policy and ten is only this panel's window |
| 2026-08-21 | A display name loses the site or delegate a shared mailbox carries | Exchange writes *"Eley, Thelma @ Charlotte"* and *"Nick Deletsky / Anthony"*, and both reached `/review` as contact suggestions with the suffix welded into a first name. The spaces around the separator are required, which is the whole safety of the rule — a hyphenated surname and an address that arrived by accident are untouched. It can still keep the wrong half if a mailbox is ever written the other way round, and that is accepted rather than solved: it is a name on a suggestion somebody reads and can edit before accepting, so the cost is a correction, not a bad row |
| 2026-08-21 | **Done writes `status` and `completed_at`, and deliberately leaves `activity_id` null** | The column exists for "what this meeting became", and the tempting version offers a picker of recent activities. It would be empty most times anybody opened it: the activity usually does not exist yet at the moment you mark a meeting done — the Granola note lands that night, the email later — and people learn very fast to stop opening a thing that is empty. The honest way to fill it is a **join at ingest time** on `(source, external_id)`, which the next step and the activity already share from the same calendar event: a lookup, not a judgement. A half-filled column is worse than an empty one |
| 2026-08-21 | **Overdue is its own always-on section, not folded into Today and not gated on Today** | Three different jobs: overdue is a demand, Today is a briefing, Coming up is a preview. Widening the Today window backwards would make a two-week-old meeting read as though it were on today, which is a lie the strip did not previously tell. And gating it on Today being empty would hide it on the day you have five meetings, which is precisely the day yesterday's slips. It is safe to show always because it **drains** — closing what is on screen brings the next five within reach — which is also why no `/next-steps` page was built |
| 2026-08-21 | **A closed row stays in place with an Undo, so `setNextStepStatus` is the one action in the app with no `revalidatePath`** | Revalidating re-renders the dashboard and drops the row the instant it is closed, taking the Undo with it — and an unrecoverable Dismiss is the exact problem this work exists to remove, since the only way back would be the SQL editor that left `changed_by` null in the first place. It is safe only because **one file reads `next_steps` and one page renders it**; the reason is written into the action, because a missing `revalidatePath` otherwise reads as an omission |
| 2026-08-21 | **The owner filter on the update is app policy, not a security boundary, and `db:verify` says so out loud** | `next_steps` is `member_rw`: any member may close any next step, and a check now asserts that rather than leaving it to be discovered. The app narrows it to your own because closing somebody else's work silently is rude. It comes with `.select('id')` and an explicit refusal — without that, a row that is not yours updates zero rows and PostgREST reports success, so the screen would say "Marked done" over a write that never happened, which is the class of quiet lie this app refuses everywhere else |
| 2026-08-21 | **Dismissing an occurrence means "not this week", not "never again"** | `collapseRecurringSeries` keeps the earliest occurrence still ahead, so a dismissal holds for as long as that occurrence is in the future and nothing slides in behind it; once its start passes, the next one arrives as a new next step with its own `external_id`. Correct, and not obvious — a person may well expect the following week's to appear at once. Recorded rather than changed, because the alternative is a "dismiss the whole series" concept that nobody has asked for |
| 2026-08-22 | **A calendar event that MOVES updates its next step; the migration comment stops being a lie** | `20260818090000_ingest.sql:107` promised this from the beginning and the unique key delivered only half of it — duplication was prevented, the update was never written. It cost nothing while next steps were invisible; it costs trust now they are the first thing on the dashboard, because a meeting moved to Thursday reads as Tuesday and then as *missed*. The fix goes INSIDE the existing already-seen branch without touching its condition, which is keyed on `'linked'` for a completely different reason — retro-linking a Granola note after an alias is added |
| 2026-08-22 | Only an **open** next step is touched by a move | Closing one was a decision, and a nightly job that quietly reopens or re-times it is how somebody stops trusting the strip. It also protects a rule already written down: `collapseRecurringSeries` keeps the earliest occurrence still ahead, so a dismissal is *meant* to hold while that occurrence is in the future, and reviving it on a move would silently undo "dismiss means not this week" |
| 2026-08-22 | **`due_at` is compared as an instant, never as a string** | The single line the feature turns on. Postgres returns `+00:00` and the item carries `.000Z` — the same moment written two ways — so a string comparison would report every meeting as rescheduled every night, write an audit row per meeting per run, and make the new counter on `/admin/ingest` meaningless. Pinned by a `graph:probe --selftest` check that names the trap, and proved against the real database by an identical second run reporting zero |
| 2026-08-22 | The title moves with the time; `detail` deliberately does not | `title`, `due_at` and `all_day` are exactly what the dashboard strip draws, so a stale one of them is a visible lie. A rename to `CANCELLED - site walk` is also the **only** signal Graph gives for a cancellation the organiser renames rather than deletes, which is worth having while real cancellation detection waits for its own session. `detail` is rendered nowhere, so keeping it current would be audit-log noise and nothing else |
| 2026-08-22 | A move is **not** a re-match | If the attendees changed, the account and contact links stay as they were. A meeting silently moving to a different account overnight is a suggestion-shaped problem — something a person reads and accepts — not something an update does on its own at 3am |
| 2026-08-22 | **Cancellation detection is absence detection, and is its own session** | Graph stops returning a cancelled event entirely, so nothing arrives to compare against. Two traps make this genuinely dangerous rather than merely fiddly: `collapseRecurringSeries` deliberately omits most occurrences, so a naive "not seen tonight" sweep would dismiss every collapsed one; and a 403, a truncated page or a deadline stop would read as mass absence. Auto-dismissing real meetings is a worse failure than the one being fixed |
| 2026-08-22 | The reschedule rule is a **pure function**, pinned by the probe rather than by a unit runner | This repo has no unit runner, and the established answer is the probe self-tests — 51 checks that run with no network, no database and no credentials. Keeping `nextStepPatch()` free of a clock and a client is what makes all ten of its rules testable that way, including the two that are impossible to see in a browser: a `done` row being left alone, and two spellings of one instant not being a change |
| 2026-08-13 | Health dots are the one semantic use of colour in the app | Green/amber/red is what the team already reads on the spreadsheet, and navy cannot carry that meaning. It stays inside the brand rules because they are **dots, never text** — the label sits beside each one in normal charcoal, so nothing depends on seeing the colour. Amber is the brand gold, used as a fill, which is exactly what the guide permits |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
