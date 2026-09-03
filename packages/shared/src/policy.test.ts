import { describe, expect, it } from 'vitest';
import {
  computeAdvance,
  computeCosting,
  computeEligibility,
  computeExternalLine,
  computeMileage,
  effectiveRate,
  evaluateAdvanceGate,
  liquidationDaysRemaining,
  liquidationDueDate,
  liquidationReadiness,
  reconcile,
  DEFAULT_POLICY,
} from './policy';
import { nightsBetween, workingDaysBetween } from './dates';
import { formatRef, shortRef } from './ids';
import { timelineFor } from './status';
import type { ExpenseLine, Rate } from './types';

describe('dates', () => {
  it('counts nights as calendar-date boundaries', () => {
    expect(nightsBetween('2026-09-08T06:30:00Z', '2026-09-11T18:00:00Z')).toBe(3);
    expect(nightsBetween('2026-09-08T06:30:00Z', '2026-09-08T18:00:00Z')).toBe(0);
  });
  it('counts working days excluding weekends', () => {
    // Tue 01 Sep → Mon 08 Sep: Wed, Thu, Fri, (Sat, Sun skipped) = 3 full working days between
    expect(workingDaysBetween('2026-09-01', '2026-09-08')).toBe(4); // 2,3,4,7
    expect(workingDaysBetween('2026-09-03', '2026-09-05')).toBe(1); // Fri 4th only
  });
});

describe('eligibility', () => {
  it('flags Lusaka → Ndola 3-night trip as eligible for per diem', () => {
    const e = computeEligibility({ distanceKm: 321, departAt: '2026-09-08T04:30:00Z', returnAt: '2026-09-11T16:00:00Z', category: 'FIELD', asOf: '2026-08-28T00:00:00Z' });
    expect(e.distanceOk).toBe(true);
    expect(e.hoursAway).toBe(83.5);
    expect(e.hoursOk).toBe(true);
    expect(e.nights).toBe(3);
    expect(e.perDiemEligible).toBe(true);
    expect(e.leadTimeOk).toBe(true);
  });
  it('rejects a day trip within 55 km', () => {
    const e = computeEligibility({ distanceKm: 48, departAt: '2026-09-08T06:00:00Z', returnAt: '2026-09-08T14:00:00Z', category: 'LOCAL', asOf: '2026-08-20T00:00:00Z' });
    expect(e.perDiemEligible).toBe(false);
    expect(e.reasons.length).toBe(2);
  });
  it('checks two-week international notice', () => {
    const e = computeEligibility({ distanceKm: 8000, departAt: '2026-09-10T08:00:00Z', returnAt: '2026-09-15T08:00:00Z', category: 'INTERNATIONAL', asOf: '2026-09-02T00:00:00Z' });
    expect(e.internationalNoticeOk).toBe(false);
    expect(e.internationalNoticeDays).toBe(8);
  });
});

describe('costing & advance', () => {
  it('computes 75% advance', () => {
    expect(computeAdvance(8550)).toBe(6412.5);
    expect(computeAdvance(11240, 75)).toBe(8430);
  });
  it('separates employee contribution and directly paid items', () => {
    const c = computeCosting([
      { id: '1', category: 'PER_DIEM', label: 'Per diem', quantity: 4, unitCost: 1200, amount: 0, receiptRequired: false },
      { id: '2', category: 'FLIGHTS', label: 'Flight', quantity: 1, unitCost: 3000, amount: 0, receiptRequired: true, paidDirectly: true, employeeContribution: 500 },
    ]);
    expect(c.total).toBe(7800);
    expect(c.advanceEligibleTotal).toBe(4800);
    expect(c.paidDirectly).toBe(2500);
    expect(c.employeeContribution).toBe(500);
    expect(c.organisationCost).toBe(7300);
  });
  it('blocks advances on outstanding liquidation, flags short lead time', () => {
    expect(evaluateAdvanceGate({ approvedAt: '2026-09-02', departAt: '2026-09-22', outstandingLiquidationRequestIds: ['TRV-2026-0389'] }).policyStatus).toBe('BLOCKED');
    const short = evaluateAdvanceGate({ approvedAt: '2026-09-02', departAt: '2026-09-05', outstandingLiquidationRequestIds: [] });
    expect(short.policyStatus).toBe('LEAD_TIME_SHORT');
    expect(short.leadTimeWorkingDays).toBe(2);
    expect(evaluateAdvanceGate({ approvedAt: '2026-09-01', departAt: '2026-09-08', outstandingLiquidationRequestIds: [] }).policyStatus).toBe('LEAD_TIME_SHORT');
    expect(evaluateAdvanceGate({ approvedAt: '2026-08-31', departAt: '2026-09-08', outstandingLiquidationRequestIds: [] }).policyStatus).toBe('CLEAR');
  });
});

describe('liquidation', () => {
  const lines: ExpenseLine[] = [
    { id: 'a', category: 'PER_DIEM', label: 'Per diem · 3 nights', budgeted: 3600, actual: 3600, receiptRequired: false, receipts: [] },
    { id: 'b', category: 'ACCOMMODATION', label: 'Accommodation', budgeted: 2400, actual: 2250, receiptRequired: true, receipts: [{ id: 'x' } as never] },
    { id: 'c', category: 'FUEL', label: 'Fuel', budgeted: 760, actual: 812.4, receiptRequired: true, receipts: [{ id: 'y' } as never] },
    { id: 'd', category: 'PARKING_TOLLS', label: 'Toll fees', budgeted: 120, actual: 100, receiptRequired: true, receipts: [] },
    { id: 'e', category: 'PARKING_TOLLS', label: 'Parking', budgeted: 80, actual: 60, receiptRequired: true, receipts: [{ id: 'z' } as never] },
  ];
  it('computes due date 5 days after return and days remaining', () => {
    expect(liquidationDueDate('2026-09-02')).toBe('2026-09-07');
    expect(liquidationDaysRemaining('2026-09-07', '2026-09-05T10:00:00Z')).toBe(2);
    expect(liquidationDaysRemaining('2026-08-29', '2026-09-03T10:00:00Z')).toBe(-5);
  });
  it('reconciles advance against actuals', () => {
    const r = reconcile(5220, lines);
    expect(r.totalActual).toBe(6822.4);
    expect(r.settlement).toBe(1602.4);
    expect(r.direction).toBe('DUE_TO_EMPLOYEE');
    expect(reconcile(7000, lines).direction).toBe('REFUND_TO_IHM');
  });
  it('gates submission on receipts and trip report', () => {
    const r = liquidationReadiness({ lines, boardingPassesRequired: true, boardingPasses: [{}], tripReport: { supervisorApprovedAt: '2026-09-03T00:00:00Z' } });
    expect(r.ready).toBe(false);
    expect(r.missingReceipts.map((l) => l.label)).toEqual(['Toll fees']);
  });
});

describe('rates, mileage, external allowances', () => {
  const rates: Rate[] = [
    { id: '1', key: 'MILEAGE_RATE', label: '', value: 4.5, unit: 'ZMW_PER_KM', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', version: 1, createdAt: '' },
    { id: '2', key: 'MILEAGE_RATE', label: '', value: 5, unit: 'ZMW_PER_KM', effectiveFrom: '2026-01-01', version: 1, createdAt: '' },
    { id: '3', key: 'MILEAGE_RATE', label: '', value: 5.5, unit: 'ZMW_PER_KM', effectiveFrom: '2027-01-01', version: 1, createdAt: '' },
  ];
  it('picks the effective-dated rate', () => {
    expect(effectiveRate(rates, 'MILEAGE_RATE', '2026-09-02')?.value).toBe(5);
    expect(effectiveRate(rates, 'MILEAGE_RATE', '2025-06-01')?.value).toBe(4.5);
    expect(computeMileage(96, 5)).toBe(480);
  });
  it('applies external-party rules', () => {
    const rates = { dsaPerDay: 440, lunchPerDay: 60, transportFlat: 150 };
    const away = computeExternalLine({ isHostSite: false, ihmProvidesTransport: false, payout: null }, { days: 3, endsBeforeNoon: false }, rates);
    expect(away).toMatchObject({ dsa: 1320, lunch: 0, transport: 150, total: 1470 });
    const host = computeExternalLine({ isHostSite: true, ihmProvidesTransport: false, payout: null }, { days: 3, endsBeforeNoon: false }, rates);
    expect(host).toMatchObject({ dsa: 0, lunch: 180, transport: 0, total: 180 });
    const early = computeExternalLine({ isHostSite: true, ihmProvidesTransport: false, payout: null }, { days: 1, endsBeforeNoon: true }, rates);
    expect(early.lunch).toBe(0);
  });
});

describe('ids & timeline', () => {
  it('formats refs', () => {
    expect(formatRef('TRV', 2026, 412)).toBe('TRV-2026-0412');
    expect(shortRef('TRV-2026-0412')).toBe('TRV-0412');
  });
  it('builds the 6-stage process timeline', () => {
    const t = timelineFor('READY_FOR_TRAVEL');
    expect(t.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming']);
  });
});
