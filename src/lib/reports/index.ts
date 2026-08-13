import type { createClient } from '@/lib/supabase/server'

/**
 * Every report is fetched by one function that both the page and its CSV route
 * call. That is the whole point of this folder: a CSV that disagrees with the
 * screen it was downloaded from is worse than no CSV, and the only reliable way
 * to stop that is to give them one source.
 */
export type Supabase = Awaited<ReturnType<typeof createClient>>

/** The six reports, in the order they appear on the index. */
export const REPORTS = [
  {
    slug: 'revenue',
    title: 'Revenue over time',
    blurb: 'MRR month by month, and what moved it — new business, expansion, contraction, churn.',
  },
  {
    slug: 'accounts',
    title: 'Account expansion',
    blurb: 'Which accounts have grown and which have shrunk, against 3, 6 and 12 months ago.',
  },
  {
    slug: 'pipeline',
    title: 'Pipeline',
    blurb: 'The funnel, win rate, how long deals take, and why they are won and lost.',
  },
  {
    slug: 'losses',
    title: 'Losses',
    blurb: 'Deals lost and buildings lost, the reasons behind them, and who took them.',
  },
  {
    slug: 'health',
    title: 'Client health',
    blurb: 'Healthy, needs attention and at risk — with the revenue sitting behind each.',
  },
  {
    slug: 'activity',
    title: 'Activity coverage',
    blurb: 'Which accounts have gone quiet, ranked by how long since anyone logged anything.',
  },
] as const
