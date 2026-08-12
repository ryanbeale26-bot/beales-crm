# Beale's CRM

Internal CRM for the Beale's LLC leadership team. Next.js + Supabase + Vercel.

For the full picture — what this is, who uses it, the schema, the phase plan and
every decision made so far — read [`CLAUDE.md`](./CLAUDE.md).

## First-time setup

**1. Create the Supabase project.** A new one, separate from InspectQA. Name it
`beales-crm`, region `us-east-1`. Save the database password somewhere permanent;
it is shown once and cannot be recovered.

**2. Add your credentials.**

```bash
cp .env.local.example .env.local
```

Fill in the three values from Supabase → Project Settings → API. The
`service_role` key bypasses all security — it never goes in a `NEXT_PUBLIC_`
variable and never gets imported by anything in `src/`.

**3. Apply the database schema.**

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

```bash
npx supabase db push
```

Success looks like a list of the tables it created, and no errors. In the
Supabase dashboard every table should show "RLS enabled".

**4. Create your account.**

```bash
npm run user:create -- --email you@example.com --name "Ryan Beale" --role admin --rates
```

It prints a temporary password. Repeat for the other four, without `--rates`
unless they should see pay rates and margin.

**5. Run it.**

```bash
npm run dev
```

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Local app on http://localhost:3000 |
| `npm run db:verify` | Runs every migration and `seed.sql` against a throwaway in-memory Postgres, then asserts that security, triggers and the revenue views behave. **Run after any schema change.** No Docker required |
| `npm run user:create` | Creates or updates one of the five accounts |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, without building |
| `npm run build` | Production build |
| `npx supabase db push` | Applies new migrations to Supabase |

## Ground rules

- Every table has Row Level Security enabled with an explicit policy. No exceptions.
- Revenue maths lives in Postgres views, never in React, so "what is MRR" has one answer.
- A building's monthly value is never edited in place — `set_building_monthly_value()`
  closes the old period and opens a new one, which is what makes the revenue
  history report possible.
- Pay rates, bill rates and margin are visible only to profiles with `sees_rates`.
- No application data in `localStorage`.
