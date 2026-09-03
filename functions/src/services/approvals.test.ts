import { describe, expect, it } from 'vitest';
import type { TravelRequest } from '@tms/shared';
import { computeEligibility, DEFAULT_POLICY } from '@tms/shared';
import { travelTags } from './approvals';

const base = (over: Partial<TravelRequest>): TravelRequest =>
  ({
    id: 'TRV-2026-0420',
    category: 'INTERNATIONAL',
    itinerary: { stops: [], nights: 5, distanceKm: 7000, departAt: '2026-09-12T06:00:00.000Z', returnAt: '2026-09-17T18:00:00.000Z' },
    costing: { lines: [], total: 0, advanceEligibleTotal: 10000, employeeContribution: 0, paidDirectly: 0, organisationCost: 0 },
    travellers: [{ name: 'N', initials: 'N' }],
    isGroup: false,
    version: 1,
    eligibility: null,
    ...over,
  }) as TravelRequest;

describe('travelTags (approval queue chips)', () => {
  it('flags late international notice and short departure', () => {
    const el = computeEligibility({ distanceKm: 7000, departAt: '2026-09-12T06:00:00.000Z', returnAt: '2026-09-17T18:00:00.000Z', category: 'INTERNATIONAL', asOf: '2026-09-02T09:00:00.000Z', policy: DEFAULT_POLICY });
    const tags = travelTags(base({ eligibility: el }), '2026-09-03T08:00:00.000Z');
    expect(tags).toEqual(expect.arrayContaining([{ label: 'International', tone: 'info' }, { label: '5 nights', tone: 'neutral' }, { label: 'Departs in 9 days', tone: 'neutral' }, { label: 'Under 2-week notice', tone: 'blocked' }]));
  });
  it('uses the pending tone inside a week and lead-time chip for domestic', () => {
    const el = computeEligibility({ distanceKm: 300, departAt: '2026-09-05T06:00:00.000Z', returnAt: '2026-09-08T18:00:00.000Z', category: 'FIELD', asOf: '2026-09-03T09:00:00.000Z', policy: DEFAULT_POLICY });
    const tags = travelTags(base({ category: 'FIELD', itinerary: { stops: [], nights: 3, distanceKm: 300, departAt: '2026-09-05T06:00:00.000Z', returnAt: '2026-09-08T18:00:00.000Z' }, eligibility: el }), '2026-09-03T08:00:00.000Z');
    expect(tags).toEqual(expect.arrayContaining([{ label: 'Field travel', tone: 'neutral' }, { label: 'Departs in 2 days', tone: 'pending' }, { label: 'Lead time short', tone: 'pending' }]));
  });
});
