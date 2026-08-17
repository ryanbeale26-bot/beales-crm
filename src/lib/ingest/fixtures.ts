import 'server-only'

import type { RawItem, SourceFetch } from '@/lib/ingest'

/**
 * A source made of hand-written examples, so Phase 7a runs end to end with no
 * Microsoft app registration and no Granola key.
 *
 * This exists to be thrown away, and that is the point: it exports exactly the
 * `SourceFetch` shape `graph.ts` and `granola.ts` will export, so swapping a
 * real connector in is one line of wiring in the route. Everything downstream —
 * the matcher, the suggestion engine, the review screen, undo — is exercised
 * for real against the real database before any credential exists.
 *
 * The addresses here are deliberately fictional and match nothing in the
 * database, so a fixture run against production creates nothing until somebody
 * points them at a real account on purpose. That is what makes it safe to leave
 * wired up.
 */

const FIXTURES: RawItem[] = [
  {
    source: 'outlook',
    externalId: '<fixture-inbound-001@example.invalid>',
    mailboxEmail: 'ryan@bealesllc.com',
    occurredAt: '2026-08-16T13:20:00.000Z',
    subject: 'Re: Nightly coverage at the Clinton site',
    text:
      'Thanks Ryan — the overnight team has been on time all week and the loading dock ' +
      'looks much better. Can you send over the updated scope so I can get it in front ' +
      'of our facilities committee?',
    participants: [
      { address: 'facilities@example.invalid', name: 'Dana Whitfield', role: 'from' },
      { address: 'ryan@bealesllc.com', name: 'Ryan Beale', role: 'to' },
    ],
    threadKey: 'fixture-thread-001',
  },
  {
    source: 'outlook',
    externalId: '<fixture-outbound-002@example.invalid>',
    mailboxEmail: 'ryan@bealesllc.com',
    occurredAt: '2026-08-16T15:05:00.000Z',
    subject: 'Updated scope — Clinton',
    text: 'Attached. Happy to walk the building again next week if that helps.',
    participants: [
      { address: 'ryan@bealesllc.com', name: 'Ryan Beale', role: 'from' },
      { address: 'facilities@example.invalid', name: 'Dana Whitfield', role: 'to' },
      { address: 'procurement@example.invalid', name: 'Alex Roy', role: 'cc' },
    ],
    threadKey: 'fixture-thread-001',
  },
  {
    source: 'outlook_calendar',
    externalId: 'fixture-ical-003@example.invalid',
    mailboxEmail: 'ryan@bealesllc.com',
    // A future meeting: this must become a next step, never an activity.
    occurredAt: '2026-08-24T14:00:00.000Z',
    subject: 'Site walk — Clinton',
    text: 'Walk the loading dock and the second floor with the facilities committee.',
    participants: [
      { address: 'ryan@bealesllc.com', name: 'Ryan Beale', role: 'organizer' },
      { address: 'facilities@example.invalid', name: 'Dana Whitfield', role: 'attendee' },
    ],
    threadKey: 'fixture-ical-003@example.invalid',
    scheduled: { startsAt: '2026-08-24T14:00:00.000Z', allDay: false },
  },
  {
    // Nobody on this one is known, so it must be left alone entirely — only the
    // sender's address is recorded, and no subject or body reaches the database.
    source: 'outlook',
    externalId: '<fixture-stranger-004@example.invalid>',
    mailboxEmail: 'ryan@bealesllc.com',
    occurredAt: '2026-08-16T09:00:00.000Z',
    subject: 'Quick question about your janitorial contract',
    text: 'Hi Ryan, I represent a supplier and wondered if you had five minutes.',
    participants: [
      { address: 'sam@unknown-supplier.invalid', name: 'Sam Idowu', role: 'from' },
      { address: 'ryan@bealesllc.com', name: 'Ryan Beale', role: 'to' },
    ],
    threadKey: 'fixture-thread-004',
  },
]

export const fixtureSource: SourceFetch = async () => ({ items: FIXTURES, cursor: null })

/** The fixtures, for the admin screen to show what a dry run would do. */
export function fixtureItems(): RawItem[] {
  return FIXTURES
}
