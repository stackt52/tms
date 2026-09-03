import { describe, expect, it } from 'vitest';
import type { Location, Rate, TravelRequest } from '@tms/shared';
import { DEFAULT_POLICY, DEFAULT_WORKFLOWS } from '@tms/shared';
import { applyPatch, buildApprovalChain, invalidateApprovals, materialChanged, newRequest, recompute, validateForSubmit, AUTO_PER_DIEM_LINE, AUTO_ACCOMMODATION_LINE } from './travelRequests';
import type { Actor } from '../lib/context';

const lusaka: Location = { id: 'loc-lusaka', name: 'Lusaka — IHM HQ', town: 'Lusaka', province: 'Lusaka', country: 'ZM', lat: -15.418, lng: 28.362, isDutyStation: true };
const ndola: Location = { id: 'loc-ndola', name: 'Ndola — Copperbelt PHO', town: 'Ndola', province: 'Copperbelt', country: 'ZM', lat: -12.968, lng: 28.633, isDutyStation: false };
const chongwe: Location = { id: 'loc-chongwe', name: 'Chongwe DHO', town: 'Chongwe', province: 'Lusaka', country: 'ZM', lat: -15.329, lng: 28.682, isDutyStation: false };
const rates: Rate[] = [
  { id: 'r1', key: 'PER_DIEM_DOMESTIC', label: 'Per diem', value: 1200, unit: 'ZMW_PER_NIGHT', effectiveFrom: '2026-01-01', effectiveTo: null, version: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'r2', key: 'PER_DIEM_DOMESTIC', label: 'Per diem', value: 1300, unit: 'ZMW_PER_NIGHT', effectiveFrom: '2026-10-01', effectiveTo: null, version: 2, createdAt: '2026-01-01T00:00:00.000Z' },
];
const cfg = { policy: DEFAULT_POLICY, rates, locationById: new Map([lusaka, ndola, chongwe].map((l) => [l.id, l])) };
const actor: Actor = {
  uid: 'u-chanda',
  roles: ['TRAVELLER'],
  profile: { id: 'u-chanda', email: 'c@x', displayName: 'Chanda Mwansa', initials: 'CM', avatarTone: 'deep', roles: ['TRAVELLER'], dutyStationId: 'loc-lusaka', unitId: 'unit-hsu', supervisorId: 'u-thandiwe', costCentreIds: ['CC-114'], active: true, createdAt: '2026-01-01T00:00:00.000Z' },
};

function draft(): TravelRequest {
  return newRequest(actor, 'TRV-2026-0001', 1, 2026, 'FIELD');
}

describe('recompute', () => {
  it('derives nights, distance, eligibility and an automatic per-diem line', () => {
    const req = recompute(applyPatch(draft(), { itinerary: { destinationId: 'loc-ndola', departAt: '2026-09-08T04:30:00.000Z', returnAt: '2026-09-11T16:00:00.000Z' } }), cfg, { asOf: '2026-09-01T08:00:00.000Z' });
    expect(req.itinerary.nights).toBe(3);
    expect(req.itinerary.distanceKm).toBeGreaterThan(300);
    expect(req.eligibility?.perDiemEligible).toBe(true);
    expect(req.allowances.perDiemNights).toBe(3);
    expect(req.allowances.perDiemRate).toBe(1200);
    const pd = req.costing.lines.find((l) => l.id === AUTO_PER_DIEM_LINE)!;
    expect(pd.amount).toBe(3600);
    expect(req.costing.total).toBe(3600);
  });

  it('uses the scheduled rate once departure is on/after its effective date', () => {
    const req = recompute(applyPatch(draft(), { itinerary: { destinationId: 'loc-ndola', departAt: '2026-10-05T04:30:00.000Z', returnAt: '2026-10-07T16:00:00.000Z' } }), cfg);
    expect(req.allowances.perDiemRate).toBe(1300);
  });

  it('denies per diem inside 55 km and drops the auto line', () => {
    const req = recompute(applyPatch(draft(), { itinerary: { destinationId: 'loc-chongwe', departAt: '2026-09-08T04:30:00.000Z', returnAt: '2026-09-08T14:00:00.000Z' } }), cfg);
    expect(req.eligibility?.distanceOk).toBe(false);
    expect(req.eligibility?.hoursOk).toBe(false);
    expect(req.allowances.perDiemNights).toBe(0);
    expect(req.costing.lines.some((l) => l.id === AUTO_PER_DIEM_LINE)).toBe(false);
  });

  it('honours a distance override and adds an accommodation line when required', () => {
    const req = recompute(
      applyPatch(draft(), { itinerary: { destinationId: 'loc-chongwe', distanceOverrideKm: 120, departAt: '2026-09-08T04:30:00.000Z', returnAt: '2026-09-10T16:00:00.000Z' }, accommodation: { required: true, ratePerNight: 1450 } }),
      cfg,
    );
    expect(req.itinerary.distanceKm).toBe(120);
    const acc = req.costing.lines.find((l) => l.id === AUTO_ACCOMMODATION_LINE)!;
    expect(acc.quantity).toBe(2);
    expect(acc.amount).toBe(2900);
    expect(req.costing.total).toBe(2400 + 2900);
  });

  it('keeps client-provided cost lines verbatim when explicitLines is set', () => {
    const base = recompute(applyPatch(draft(), { itinerary: { destinationId: 'loc-ndola', departAt: '2026-09-08T04:30:00.000Z', returnAt: '2026-09-11T16:00:00.000Z' } }), cfg);
    const lines = [{ id: 'x', category: 'GROUND_TRANSPORT' as const, label: 'Shuttle', quantity: 2, unitCost: 300, amount: 0, receiptRequired: true }];
    const req = recompute(applyPatch(base, { costingLines: lines }), cfg, { explicitLines: true });
    expect(req.costing.lines).toHaveLength(1);
    expect(req.costing.total).toBe(600);
  });
});

describe('material change + version bump', () => {
  it('flags itinerary changes as material and invalidates prior approvals', () => {
    const before = recompute(applyPatch(draft(), { itinerary: { destinationId: 'loc-ndola', departAt: '2026-09-08T04:30:00.000Z', returnAt: '2026-09-11T16:00:00.000Z' } }), cfg);
    before.approvals = [{ id: 'a1', stageKey: 'supervisor', stageLabel: 'Unit Supervisor', role: 'UNIT_SUPERVISOR', actorId: 'u-t', actorName: 'T', decision: 'APPROVED', requestVersion: 1, at: '2026-09-01T00:00:00.000Z' }];
    const after = recompute(applyPatch(before, { itinerary: { returnAt: '2026-09-12T16:00:00.000Z' } }), cfg);
    expect(materialChanged(before, after)).toBe(true);
    const bumped = invalidateApprovals(after);
    expect(bumped.version).toBe(2);
    expect(bumped.approvals[0]!.invalidated).toBe(true);
    const cosmetic = applyPatch(before, { purpose: 'Reworded purpose' });
    expect(materialChanged(before, recompute(cosmetic, cfg))).toBe(false);
  });
});

describe('validateForSubmit', () => {
  it('lists every missing field on an empty draft', () => {
    const problems = validateForSubmit(draft(), cfg);
    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining('title'), expect.stringContaining('purpose'), expect.stringContaining('Transport mode')]));
  });
  it('requires justification for lower-precedence transport and upgrade contribution for non-economy', () => {
    let req = recompute(applyPatch(draft(), { category: 'INTERNATIONAL', activityTitle: 'Geneva', purpose: 'Summit', itinerary: { originId: 'loc-lusaka', destinationId: 'loc-ndola', departAt: '2026-09-20T04:30:00.000Z', returnAt: '2026-09-25T16:00:00.000Z' }, transport: { mode: 'AIR' } }), cfg);
    req = { ...req, international: { countries: ['CH'], cities: ['Geneva'], passportValid: true, visaRequired: true, cabinClass: 'BUSINESS' } };
    const problems = validateForSubmit(req, cfg);
    expect(problems.some((p) => p.includes('Justification'))).toBe(true);
    expect(problems.some((p) => p.includes('Economy'))).toBe(true);
  });
});

describe('buildApprovalChain', () => {
  const wf = DEFAULT_WORKFLOWS.find((w) => w.category === 'FIELD')!;
  it('marks done / current / upcoming and includes the submitted item', () => {
    const req: TravelRequest = { ...draft(), status: 'HOD_COST_CENTRE_REVIEW', submittedAt: '2026-09-02T07:14:00.000Z', workflow: { id: wf.id, version: 1, stages: wf.stages }, currentStageIndex: 1, approvals: [{ id: 'a', stageKey: 'supervisor', stageLabel: 'Unit Supervisor', role: 'UNIT_SUPERVISOR', actorId: 'u-t', actorName: 'Thandiwe Mulenga', decision: 'APPROVED', requestVersion: 1, at: '2026-09-02T09:00:00.000Z' }] };
    const chain = buildApprovalChain(req, { hod_cc: 'B. Kapaya' });
    expect(chain.map((c) => c.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(chain[0]!.key).toBe('submitted');
    expect(chain[2]!.actorName).toBe('B. Kapaya');
  });
  it('shows rejected and invalidated states', () => {
    const rejected: TravelRequest = { ...draft(), status: 'REJECTED', submittedAt: 'x', workflow: { id: wf.id, version: 1, stages: wf.stages }, currentStageIndex: 0, approvals: [{ id: 'a', stageKey: 'supervisor', stageLabel: 'S', role: 'UNIT_SUPERVISOR', actorId: 'u', actorName: 'T', decision: 'REJECTED', requestVersion: 1, at: 'x' }] };
    expect(buildApprovalChain(rejected)[1]!.state).toBe('rejected');
    const returned: TravelRequest = { ...rejected, status: 'RETURNED_FOR_CORRECTION', currentStageIndex: 1, approvals: [{ ...rejected.approvals[0]!, decision: 'APPROVED', invalidated: true }] };
    expect(buildApprovalChain(returned)[1]!.state).toBe('invalidated');
  });
});
