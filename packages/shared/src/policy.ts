import { hoursBetween, nightsBetween, workingDaysBetween, addDays, isoDate, calendarDaysBetween, startOfDay } from './dates';
import type {
  CostLine,
  Costing,
  EligibilityResult,
  ExpenseLine,
  ExternalParticipantLine,
  PayoutMethod,
  PolicyConfig,
  Rate,
  RateKey,
  Reconciliation,
  TravelCategory,
  TransportMode,
} from './types';
import { TRANSPORT_PRECEDENCE } from './types';

export const DEFAULT_POLICY: PolicyConfig = {
  distanceThresholdKm: 55,
  hoursThreshold: 12,
  liquidationDeadlineDays: 5,
  advanceLeadTimeWorkingDays: 5,
  procurementLeadTimeWorkingDays: 5,
  internationalNoticeDays: 14,
  meetingNoticeWorkingDays: 5,
  eventNoticeWorkingDays: 10,
  lateInternationalClaimDays: 30,
  toggles: {
    blockAdvanceOnOutstandingLiquidation: true,
    requireInternationalNotice: true,
    economyOnlyInternational: true,
    approvalDelegation: false,
    restrictRentalToApprovedVendors: true,
  },
  publicHolidaysMMDD: ['01-01', '03-08', '03-12', '05-01', '05-25', '10-18', '10-24', '12-25'],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------- Effective-dated rates ----------

export function effectiveRate(rates: readonly Rate[], key: RateKey, onDate: string | Date = new Date()): Rate | undefined {
  const day = isoDate(onDate);
  return rates
    .filter((r) => r.key === key && r.effectiveFrom <= day && (!r.effectiveTo || r.effectiveTo >= day))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.version - a.version))[0];
}

export function rateStatus(rate: Rate, onDate: string | Date = new Date()): 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' {
  const day = isoDate(onDate);
  if (rate.effectiveFrom > day) return 'SCHEDULED';
  if (rate.effectiveTo && rate.effectiveTo < day) return 'EXPIRED';
  return 'ACTIVE';
}

// ---------- Eligibility (SRS §8.3, §17.1, §10.6) ----------

export interface EligibilityInput {
  distanceKm: number;
  departAt?: string | null;
  returnAt?: string | null;
  category: TravelCategory | null;
  /** Reference instant for lead-time (now while drafting; final approval time once approved). */
  asOf?: string | Date;
  policy?: PolicyConfig;
}

export function computeEligibility(input: EligibilityInput): EligibilityResult {
  const policy = input.policy ?? DEFAULT_POLICY;
  const asOf = input.asOf ?? new Date();
  const hasDates = !!(input.departAt && input.returnAt);
  const hoursAway = hasDates ? Math.max(0, round2(hoursBetween(input.departAt!, input.returnAt!))) : 0;
  const nights = hasDates ? nightsBetween(input.departAt!, input.returnAt!) : 0;
  const distanceOk = input.distanceKm > policy.distanceThresholdKm;
  const hoursOk = hoursAway > policy.hoursThreshold;
  const leadTimeWorkingDays = input.departAt ? workingDaysBetween(asOf, input.departAt, policy.publicHolidaysMMDD) : 0;
  const leadTimeOk = leadTimeWorkingDays >= policy.advanceLeadTimeWorkingDays;
  let internationalNoticeOk: boolean | null = null;
  let internationalNoticeDays: number | null = null;
  if (input.category === 'INTERNATIONAL' && input.departAt) {
    internationalNoticeDays = calendarDaysBetween(asOf, input.departAt);
    internationalNoticeOk = !policy.toggles.requireInternationalNotice || internationalNoticeDays >= policy.internationalNoticeDays;
  }
  const reasons: string[] = [];
  if (!distanceOk) reasons.push(`Destination is ${input.distanceKm} km from the duty station — must exceed ${policy.distanceThresholdKm} km for per diem.`);
  if (!hoursOk) reasons.push(`Time away is ${hoursAway} h — must exceed ${policy.hoursThreshold} h for per diem.`);
  if (!leadTimeOk) reasons.push(`Only ${leadTimeWorkingDays} working day(s) before departure — advances need ${policy.advanceLeadTimeWorkingDays}.`);
  if (internationalNoticeOk === false) reasons.push(`International travel needs ${policy.internationalNoticeDays} days' notice; ${internationalNoticeDays} given.`);
  return {
    distanceKm: input.distanceKm,
    distanceThresholdKm: policy.distanceThresholdKm,
    distanceOk,
    hoursAway,
    hoursThreshold: policy.hoursThreshold,
    hoursOk,
    nights,
    perDiemEligible: distanceOk && hoursOk,
    leadTimeWorkingDays,
    leadTimeRequiredWorkingDays: policy.advanceLeadTimeWorkingDays,
    leadTimeOk,
    internationalNoticeOk,
    internationalNoticeDays,
    reasons,
  };
}

// ---------- Costing & advance (SRS §11) ----------

export function computeCosting(lines: CostLine[]): Costing {
  let total = 0;
  let employeeContribution = 0;
  let paidDirectly = 0;
  let advanceEligibleTotal = 0;
  for (const l of lines) {
    const amount = round2(l.quantity * l.unitCost);
    total += amount;
    const ec = l.employeeContribution ?? 0;
    employeeContribution += ec;
    if (l.paidDirectly) paidDirectly += amount - ec;
    else advanceEligibleTotal += amount - ec;
  }
  return {
    lines: lines.map((l) => ({ ...l, amount: round2(l.quantity * l.unitCost) })),
    total: round2(total),
    advanceEligibleTotal: round2(advanceEligibleTotal),
    employeeContribution: round2(employeeContribution),
    paidDirectly: round2(paidDirectly),
    organisationCost: round2(total - employeeContribution),
  };
}

/** Advance Amount = Approved Travel Amount × Configured Advance Percentage (default 75%). */
export function computeAdvance(approvedAmount: number, percentage = 75): number {
  return round2(approvedAmount * (percentage / 100));
}

export interface AdvanceGateInput {
  approvedAt: string | Date;
  departAt: string;
  outstandingLiquidationRequestIds: string[]; // trips of this traveller with overdue / rejected / open liquidations
  policy?: PolicyConfig;
  exceptionApproved?: boolean;
}

export function evaluateAdvanceGate(input: AdvanceGateInput): {
  policyStatus: 'CLEAR' | 'LEAD_TIME_SHORT' | 'BLOCKED';
  leadTimeWorkingDays: number;
  blockedByRequestId: string | null;
} {
  const policy = input.policy ?? DEFAULT_POLICY;
  const leadTimeWorkingDays = workingDaysBetween(input.approvedAt, input.departAt, policy.publicHolidaysMMDD);
  if (policy.toggles.blockAdvanceOnOutstandingLiquidation && input.outstandingLiquidationRequestIds.length > 0) {
    return { policyStatus: 'BLOCKED', leadTimeWorkingDays, blockedByRequestId: input.outstandingLiquidationRequestIds[0]! };
  }
  if (leadTimeWorkingDays < policy.advanceLeadTimeWorkingDays && !input.exceptionApproved) {
    return { policyStatus: 'LEAD_TIME_SHORT', leadTimeWorkingDays, blockedByRequestId: null };
  }
  return { policyStatus: 'CLEAR', leadTimeWorkingDays, blockedByRequestId: null };
}

// ---------- Liquidation (SRS §19) ----------

export function liquidationDueDate(returnDate: string | Date, policy: PolicyConfig = DEFAULT_POLICY): string {
  return isoDate(addDays(startOfDay(returnDate), policy.liquidationDeadlineDays));
}

/** Positive = days remaining; negative = days overdue. */
export function liquidationDaysRemaining(dueDate: string, asOf: string | Date = new Date()): number {
  return calendarDaysBetween(asOf, dueDate);
}

export function reconcile(advanceReceived: number, lines: ExpenseLine[]): Reconciliation {
  const totalActual = round2(lines.reduce((s, l) => s + (l.actual || 0), 0));
  const settlement = round2(totalActual - advanceReceived);
  return {
    advanceReceived: round2(advanceReceived),
    totalActual,
    settlement,
    direction: settlement > 0 ? 'DUE_TO_EMPLOYEE' : settlement < 0 ? 'REFUND_TO_IHM' : 'BALANCED',
  };
}

export interface LiquidationReadiness {
  ready: boolean;
  missingReceipts: ExpenseLine[];
  tripReportApproved: boolean;
  boardingPassesOk: boolean;
  items: { key: string; label: string; ok: boolean }[];
}

export function liquidationReadiness(liq: {
  lines: ExpenseLine[];
  boardingPassesRequired: boolean;
  boardingPasses: unknown[];
  tripReport: { submittedAt?: string; supervisorApprovedAt?: string };
}): LiquidationReadiness {
  const missingReceipts = liq.lines.filter((l) => l.receiptRequired && l.actual > 0 && l.receipts.length === 0);
  const tripReportApproved = !!liq.tripReport.supervisorApprovedAt;
  const boardingPassesOk = !liq.boardingPassesRequired || liq.boardingPasses.length > 0;
  const items = [
    {
      key: 'trip_report',
      label: tripReportApproved ? 'Trip report approved by supervisor' : liq.tripReport.submittedAt ? 'Trip report awaiting supervisor sign-off' : 'Trip report not yet submitted',
      ok: tripReportApproved,
    },
    ...(liq.boardingPassesRequired ? [{ key: 'boarding_passes', label: boardingPassesOk ? 'Boarding passes attached' : 'Boarding passes missing', ok: boardingPassesOk }] : []),
    ...missingReceipts.map((l) => ({ key: `receipt_${l.id}`, label: `${l.label} receipt missing`, ok: false })),
  ];
  if (missingReceipts.length === 0) items.push({ key: 'receipts', label: 'All required receipts attached', ok: true });
  return { ready: missingReceipts.length === 0 && tripReportApproved && boardingPassesOk, missingReceipts, tripReportApproved, boardingPassesOk, items };
}

// ---------- Mileage (SRS §16) ----------

export function computeMileage(distanceKm: number, ratePerKm: number): number {
  return round2(distanceKm * ratePerKm);
}

export function mileagePolicyCheck(claim: { withinProvince: boolean; preApprovalAttached: boolean; routeEvidence: unknown[]; businessEvidence: unknown[] }) {
  const items = [
    { key: 'province', label: "Within staff member's province", ok: claim.withinProvince },
    { key: 'pre_approval', label: 'Supervisor pre-approval exists', ok: claim.preApprovalAttached },
    { key: 'route', label: claim.routeEvidence.length ? 'Google Maps route evidence attached' : 'Route evidence not yet uploaded', ok: claim.routeEvidence.length > 0 },
    { key: 'business', label: claim.businessEvidence.length ? 'Business evidence attached' : 'Business evidence not yet uploaded', ok: claim.businessEvidence.length > 0 },
  ];
  return { items, ok: items.every((i) => i.ok) };
}

// ---------- External-party allowances (SRS §14.3–14.4) ----------

export interface ExternalAllowanceRates {
  dsaPerDay: number;
  lunchPerDay: number;
  transportFlat: number;
}

export function computeExternalLine(
  p: { isHostSite: boolean; ihmProvidesTransport: boolean; payout: PayoutMethod },
  activity: { days: number; endsBeforeNoon: boolean },
  rates: ExternalAllowanceRates,
): { dsaDays: number; dsa: number; lunch: number; lunchApplicable: boolean; transport: number; total: number } {
  // Participants from outside the host site are away overnight → DSA; host-site participants get lunch instead.
  const dsaDays = p.isHostSite ? 0 : activity.days;
  const dsa = round2(dsaDays * rates.dsaPerDay);
  const lunchApplicable = p.isHostSite && !activity.endsBeforeNoon; // lunch mutually exclusive with DSA; not before 12:00
  const lunch = lunchApplicable ? round2(activity.days * rates.lunchPerDay) : 0;
  const transport = p.isHostSite || p.ihmProvidesTransport ? 0 : round2(rates.transportFlat);
  return { dsaDays, dsa, lunch, lunchApplicable, transport, total: round2(dsa + lunch + transport) };
}

export function summariseExternal(lines: ExternalParticipantLine[]) {
  const dsa = round2(lines.reduce((s, l) => s + l.dsa, 0));
  const lunch = round2(lines.reduce((s, l) => s + l.lunch, 0));
  const transport = round2(lines.reduce((s, l) => s + l.transport, 0));
  return { dsa, lunch, transport, total: round2(dsa + lunch + transport) };
}

export function externalPayoutsMissing(lines: ExternalParticipantLine[]): number {
  return lines.filter((l) => !l.payout).length;
}

// ---------- Transport precedence (SRS §15.1) ----------

export function transportNeedsJustification(mode: TransportMode): boolean {
  return TRANSPORT_PRECEDENCE.indexOf(mode) > 0;
}

// ---------- Personal travel (SRS §13.3) ----------

export function personalContribution(combinedQuote: number, directOfficialQuote: number): number {
  return round2(Math.max(0, combinedQuote - directOfficialQuote));
}
