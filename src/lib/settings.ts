/**
 * The admin screens, gathered in one place.
 *
 * Three of these existed for weeks and were reachable only by typing the URL;
 * two more sat in the main sidebar where all five people saw them and only one
 * could use them. The list is data rather than markup for the same reason
 * `REPORTS` in `src/lib/reports/index.ts` is: adding a screen should be one
 * entry here, not a new block of JSX on an index page.
 *
 * Every destination is admin-only. The Settings page renders this list only for
 * an admin, so a non-admin sees no Administration section at all — not a row
 * that turns them away when they click it.
 */
export const ADMIN_SECTIONS = [
  {
    href: '/admin/ingest',
    title: 'Ingest',
    blurb: 'What the nightly job saw, the phrase aliases behind matching, and the domain map.',
  },
  {
    href: '/admin/import',
    title: 'Import',
    blurb: 'Spreadsheet imports, the sheets for filling in the gaps, and undoing a batch.',
  },
  {
    href: '/admin/cleanup',
    title: 'Clean up',
    blurb: 'Archive duplicated accounts and buildings without touching the revenue reports.',
  },
  {
    href: '/admin/reference',
    title: 'Reference data',
    blurb: 'Deal stages and their win probabilities, loss reasons, win reasons, lead sources.',
  },
  {
    href: '/settings/people',
    title: 'People',
    blurb: 'Who can sign in, what they can do, and who sees pay rates.',
  },
] as const
