import type { ApprovalChainItem, ApprovalDecisionBody, ApprovalRecord, Attachment, CreateExternalPaymentBody, ExternalParticipant, ExternalParticipantLine, ExternalPaymentDetailResponse, ExternalPaymentRequest, ExternalPaymentStatus, UpsertExternalParticipantBody, WorkflowStage } from '@tms/shared';
import { calendarDaysBetween, computeExternalLine, effectiveRate, externalPayoutsMissing, hasAnyRole, summariseExternal, workflowForCategory, FINANCE_ROLES } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso } from '../lib/firebase';
import { forbidden, unprocessable } from '../lib/errors';
import { nextRef, shortId } from '../lib/ids';
import { audit, notify, notifyMany } from '../lib/audit';
import { byDesc, mustGet, runQuery } from '../lib/query';
import { loadConfig } from './config';
import { canViewAll, isAdmin, stageRolesHeld } from './access';
import { getProfile, shortName, userIdsWithRoles } from './people';
import { getCostCentre } from './masterData';
import { maskPayout } from '../lib/mask';

export const EXT_REVIEW_STATUSES: ExternalPaymentStatus[] = ['CC_HEAD_REVIEW', 'FINANCE_REVIEW', 'FINANCE_DIRECTOR_REVIEW', 'FINAL_APPROVAL'];

export const activityDays = (startDate: string, endDate: string) => Math.max(1, calendarDaysBetween(startDate, endDate) + 1);

export const stageStatus = (stage: WorkflowStage): ExternalPaymentStatus => {
  switch (stage.key) {
    case 'cc_head':
    case 'hod_cc':
      return 'CC_HEAD_REVIEW';
    case 'finance':
      return 'FINANCE_REVIEW';
    case 'finance_director':
      return 'FINANCE_DIRECTOR_REVIEW';
    default:
      return 'FINAL_APPROVAL';
  }
};

export async function getPayment(id: string): Promise<ExternalPaymentRequest> {
  return mustGet<ExternalPaymentRequest>(COL.externalPayments, id, 'External payment request');
}

export function canViewPayment(actor: Actor, p: ExternalPaymentRequest): boolean {
  if (p.requesterId === actor.uid || canViewAll(actor)) return true;
  if (hasAnyRole(actor.roles, ['COST_CENTRE_OWNER']) && (actor.profile.costCentreIds ?? []).includes(p.costCentreId)) return true;
  return (p.workflow?.stages ?? []).some((s) => stageRolesHeld(actor.roles, s.roles).length > 0);
}

export function canActOnPayment(actor: Actor, p: ExternalPaymentRequest): WorkflowStage | null {
  const stage = p.workflow?.stages[p.currentStageIndex];
  if (!stage || p.status !== stageStatus(stage)) return null;
  if (isAdmin(actor) || stageRolesHeld(actor.roles, stage.roles).length) return stage;
  return null;
}

export function policyRules(p: ExternalPaymentRequest): { label: string; ok: boolean }[] {
  return [
    { label: 'DSA and lunch are mutually exclusive', ok: p.participants.every((l) => !(l.dsa > 0 && l.lunch > 0)) },
    { label: 'No transport where activity is at duty station', ok: p.participants.every((l) => !(l.isHostSite && l.transport > 0)) },
    { label: 'No out-of-pocket for external parties', ok: p.participants.every((l) => Math.abs(l.total - (l.dsa + l.lunch + l.transport)) < 0.005) },
    { label: 'Separate from employee travel forms', ok: true },
  ];
}

export function paymentChain(p: ExternalPaymentRequest, fallbackNames: Record<string, string | undefined> = {}): ApprovalChainItem[] {
  const items: ApprovalChainItem[] = [];
  if (p.status !== 'DRAFT') items.push({ key: 'submitted', label: 'Submitted', state: 'done', actorName: p.requesterName, at: p.approvals[0]?.at ?? p.updatedAt });
  const past = ['APPROVED', 'PAID', 'ACQUITTED'].includes(p.status);
  (p.workflow?.stages ?? []).forEach((s, i) => {
    const recs = p.approvals.filter((a) => a.stageKey === s.key);
    const latest = recs[recs.length - 1];
    let state: ApprovalChainItem['state'];
    if (past) state = 'done';
    else if (p.status === 'REJECTED' && latest?.decision === 'REJECTED') state = 'rejected';
    else if (i < p.currentStageIndex) state = latest?.decision === 'APPROVED' && !latest.invalidated ? 'done' : 'invalidated';
    else if (i === p.currentStageIndex) state = 'current';
    else state = 'upcoming';
    items.push({ key: s.key, label: s.label, state, actorName: latest?.actorName ?? fallbackNames[s.key], at: latest?.at, comment: latest?.comment });
  });
  return items;
}

export async function paymentDetail(actor: Actor, p: ExternalPaymentRequest): Promise<ExternalPaymentDetailResponse> {
  if (!canViewPayment(actor, p)) throw forbidden('You cannot view this payment request');
  const cc = await getCostCentre(p.costCentreId);
  const owner = await getProfile(cc?.ownerId);
  return {
    payment: p,
    payoutsMissing: externalPayoutsMissing(p.participants),
    canAct: !!canActOnPayment(actor, p),
    canEdit: (p.requesterId === actor.uid || isAdmin(actor)) && (p.status === 'DRAFT' || p.status === 'RETURNED'),
    policyRules: policyRules(p),
    approvalChain: paymentChain(p, { cc_head: owner ? shortName(owner.displayName) : undefined }),
  };
}

export async function listPayments(actor: Actor, scope: 'mine' | 'review' | 'all', limit: number): Promise<ExternalPaymentRequest[]> {
  const col = db.collection(COL.externalPayments);
  if (scope === 'review') {
    const list = await runQuery<ExternalPaymentRequest>(col.where('status', 'in', EXT_REVIEW_STATUSES).orderBy('updatedAt', 'desc'), limit);
    return list.filter((p) => canActOnPayment(actor, p));
  }
  if (scope === 'all' && canViewAll(actor)) return runQuery<ExternalPaymentRequest>(col.orderBy('updatedAt', 'desc'), limit);
  return (await runQuery<ExternalPaymentRequest>(col.where('requesterId', '==', actor.uid), limit)).sort(byDesc((p) => p.updatedAt));
}

export async function createPayment(actor: Actor, body: CreateExternalPaymentBody): Promise<ExternalPaymentRequest> {
  if (body.endDate < body.startDate) throw unprocessable('INVALID_RANGE', 'End date must be on or after start date');
  const cfg = await loadConfig();
  const dsa = effectiveRate(cfg.rates, 'EXTERNAL_DSA', body.startDate);
  const lunch = effectiveRate(cfg.rates, 'EXTERNAL_LUNCH', body.startDate);
  const transport = effectiveRate(cfg.rates, 'EXTERNAL_TRANSPORT_ALLOWANCE', body.startDate);
  const { id } = await nextRef('EXT');
  const now = nowIso();
  const location = cfg.locations.find((l) => l.name === body.activityLocationName || l.town === body.activityLocationName);
  const p: ExternalPaymentRequest = {
    id,
    activityTitle: body.activityTitle,
    activityLocation: location?.id ?? '',
    activityLocationName: body.activityLocationName,
    startDate: body.startDate,
    endDate: body.endDate,
    endsBeforeNoon: !!body.endsBeforeNoon,
    requesterId: actor.uid,
    requesterName: actor.profile.displayName,
    costCentreId: body.costCentreId,
    participants: [],
    totals: { dsa: 0, lunch: 0, transport: 0, total: 0 },
    rates: { dsaRateId: dsa?.id, dsaPerDay: dsa?.value ?? 0, lunchPerDay: lunch?.value ?? 0, transportFlat: transport?.value ?? 0, dsaEffectiveFrom: dsa?.effectiveFrom },
    status: 'DRAFT',
    workflow: null,
    currentStageIndex: -1,
    approvals: [],
    acquittal: { acquittalSheets: [] },
    createdAt: now,
    updatedAt: now,
    approverIds: [],
  };
  await db.collection(COL.externalPayments).doc(id).set(p);
  await audit(actor, { entityType: 'externalPayment', entityId: id, action: 'CREATED', newValue: { activityTitle: p.activityTitle, costCentreId: p.costCentreId } });
  return p;
}

async function save(actor: Actor, p: ExternalPaymentRequest, action: string, extra: Partial<import('@tms/shared').AuditEvent> = {}): Promise<ExternalPaymentRequest> {
  const next = { ...p, updatedAt: nowIso() };
  await db.collection(COL.externalPayments).doc(p.id).set(next);
  await audit(actor, { entityType: 'externalPayment', entityId: p.id, action, ...extra });
  return next;
}

function assertEditable(actor: Actor, p: ExternalPaymentRequest): void {
  if (p.requesterId !== actor.uid && !isAdmin(actor)) throw forbidden('Only the requester can edit this payment request');
  if (p.status !== 'DRAFT' && p.status !== 'RETURNED') throw unprocessable('NOT_EDITABLE', `Payment request is ${p.status}`);
}

export function buildLine(p: Pick<ExternalPaymentRequest, 'startDate' | 'endDate' | 'endsBeforeNoon' | 'rates'>, participant: ExternalParticipant, flags: { isHostSite: boolean; ihmProvidesTransport: boolean }): ExternalParticipantLine {
  const calc = computeExternalLine({ ...flags, payout: participant.payout }, { days: activityDays(p.startDate, p.endDate), endsBeforeNoon: p.endsBeforeNoon }, p.rates);
  return {
    participantId: participant.id,
    fullName: participant.fullName,
    organisation: participant.organisation,
    dutyStationName: participant.dutyStationName,
    isHostSite: flags.isHostSite,
    ihmProvidesTransport: flags.ihmProvidesTransport,
    payout: participant.payout,
    ...calc,
  };
}

/** Replace the participant list; upserts external participant profiles and recomputes every line + totals (SRS §14.2–14.4). */
export async function setParticipants(actor: Actor, id: string, participants: UpsertExternalParticipantBody[]): Promise<ExternalPaymentRequest> {
  const p = await getPayment(id);
  assertEditable(actor, p);
  const batch = db.batch();
  const lines: ExternalParticipantLine[] = [];
  for (const body of participants) {
    const existingId = body.participantId;
    const profileSnap = existingId ? await db.collection(COL.externalParticipants).doc(existingId).get() : null;
    const existing = profileSnap?.exists ? (profileSnap.data() as ExternalParticipant) : null;
    const participant: ExternalParticipant = {
      id: existing?.id ?? existingId ?? shortId(),
      fullName: body.fullName,
      organisation: body.organisation,
      dutyStationName: body.dutyStationName,
      district: existing?.district,
      phone: existing?.phone,
      idReference: existing?.idReference,
      payout: body.payout === undefined ? (existing?.payout ?? null) : (maskPayout(body.payout) ?? null),
    };
    batch.set(db.collection(COL.externalParticipants).doc(participant.id), participant, { merge: true });
    lines.push(buildLine(p, participant, { isHostSite: !!body.isHostSite, ihmProvidesTransport: !!body.ihmProvidesTransport }));
  }
  await batch.commit();
  return save(actor, { ...p, participants: lines, totals: summariseExternal(lines) }, 'PARTICIPANTS_SET', { newValue: { count: lines.length, total: summariseExternal(lines).total } });
}

async function approversFor(p: ExternalPaymentRequest, stage: WorkflowStage): Promise<string[]> {
  if (stage.key === 'cc_head' || stage.key === 'hod_cc') {
    const cc = await getCostCentre(p.costCentreId);
    if (cc?.ownerId) return [cc.ownerId];
  }
  return userIdsWithRoles(stage.roles);
}

export async function submitPayment(actor: Actor, id: string): Promise<ExternalPaymentRequest> {
  const p = await getPayment(id);
  assertEditable(actor, p);
  if (!p.participants.length) throw unprocessable('VALIDATION', 'Add at least one participant');
  const cfg = await loadConfig();
  const wf = p.workflow && p.status === 'RETURNED' ? null : workflowForCategory(cfg.workflows, 'EXTERNAL_PAYMENT');
  const workflow = wf ? { id: wf.id, version: wf.version, stages: wf.stages } : p.workflow;
  if (!workflow) throw unprocessable('NO_WORKFLOW', 'No active external-payment workflow');
  const stage = workflow.stages[0]!;
  const next = await save(actor, { ...p, workflow, currentStageIndex: 0, status: stageStatus(stage), approvals: p.approvals.filter((a) => !a.invalidated) }, 'SUBMITTED', { stage: stage.key, oldValue: { status: p.status }, newValue: { status: stageStatus(stage) } });
  await notifyMany(await approversFor(next, stage), { title: 'External payment awaiting your approval', body: `${p.requesterName} · ${id} · ${p.activityTitle} · ZMW ${p.totals.total.toFixed(2)}`, link: `/finance/external-payments/${id}`, kind: 'APPROVAL_PENDING' });
  return next;
}

export async function decidePayment(actor: Actor, id: string, body: ApprovalDecisionBody): Promise<ExternalPaymentRequest> {
  const p = await getPayment(id);
  const stage = canActOnPayment(actor, p);
  if (!stage) throw forbidden('You cannot act on this payment request at its current stage');
  if (body.decision === 'APPROVED') {
    const missing = externalPayoutsMissing(p.participants);
    if (missing) throw unprocessable('PAYOUT_MISSING', `${missing} participant${missing === 1 ? '' : 's'} without bank or mobile-money details`, { missing });
  } else if (!body.comment?.trim()) throw unprocessable('COMMENT_REQUIRED', 'Please add a comment for the requester');
  const now = nowIso();
  const role = stageRolesHeld(actor.roles, stage.roles)[0] ?? stage.roles[0]!;
  const record: ApprovalRecord = { id: shortId(), stageKey: stage.key, stageLabel: stage.label, role, actorId: actor.uid, actorName: actor.profile.displayName, decision: body.decision, comment: body.comment?.trim() || undefined, requestVersion: 1, at: now };
  let next: ExternalPaymentRequest = { ...p, approvals: [...p.approvals, record], approverIds: [...new Set([...(p.approverIds ?? []), actor.uid])] };
  let nextApprovers: string[] = [];
  let title = '';
  switch (body.decision) {
    case 'APPROVED': {
      const idx = p.currentStageIndex + 1;
      const stages = p.workflow!.stages;
      if (idx >= stages.length) {
        next = { ...next, status: 'APPROVED', currentStageIndex: idx };
        title = 'External payment approved';
        nextApprovers = await userIdsWithRoles(['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT']);
      } else {
        next = { ...next, status: stageStatus(stages[idx]!), currentStageIndex: idx };
        title = `Approved by ${stage.label}`;
        nextApprovers = await approversFor(next, stages[idx]!);
      }
      break;
    }
    case 'REJECTED':
      next = { ...next, status: 'REJECTED' };
      title = 'External payment rejected';
      break;
    default:
      next = { ...next, status: 'RETURNED' };
      title = body.decision === 'RETURNED' ? 'External payment returned for correction' : 'Clarification requested on external payment';
  }
  const saved = await save(actor, next, `DECISION_${body.decision}`, { stage: stage.key, oldValue: { status: p.status }, newValue: { status: next.status, comment: record.comment } });
  await notify(p.requesterId, { title, body: `${id} · ${p.activityTitle}${record.comment ? ` — ${record.comment}` : ''}`, link: `/finance/external-payments/${id}`, kind: `EXT_${body.decision}` });
  if (nextApprovers.length) await notifyMany(nextApprovers, { title: next.status === 'APPROVED' ? 'External payment ready for electronic payment' : 'External payment awaiting your approval', body: `${p.requesterName} · ${id} · ZMW ${p.totals.total.toFixed(2)}`, link: `/finance/external-payments/${id}`, kind: next.status === 'APPROVED' ? 'EXT_PAYABLE' : 'APPROVAL_PENDING' });
  return saved;
}

export async function payPayment(actor: Actor, id: string, reference?: string): Promise<ExternalPaymentRequest> {
  if (!hasAnyRole(actor.roles, FINANCE_ROLES) && !isAdmin(actor)) throw forbidden('Only Finance can record payment');
  const p = await getPayment(id);
  if (p.status !== 'APPROVED') throw unprocessable('INVALID_STATE', `Payment request is ${p.status}, not APPROVED`);
  const next = await save(actor, { ...p, status: 'PAID', paidAt: nowIso(), paymentReference: reference }, 'PAID', { newValue: { reference } });
  await notify(p.requesterId, { title: 'External payment processed', body: `${id} · ZMW ${p.totals.total.toFixed(2)} paid by bank transfer / mobile money${reference ? ` · ref ${reference}` : ''}. Upload the acquittal pack to close.`, link: `/finance/external-payments/${id}`, kind: 'EXT_PAID' });
  return next;
}

export async function recordAcquittal(actor: Actor, id: string, body: { attendanceRegisterId?: string; acquittalSheetIds?: string[]; bankEvidenceId?: string }): Promise<ExternalPaymentRequest> {
  const p = await getPayment(id);
  if (!(p.requesterId === actor.uid || hasAnyRole(actor.roles, FINANCE_ROLES) || isAdmin(actor))) throw forbidden();
  if (p.status !== 'PAID' && p.status !== 'ACQUITTED') throw unprocessable('INVALID_STATE', 'Acquittal follows payment');
  const load = async (attId?: string, kind?: Attachment['kind']) => (attId ? { ...(await mustGet<Attachment>(COL.attachments, attId, 'Attachment')), kind: kind ?? 'OTHER' } : undefined);
  const acquittal = { ...p.acquittal };
  if (body.attendanceRegisterId) acquittal.attendanceRegister = await load(body.attendanceRegisterId, 'ATTENDANCE_REGISTER');
  if (body.bankEvidenceId) acquittal.bankEvidence = await load(body.bankEvidenceId, 'PAYMENT_PROOF');
  if (body.acquittalSheetIds?.length) acquittal.acquittalSheets = (await Promise.all(body.acquittalSheetIds.map((a) => load(a, 'ACQUITTAL')))).filter(Boolean) as Attachment[];
  const complete = !!acquittal.attendanceRegister && !!acquittal.bankEvidence && acquittal.acquittalSheets.length > 0;
  return save(actor, { ...p, acquittal, status: complete ? 'ACQUITTED' : p.status }, complete ? 'ACQUITTED' : 'ACQUITTAL_UPDATED', { newValue: { complete } });
}
