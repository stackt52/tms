import type { AdvanceRecord, Liquidation, PolicyConfig, Rate, TravelRequest } from '@tms/shared';
import { computeAdvance, effectiveRate, evaluateAdvanceGate, isoDate, liquidationDueDate } from '@tms/shared';
import { COL, db } from '../lib/firebase';
import { runQuery } from '../lib/query';

export function advancePercentage(rates: readonly Rate[], onDate: string | Date = new Date()): number {
  return effectiveRate(rates, 'ADVANCE_PERCENTAGE', onDate)?.value ?? 75;
}

/**
 * Trips of this traveller that block a new advance (SRS §10.7): liquidations OPEN past due or RETURNED,
 * or requests sitting in AWAITING_LIQUIDATION past the SOP deadline without a liquidation record.
 */
export async function outstandingLiquidationRequestIds(travellerId: string, excludeRequestId: string, policy: PolicyConfig, asOf: string | Date = new Date()): Promise<string[]> {
  const today = isoDate(asOf);
  const [liqs, awaiting] = await Promise.all([
    runQuery<Liquidation>(db.collection(COL.liquidations).where('travellerId', '==', travellerId).where('status', 'in', ['OPEN', 'RETURNED']), 100),
    runQuery<TravelRequest>(db.collection(COL.travelRequests).where('requesterId', '==', travellerId).where('status', '==', 'AWAITING_LIQUIDATION'), 100),
  ]);
  const ids = new Set<string>();
  for (const l of liqs) {
    if (l.requestId === excludeRequestId) continue;
    if (l.status === 'RETURNED' || (l.status === 'OPEN' && l.dueDate < today)) ids.add(l.requestId);
  }
  const covered = new Set(liqs.map((l) => l.requestId));
  for (const r of awaiting) {
    if (r.id === excludeRequestId || covered.has(r.id) || !r.itinerary.returnAt) continue;
    if (liquidationDueDate(r.itinerary.returnAt, policy) < today) ids.add(r.id);
  }
  return [...ids].sort();
}

export interface GateContext {
  policy: PolicyConfig;
  rates: readonly Rate[];
  outstanding: string[];
  asOf?: string | Date;
}

/** Build (or rebuild) the AdvanceRecord for an approved request from the shared policy engine. */
export function buildAdvanceRecord(req: TravelRequest, ctx: GateContext, previous?: AdvanceRecord | null): AdvanceRecord {
  const approvedAt = req.approvedAt ?? ctx.asOf ?? new Date();
  const pct = previous?.percentage ?? advancePercentage(ctx.rates, approvedAt);
  const eligible = req.costing.advanceEligibleTotal;
  const requested = previous?.requested ?? eligible > 0;
  const exceptionApproved = !!previous?.exception?.approvedBy;
  const gate = req.itinerary.departAt
    ? evaluateAdvanceGate({ approvedAt, departAt: req.itinerary.departAt, outstandingLiquidationRequestIds: ctx.outstanding, policy: ctx.policy, exceptionApproved })
    : { policyStatus: 'CLEAR' as const, leadTimeWorkingDays: 0, blockedByRequestId: null };
  return {
    requested,
    percentage: pct,
    approvedAmount: req.costing.total,
    amount: previous?.amount ?? computeAdvance(eligible, pct),
    policyStatus: requested ? gate.policyStatus : 'NOT_REQUESTED',
    leadTimeWorkingDays: gate.leadTimeWorkingDays,
    leadTimeRequiredWorkingDays: ctx.policy.advanceLeadTimeWorkingDays,
    blockedByRequestId: gate.blockedByRequestId,
    blockedReason: gate.blockedByRequestId ? `${gate.blockedByRequestId} unliquidated` : null,
    exception: previous?.exception ?? null,
    milestones: previous?.milestones ?? {},
    paidAt: previous?.paidAt ?? null,
  };
}

/** Provisional record for a request still in review (finance can see what is coming). */
export function provisionalAdvance(req: TravelRequest, ctx: GateContext): AdvanceRecord {
  const rec = buildAdvanceRecord(req, { ...ctx, asOf: ctx.asOf ?? new Date() }, null);
  return { ...rec, policyStatus: 'AWAITING_APPROVAL' };
}

/** Re-run the gate for a persisted record (e.g. a block clears once the prior trip is liquidated). */
export async function reevaluateAdvance(req: TravelRequest, policy: PolicyConfig, rates: readonly Rate[]): Promise<AdvanceRecord | null> {
  if (!req.advance) return null;
  if (req.advance.milestones.RELEASED) return req.advance;
  const outstanding = await outstandingLiquidationRequestIds(req.requesterId, req.id, policy);
  return buildAdvanceRecord(req, { policy, rates, outstanding, asOf: req.approvedAt ?? new Date() }, req.advance);
}
