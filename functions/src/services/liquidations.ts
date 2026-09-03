import type { AddExpenseLineBody, Attachment, ExpenseLine, Liquidation, LiquidationDetailResponse, LiquidationReviewBody, TravelRequest, Trip, UpdateLiquidationBody } from '@tms/shared';
import { FINANCE_ROLES, fmtDate, hasAnyRole, isoDate, liquidationDaysRemaining, liquidationDueDate, liquidationReadiness, reconcile } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso, SYSTEM_ACTOR } from '../lib/firebase';
import { forbidden, notFound, unprocessable } from '../lib/errors';
import { nextRef, shortId } from '../lib/ids';
import { audit, notify, notifyMany } from '../lib/audit';
import { byDesc, getDoc, mustGet, runQuery } from '../lib/query';
import { loadConfig } from './config';
import { canViewAll, isAdmin, isFinance } from './access';
import { getRequest } from './travelRequests';
import { userIdsWithRoles } from './people';

type ActorLike = Actor | { uid: string; name: string };

export async function getLiquidation(id: string): Promise<Liquidation> {
  return mustGet<Liquidation>(COL.liquidations, id, 'Liquidation');
}

export async function liquidationForRequest(requestId: string): Promise<Liquidation | null> {
  const list = await runQuery<Liquidation>(db.collection(COL.liquidations).where('requestId', '==', requestId), 1);
  return list[0] ?? null;
}

/** Idempotently open the liquidation for a returned trip (SRS §19.1). Used by the daily job and by the traveller. */
export async function ensureLiquidation(requestId: string, actor: ActorLike = SYSTEM_ACTOR): Promise<Liquidation> {
  const existing = await liquidationForRequest(requestId);
  if (existing) return existing;
  const [req, cfg, trip] = await Promise.all([getRequest(requestId), loadConfig(), getDoc<Trip>(COL.trips, requestId)]);
  if (!req.itinerary.returnAt) throw unprocessable('NO_RETURN_DATE', 'Request has no return date');
  const { id } = await nextRef('LIQ');
  const now = nowIso();
  const lines: ExpenseLine[] = req.costing.lines.map((l) => ({
    id: shortId(),
    category: l.category,
    label: l.label,
    budgeted: l.amount,
    actual: l.category === 'PER_DIEM' ? l.amount : 0,
    receiptRequired: l.category !== 'PER_DIEM',
    receipts: [],
  }));
  const advanceReceived = req.advance?.milestones.RELEASED ? req.advance.amount : 0;
  const lead = req.travellers.find((t) => t.isLead) ?? req.travellers[0];
  const liq: Liquidation = {
    id,
    requestId,
    tripTitle: req.activityTitle,
    travellerId: req.requesterId,
    travellerName: lead?.name ?? req.requesterName,
    returnDate: isoDate(req.itinerary.returnAt),
    dueDate: liquidationDueDate(req.itinerary.returnAt, cfg.policy),
    status: 'OPEN',
    lines,
    boardingPassesRequired: req.transport.mode === 'AIR',
    boardingPasses: [],
    tripReport: { objective: '', activities: '', locations: '', outcomes: '', challenges: '', followUps: '', recommendations: '', supervisorId: req.supervisorId },
    reconciliation: reconcile(advanceReceived, lines),
    createdAt: now,
    updatedAt: now,
    remindersSent: [],
  };
  const batch = db.batch();
  batch.set(db.collection(COL.liquidations).doc(id), liq);
  const reqUpdate: Partial<TravelRequest> = { updatedAt: now };
  if (['APPROVED', 'ADVANCE_PROCESSING', 'TRAVEL_ARRANGEMENTS', 'READY_FOR_TRAVEL', 'IN_PROGRESS'].includes(req.status)) reqUpdate.status = 'AWAITING_LIQUIDATION';
  batch.set(db.collection(COL.travelRequests).doc(requestId), reqUpdate, { merge: true });
  if (trip) batch.set(db.collection(COL.trips).doc(requestId), { liquidationId: id, updatedAt: now }, { merge: true });
  await batch.commit();
  await audit(actor, { entityType: 'liquidation', entityId: id, action: 'OPENED', newValue: { requestId, dueDate: liq.dueDate } });
  await notify(req.requesterId, { title: `Liquidation due ${fmtDate(liq.dueDate)}`, body: `${req.id} · ${req.activityTitle} — submit receipts and your trip report within ${cfg.policy.liquidationDeadlineDays} days of return.`, link: `/liquidations/${id}`, kind: 'LIQUIDATION_DUE' });
  return liq;
}

export function canViewLiquidation(actor: Actor, liq: Liquidation, req: TravelRequest): boolean {
  return liq.travellerId === actor.uid || req.requesterId === actor.uid || req.supervisorId === actor.uid || (req.travellerIds ?? []).includes(actor.uid) || canViewAll(actor);
}

export async function liquidationDetail(actor: Actor, liq: Liquidation): Promise<LiquidationDetailResponse> {
  const req = await getRequest(liq.requestId);
  if (!canViewLiquidation(actor, liq, req)) throw forbidden('You cannot view this liquidation');
  const readiness = liquidationReadiness(liq);
  const traveller = liq.travellerId === actor.uid || req.requesterId === actor.uid;
  return {
    liquidation: liq,
    request: req,
    readiness,
    daysRemaining: liquidationDaysRemaining(liq.dueDate),
    canSubmit: traveller && (liq.status === 'OPEN' || liq.status === 'RETURNED') && readiness.ready,
    canReview: hasAnyRole(actor.roles, ['FINANCE_ACCOUNTANT', 'FINANCE_DIRECTOR']) && liq.status === 'SUBMITTED',
    canApproveTripReport: (req.supervisorId === actor.uid || liq.tripReport.supervisorId === actor.uid || isAdmin(actor)) && !!liq.tripReport.submittedAt && !liq.tripReport.supervisorApprovedAt,
  };
}

export async function listLiquidations(actor: Actor, scope: 'mine' | 'review' | 'all', limit: number): Promise<Liquidation[]> {
  const col = db.collection(COL.liquidations);
  if (scope === 'review') {
    if (!isFinance(actor) && !canViewAll(actor)) throw forbidden();
    return runQuery<Liquidation>(col.where('status', '==', 'SUBMITTED').orderBy('dueDate', 'asc'), limit);
  }
  if (scope === 'all' && canViewAll(actor)) return runQuery<Liquidation>(col.orderBy('updatedAt', 'desc'), limit);
  return (await runQuery<Liquidation>(col.where('travellerId', '==', actor.uid), limit)).sort(byDesc((l) => l.updatedAt));
}

async function loadEditable(actor: Actor, id: string): Promise<{ liq: Liquidation; req: TravelRequest }> {
  const liq = await getLiquidation(id);
  const req = await getRequest(liq.requestId);
  if (!(liq.travellerId === actor.uid || req.requesterId === actor.uid || isAdmin(actor))) throw forbidden('Only the traveller can edit this liquidation');
  if (liq.status !== 'OPEN' && liq.status !== 'RETURNED') throw unprocessable('NOT_EDITABLE', `Liquidation cannot be edited while ${liq.status}`);
  return { liq, req };
}

async function save(actor: ActorLike, liq: Liquidation, action: string, extra: Partial<import('@tms/shared').AuditEvent> = {}): Promise<Liquidation> {
  const next: Liquidation = { ...liq, reconciliation: reconcile(liq.reconciliation.advanceReceived, liq.lines), updatedAt: nowIso() };
  await db.collection(COL.liquidations).doc(liq.id).set(next);
  await audit(actor, { entityType: 'liquidation', entityId: liq.id, action, ...extra });
  return next;
}

export async function updateLiquidation(actor: Actor, id: string, body: UpdateLiquidationBody): Promise<Liquidation> {
  const { liq } = await loadEditable(actor, id);
  const next: Liquidation = { ...liq };
  if (body.lines) next.lines = body.lines.map((l) => ({ ...l, id: l.id || shortId(), receipts: l.receipts ?? [] }));
  if (body.tripReport) next.tripReport = { ...liq.tripReport, ...body.tripReport, submittedAt: liq.tripReport.submittedAt, supervisorApprovedAt: liq.tripReport.supervisorApprovedAt };
  if (body.refundReference !== undefined) next.refundReference = body.refundReference;
  return save(actor, next, 'UPDATED', { newValue: { keys: Object.keys(body) } });
}

export async function addLine(actor: Actor, id: string, body: AddExpenseLineBody): Promise<Liquidation> {
  const { liq } = await loadEditable(actor, id);
  const line: ExpenseLine = { id: shortId(), category: body.category, label: body.label, budgeted: body.budgeted ?? 0, actual: body.actual, receiptRequired: body.receiptRequired ?? body.category !== 'PER_DIEM', receipts: [] };
  return save(actor, { ...liq, lines: [...liq.lines, line] }, 'LINE_ADDED', { newValue: line });
}

export async function deleteLine(actor: Actor, id: string, lineId: string): Promise<Liquidation> {
  const { liq } = await loadEditable(actor, id);
  const line = liq.lines.find((l) => l.id === lineId);
  if (!line) throw notFound('Expense line');
  return save(actor, { ...liq, lines: liq.lines.filter((l) => l.id !== lineId) }, 'LINE_REMOVED', { oldValue: line });
}

async function attachmentOwnedBy(actor: Actor, attachmentId: string, kind: Attachment['kind']): Promise<Attachment> {
  const att = await mustGet<Attachment>(COL.attachments, attachmentId, 'Attachment');
  if (att.uploadedBy !== actor.uid && !isAdmin(actor)) throw forbidden('You can only attach files you uploaded');
  return { ...att, kind };
}

export async function attachReceipt(actor: Actor, id: string, lineId: string, attachmentId: string): Promise<Liquidation> {
  const { liq } = await loadEditable(actor, id);
  const idx = liq.lines.findIndex((l) => l.id === lineId);
  if (idx < 0) throw notFound('Expense line');
  const att = await attachmentOwnedBy(actor, attachmentId, 'RECEIPT');
  const lines = liq.lines.map((l, i) => (i === idx ? { ...l, receipts: [...l.receipts.filter((r) => r.id !== att.id), att] } : l));
  return save(actor, { ...liq, lines }, 'RECEIPT_ATTACHED', { newValue: { lineId, attachmentId } });
}

export async function attachBoardingPass(actor: Actor, id: string, attachmentId: string): Promise<Liquidation> {
  const { liq } = await loadEditable(actor, id);
  const att = await attachmentOwnedBy(actor, attachmentId, 'BOARDING_PASS');
  return save(actor, { ...liq, boardingPasses: [...liq.boardingPasses.filter((b) => b.id !== att.id), att] }, 'BOARDING_PASS_ATTACHED', { newValue: { attachmentId } });
}

export async function submitTripReport(actor: Actor, id: string): Promise<Liquidation> {
  const { liq, req } = await loadEditable(actor, id);
  const tr = liq.tripReport;
  const missing = (['objective', 'activities', 'outcomes'] as const).filter((k) => !tr[k]?.trim());
  if (missing.length) throw unprocessable('TRIP_REPORT_INCOMPLETE', 'Trip report needs at least objective, activities and outcomes', { missing });
  const supervisorId = tr.supervisorId ?? req.supervisorId;
  const next = await save(actor, { ...liq, tripReport: { ...tr, supervisorId, submittedAt: nowIso(), supervisorApprovedAt: undefined } }, 'TRIP_REPORT_SUBMITTED');
  await notify(supervisorId, { title: 'Trip report awaiting your sign-off', body: `${liq.travellerName} · ${req.id} · ${req.activityTitle}`, link: `/liquidations/${liq.id}`, kind: 'TRIP_REPORT_SUBMITTED' });
  return next;
}

export async function approveTripReport(actor: Actor, id: string, comment?: string): Promise<Liquidation> {
  const liq = await getLiquidation(id);
  const req = await getRequest(liq.requestId);
  if (!(req.supervisorId === actor.uid || liq.tripReport.supervisorId === actor.uid || isAdmin(actor))) throw forbidden('Only the traveller’s supervisor can approve the trip report');
  if (!liq.tripReport.submittedAt) throw unprocessable('TRIP_REPORT_NOT_SUBMITTED', 'The trip report has not been submitted yet');
  const next = await save(actor, { ...liq, tripReport: { ...liq.tripReport, supervisorApprovedAt: nowIso(), supervisorComment: comment } }, 'TRIP_REPORT_APPROVED', { newValue: { comment } });
  await notify(liq.travellerId, { title: 'Trip report approved', body: `${req.id} · ${req.activityTitle} — your supervisor signed off the trip report.`, link: `/liquidations/${liq.id}`, kind: 'TRIP_REPORT_APPROVED' });
  return next;
}

export async function submitLiquidation(actor: Actor, id: string): Promise<Liquidation> {
  const { liq, req } = await loadEditable(actor, id);
  const readiness = liquidationReadiness(liq);
  if (!readiness.ready) throw unprocessable('LIQUIDATION_NOT_READY', 'Liquidation is missing required evidence', { items: readiness.items.filter((i) => !i.ok) });
  const now = nowIso();
  const next = await save(actor, { ...liq, status: 'SUBMITTED', submittedAt: now }, 'SUBMITTED', { oldValue: { status: liq.status }, newValue: { status: 'SUBMITTED' } });
  await db.collection(COL.travelRequests).doc(req.id).set({ status: 'LIQUIDATION_REVIEW', updatedAt: now }, { merge: true });
  await db.collection(COL.trips).doc(req.id).set({ 'financials.expensesLogged': next.reconciliation.totalActual, updatedAt: now }, { merge: true });
  await notifyMany(await userIdsWithRoles(FINANCE_ROLES), { title: 'Liquidation submitted for review', body: `${liq.travellerName} · ${req.id} · ${req.activityTitle}`, link: `/liquidations/${liq.id}`, kind: 'LIQUIDATION_SUBMITTED' });
  return next;
}

export async function reviewLiquidation(actor: Actor, id: string, body: LiquidationReviewBody): Promise<Liquidation> {
  if (!hasAnyRole(actor.roles, ['FINANCE_ACCOUNTANT', 'FINANCE_DIRECTOR']) && !isAdmin(actor)) throw forbidden('Only Finance can review liquidations');
  const liq = await getLiquidation(id);
  if (liq.status !== 'SUBMITTED') throw unprocessable('INVALID_STATE', `Liquidation is ${liq.status}, not SUBMITTED`);
  const req = await getRequest(liq.requestId);
  const now = nowIso();
  if (body.decision === 'APPROVED') {
    const next = await save(actor, { ...liq, status: 'CLOSED', reviewedAt: now, reviewerComment: body.comment, refundReference: body.settlementReference ?? liq.refundReference }, 'APPROVED_AND_CLOSED', { newValue: { settlementReference: body.settlementReference } });
    await db.collection(COL.travelRequests).doc(req.id).set({ status: 'CLOSED', closedAt: now, updatedAt: now }, { merge: true });
    await audit(actor, { entityType: 'travelRequest', entityId: req.id, action: 'LIQUIDATED_AND_CLOSED', oldValue: { status: req.status }, newValue: { status: 'CLOSED' } });
    const dir = next.reconciliation.direction;
    const body2 = dir === 'DUE_TO_EMPLOYEE' ? `ZMW ${next.reconciliation.settlement.toFixed(2)} is payable to you.` : dir === 'REFUND_TO_IHM' ? `Please refund ZMW ${Math.abs(next.reconciliation.settlement).toFixed(2)} to IHM.` : 'Advance and actuals balance.';
    await notify(liq.travellerId, { title: 'Liquidation approved', body: `${req.id} · ${req.activityTitle} — ${body2}`, link: `/liquidations/${liq.id}`, kind: 'LIQUIDATION_APPROVED' });
    return next;
  }
  const next = await save(actor, { ...liq, status: 'RETURNED', reviewedAt: now, reviewerComment: body.comment }, 'RETURNED', { newValue: { comment: body.comment } });
  await db.collection(COL.travelRequests).doc(req.id).set({ status: 'AWAITING_LIQUIDATION', updatedAt: now }, { merge: true });
  await notify(liq.travellerId, { title: 'Liquidation returned', body: `${req.id} · ${req.activityTitle}${body.comment ? ` — ${body.comment}` : ''}`, link: `/liquidations/${liq.id}`, kind: 'LIQUIDATION_RETURNED' });
  return next;
}

export async function openEarly(actor: Actor, requestId: string): Promise<Liquidation> {
  const req = await getRequest(requestId);
  if (!(req.requesterId === actor.uid || (req.travellerIds ?? []).includes(actor.uid) || isAdmin(actor))) throw forbidden();
  if (!['READY_FOR_TRAVEL', 'IN_PROGRESS', 'AWAITING_LIQUIDATION'].includes(req.status)) throw unprocessable('INVALID_STATE', `Liquidation can be opened once the trip is ready or in progress (currently ${req.status})`);
  return ensureLiquidation(requestId, actor);
}
