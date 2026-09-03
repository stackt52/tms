import type { AdvanceQueueResponse, AdvanceQueueRow, BankingMilestone, FinanceDashboardResponse, Liquidation, MileageClaim, Role, TravelRequest } from '@tms/shared';
import { BANKING_MILESTONES, BANKING_MILESTONE_LABELS, hasAnyRole, isTerminal } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso } from '../lib/firebase';
import { forbidden, unprocessable } from '../lib/errors';
import { audit, notify, notifyMany } from '../lib/audit';
import { byAsc, getMany, queryIn, runQuery } from '../lib/query';
import { loadConfig } from './config';
import { canSeeFinance, isAdmin } from './access';
import { advancePercentage, buildAdvanceRecord, outstandingLiquidationRequestIds, provisionalAdvance } from './advance';
import { getRequest } from './travelRequests';
import { getTrip, maybeMarkReady } from './trips';
import { getCostCentre, getProject } from './masterData';
import { userIdsWithRoles } from './people';

const ADVANCE_ACTIVE: TravelRequest['status'][] = ['ADVANCE_PROCESSING', 'TRAVEL_ARRANGEMENTS', 'READY_FOR_TRAVEL', 'IN_PROGRESS'];
const ADVANCE_UPCOMING: TravelRequest['status'][] = ['FINANCE_REVIEW', 'FINANCE_DIRECTOR_REVIEW', 'FINAL_APPROVAL', 'PROCUREMENT_REVIEW'];

export const MILESTONE_ROLES: Record<BankingMilestone, Role[]> = {
  PREPARED: ['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT'],
  SUBMITTED: ['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT'],
  AUTH_1: ['FINANCE_DIRECTOR'],
  AUTH_2: ['PROJECT_DIRECTOR', 'CEO'],
  RELEASED: ['FINANCE_ACCOUNTANT'],
};

export function assertFinanceViewer(actor: Actor): void {
  if (!canSeeFinance(actor)) throw forbidden('Finance view only');
}

async function fundingLabel(req: TravelRequest, cache: Map<string, string>): Promise<string> {
  const key = req.projectId ?? req.costCentreId ?? '';
  if (cache.has(key)) return cache.get(key)!;
  let label = 'overhead';
  if (req.projectId) label = (await getProject(req.projectId))?.id ?? req.projectId;
  else if (req.costCentreId) {
    const cc = await getCostCentre(req.costCentreId);
    label = cc?.fundingSource === 'OVERHEAD' ? 'overhead' : (cc?.projectId ?? cc?.name ?? 'overhead');
  }
  cache.set(key, label);
  return label;
}

/** Advance queue with the gate re-evaluated at read time (blocks clear once the prior trip is liquidated). */
export async function advanceQueue(actor: Actor): Promise<AdvanceQueueResponse> {
  assertFinanceViewer(actor);
  const cfg = await loadConfig();
  const [active, upcoming] = await Promise.all([queryIn<TravelRequest>(COL.travelRequests, 'status', ADVANCE_ACTIVE, 200), queryIn<TravelRequest>(COL.travelRequests, 'status', ADVANCE_UPCOMING, 200)]);
  const outstandingCache = new Map<string, string[]>();
  const outstandingFor = async (r: TravelRequest) => {
    if (!outstandingCache.has(r.requesterId)) outstandingCache.set(r.requesterId, await outstandingLiquidationRequestIds(r.requesterId, '', cfg.policy));
    return outstandingCache.get(r.requesterId)!.filter((id) => id !== r.id);
  };
  const funding = new Map<string, string>();
  const rows: AdvanceQueueRow[] = [];
  for (const r of active) {
    if (!r.advance?.requested || r.advance.milestones.RELEASED) continue;
    const outstanding = await outstandingFor(r);
    const advance = buildAdvanceRecord(r, { policy: cfg.policy, rates: cfg.rates, outstanding, asOf: r.approvedAt ?? new Date() }, r.advance);
    rows.push(await row(r, advance, true, funding));
  }
  for (const r of upcoming) {
    if (r.costing.advanceEligibleTotal <= 0) continue;
    const outstanding = await outstandingFor(r);
    const advance = provisionalAdvance(r, { policy: cfg.policy, rates: cfg.rates, outstanding });
    rows.push(await row(r, advance, false, funding));
  }
  rows.sort(byAsc((x) => x.departAt));
  const ready = rows.filter((x) => x.isApproved && x.advance.policyStatus === 'CLEAR');
  return {
    rows,
    summary: {
      readyCount: ready.length,
      readyValue: Math.round(ready.reduce((s, x) => s + x.advance.amount, 0) * 100) / 100,
      flagged: rows.filter((x) => x.advance.policyStatus === 'LEAD_TIME_SHORT').length,
      blocked: rows.filter((x) => x.advance.policyStatus === 'BLOCKED').length,
    },
    advancePercentage: advancePercentage(cfg.rates),
  };
}

async function row(r: TravelRequest, advance: AdvanceQueueRow['advance'], isApproved: boolean, funding: Map<string, string>): Promise<AdvanceQueueRow> {
  return {
    requestId: r.id,
    ref: r.id,
    shortRef: r.id.replace(/^([A-Z]{3})-\d{4}-/, '$1-'),
    travellerName: r.requesterName,
    destination: r.itinerary.destinationName?.split(' — ')[0] ?? '',
    projectOrFunding: await fundingLabel(r, funding),
    approvedAmount: r.costing.total,
    advance,
    departAt: r.itinerary.departAt ?? '',
    status: r.status,
    isApproved,
    blockingRequestId: advance.blockedByRequestId ?? null,
  };
}

/** Banking milestones in strict order with role checks; RELEASED pays the advance and moves the trip on (SRS §11.3). */
export async function recordMilestone(actor: Actor, requestId: string, milestone: BankingMilestone, reference?: string): Promise<TravelRequest> {
  if (!hasAnyRole(actor.roles, MILESTONE_ROLES[milestone]) && !isAdmin(actor)) throw forbidden(`${BANKING_MILESTONE_LABELS[milestone]} must be recorded by ${MILESTONE_ROLES[milestone].join(' / ')}`);
  const req = await getRequest(requestId);
  if (!req.advance?.requested) throw unprocessable('NO_ADVANCE', 'This request has no advance');
  if (isTerminal(req.status)) throw unprocessable('INVALID_STATE', `Request is ${req.status}`);
  const cfg = await loadConfig();
  const outstanding = await outstandingLiquidationRequestIds(req.requesterId, req.id, cfg.policy);
  const advance = buildAdvanceRecord(req, { policy: cfg.policy, rates: cfg.rates, outstanding, asOf: req.approvedAt ?? new Date() }, req.advance);
  const idx = BANKING_MILESTONES.indexOf(milestone);
  const previous = BANKING_MILESTONES[idx - 1];
  if (advance.milestones[milestone]) throw unprocessable('MILESTONE_DONE', `${BANKING_MILESTONE_LABELS[milestone]} already recorded`);
  if (previous && !advance.milestones[previous]) throw unprocessable('MILESTONE_ORDER', `${BANKING_MILESTONE_LABELS[previous]} must be recorded before ${BANKING_MILESTONE_LABELS[milestone]}`);
  if (advance.policyStatus !== 'CLEAR') {
    throw unprocessable('ADVANCE_NOT_CLEAR', advance.policyStatus === 'BLOCKED' ? `Advance blocked — ${advance.blockedByRequestId} unliquidated` : advance.policyStatus === 'LEAD_TIME_SHORT' ? 'Lead time short — an approved exception is required' : `Advance is ${advance.policyStatus}`, { policyStatus: advance.policyStatus, blockedByRequestId: advance.blockedByRequestId });
  }
  const now = nowIso();
  advance.milestones = { ...advance.milestones, [milestone]: { by: actor.uid, byName: actor.profile.displayName, at: now, reference } };
  let next: TravelRequest = { ...req, advance, updatedAt: now };
  if (milestone === 'RELEASED') {
    advance.paidAt = now;
    if (req.status === 'ADVANCE_PROCESSING') next.status = 'TRAVEL_ARRANGEMENTS';
  }
  await db.collection(COL.travelRequests).doc(requestId).set(next);
  await audit(actor, { entityType: 'travelRequest', entityId: requestId, action: `ADVANCE_${milestone}`, stage: 'advance', newValue: { milestone, reference, amount: advance.amount } });
  if (milestone === 'RELEASED') {
    await db.collection(COL.trips).doc(requestId).set({ 'financials.advanceAmount': advance.amount, updatedAt: now }, { merge: true });
    await notify(req.requesterId, { title: 'Advance paid', body: `${req.id} · ZMW ${advance.amount.toFixed(2)} (${advance.percentage}%) released${reference ? ` · ref ${reference}` : ''}.`, link: `/trips/${req.id}`, kind: 'ADVANCE_PAID' });
    const trip = await getTrip(requestId);
    if (trip) next = await maybeMarkReady(actor, next, trip);
  } else if (milestone === 'AUTH_1') {
    await notifyMany(await userIdsWithRoles(['PROJECT_DIRECTOR', 'CEO']), { title: 'Advance awaiting second authorisation', body: `${req.id} · ${req.requesterName} · ZMW ${advance.amount.toFixed(2)}`, link: '/finance/advances', kind: 'ADVANCE_AUTH' });
  } else if (milestone === 'SUBMITTED') {
    await notifyMany(await userIdsWithRoles(['FINANCE_DIRECTOR']), { title: 'Advance awaiting first authorisation', body: `${req.id} · ${req.requesterName} · ZMW ${advance.amount.toFixed(2)}`, link: '/finance/advances', kind: 'ADVANCE_AUTH' });
  }
  return next;
}

export async function requestException(actor: Actor, requestId: string, reason: string): Promise<TravelRequest> {
  if (!hasAnyRole(actor.roles, ['FINANCE_ACCOUNTANT']) && !isAdmin(actor)) throw forbidden('Only the Finance Accountant can request a lead-time exception');
  const req = await getRequest(requestId);
  if (!req.advance?.requested) throw unprocessable('NO_ADVANCE', 'This request has no advance');
  const advance = { ...req.advance, exception: { requestedBy: actor.uid, reason, at: nowIso() } };
  const next: TravelRequest = { ...req, advance, updatedAt: nowIso() };
  await db.collection(COL.travelRequests).doc(requestId).set(next);
  await audit(actor, { entityType: 'travelRequest', entityId: requestId, action: 'ADVANCE_EXCEPTION_REQUESTED', newValue: { reason } });
  await notifyMany(await userIdsWithRoles(['FINANCE_DIRECTOR']), { title: 'Lead-time exception requested', body: `${req.id} · ${req.requesterName} — ${reason}`, link: '/finance/advances', kind: 'ADVANCE_EXCEPTION' });
  return next;
}

export async function approveException(actor: Actor, requestId: string): Promise<TravelRequest> {
  if (!hasAnyRole(actor.roles, ['FINANCE_DIRECTOR']) && !isAdmin(actor)) throw forbidden('Only the Finance Director can approve a lead-time exception');
  const req = await getRequest(requestId);
  if (!req.advance?.exception) throw unprocessable('NO_EXCEPTION', 'No exception has been requested');
  const cfg = await loadConfig();
  const outstanding = await outstandingLiquidationRequestIds(req.requesterId, req.id, cfg.policy);
  const withApproval = { ...req.advance, exception: { ...req.advance.exception, approvedBy: actor.uid, approvedAt: nowIso() } };
  const advance = buildAdvanceRecord(req, { policy: cfg.policy, rates: cfg.rates, outstanding, asOf: req.approvedAt ?? new Date() }, withApproval);
  const next: TravelRequest = { ...req, advance, updatedAt: nowIso() };
  await db.collection(COL.travelRequests).doc(requestId).set(next);
  await audit(actor, { entityType: 'travelRequest', entityId: requestId, action: 'ADVANCE_EXCEPTION_APPROVED', newValue: { policyStatus: advance.policyStatus } });
  await notifyMany([req.requesterId, req.advance.exception.requestedBy], { title: 'Lead-time exception approved', body: `${req.id} — advance can now be prepared.`, link: '/finance/advances', kind: 'ADVANCE_EXCEPTION_APPROVED' });
  return next;
}

export async function financeDashboard(actor: Actor): Promise<FinanceDashboardResponse> {
  assertFinanceViewer(actor);
  const [active, upcoming, liqSubmitted, liqOpen, claimsApproved, ext] = await Promise.all([
    queryIn<TravelRequest>(COL.travelRequests, 'status', ADVANCE_ACTIVE, 200),
    queryIn<TravelRequest>(COL.travelRequests, 'status', ADVANCE_UPCOMING, 200),
    runQuery<Liquidation>(db.collection(COL.liquidations).where('status', '==', 'SUBMITTED'), 200),
    runQuery<Liquidation>(db.collection(COL.liquidations).where('status', 'in', ['OPEN', 'RETURNED']), 200),
    runQuery<MileageClaim>(db.collection(COL.mileageClaims).where('status', '==', 'APPROVED'), 200),
    queryIn<{ status: string; totals: { total: number } }>(COL.externalPayments, 'status', ['CC_HEAD_REVIEW', 'FINANCE_REVIEW', 'FINANCE_DIRECTOR_REVIEW', 'FINAL_APPROVAL', 'APPROVED'], 200),
  ]);
  const awaiting = active.filter((r) => r.advance?.requested && !r.advance.milestones.RELEASED);
  const released = active.filter((r) => r.advance?.requested && r.advance.milestones.RELEASED);
  const openReqIds = liqOpen.map((l) => l.requestId);
  const openReqs = await getMany<TravelRequest>(COL.travelRequests, openReqIds);
  const outstandingValue = [...released, ...[...openReqs.values()].filter((r) => r.advance?.milestones.RELEASED)].reduce((m, r) => m.set(r.id, r.advance!.amount), new Map<string, number>());
  const reimb = liqSubmitted.filter((l) => l.reconciliation.direction === 'DUE_TO_EMPLOYEE').reduce((s, l) => s + l.reconciliation.settlement, 0) + claimsApproved.reduce((s, c) => s + c.amount, 0);
  const refunds = liqSubmitted.filter((l) => l.reconciliation.direction === 'REFUND_TO_IHM').reduce((s, l) => s + Math.abs(l.reconciliation.settlement), 0);
  return {
    awaitingAdvance: awaiting.length + upcoming.filter((r) => r.costing.advanceEligibleTotal > 0).length,
    paymentQueue: awaiting.filter((r) => r.advance!.milestones.PREPARED).length + claimsApproved.length + ext.filter((e) => e.status === 'APPROVED').length,
    outstandingAdvances: { count: outstandingValue.size, value: Math.round([...outstandingValue.values()].reduce((s, v) => s + v, 0) * 100) / 100 },
    liquidationsPending: liqSubmitted.length,
    reimbursementsPayable: Math.round(reimb * 100) / 100,
    refundsDue: Math.round(refunds * 100) / 100,
    externalPayments: ext.length,
  };
}
