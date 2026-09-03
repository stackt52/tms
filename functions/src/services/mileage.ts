import type { Attachment, CreateMileageClaimBody, MileageClaim, MileageDetailResponse } from '@tms/shared';
import { computeMileage, effectiveRate, hasAnyRole, mileagePolicyCheck, FINANCE_ROLES } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso } from '../lib/firebase';
import { forbidden, unprocessable } from '../lib/errors';
import { nextRef } from '../lib/ids';
import { audit, notify, notifyMany } from '../lib/audit';
import { byDesc, mustGet, runQuery } from '../lib/query';
import { loadConfig } from './config';
import { canViewAll, isAdmin } from './access';
import { getProfile, userIdsWithRoles } from './people';

export async function getClaim(id: string): Promise<MileageClaim> {
  return mustGet<MileageClaim>(COL.mileageClaims, id, 'Mileage claim');
}

async function supervisorOf(claimantId: string): Promise<string | undefined> {
  return (await getProfile(claimantId))?.supervisorId;
}

export async function claimDetail(actor: Actor, claim: MileageClaim): Promise<MileageDetailResponse> {
  const supervisorId = await supervisorOf(claim.claimantId);
  const canView = claim.claimantId === actor.uid || supervisorId === actor.uid || canViewAll(actor);
  if (!canView) throw forbidden('You cannot view this claim');
  const policy = mileagePolicyCheck(claim);
  return {
    claim,
    policy,
    canSubmit: claim.claimantId === actor.uid && claim.status === 'DRAFT' && policy.ok,
    canDecide: claim.status === 'SUBMITTED' && (supervisorId === actor.uid || hasAnyRole(actor.roles, ['FINANCE_ACCOUNTANT']) || isAdmin(actor)),
  };
}

export async function listClaims(actor: Actor, scope: 'mine' | 'review' | 'all', limit: number): Promise<MileageClaim[]> {
  const col = db.collection(COL.mileageClaims);
  if (scope === 'review') {
    const submitted = await runQuery<MileageClaim>(col.where('status', '==', 'SUBMITTED').orderBy('updatedAt', 'desc'), limit);
    if (hasAnyRole(actor.roles, FINANCE_ROLES) || isAdmin(actor)) return submitted;
    const supervised = await runQuery<{ id: string }>(db.collection(COL.users).where('supervisorId', '==', actor.uid), 200);
    const ids = new Set(supervised.map((u) => u.id));
    return submitted.filter((c) => ids.has(c.claimantId));
  }
  if (scope === 'all' && canViewAll(actor)) return runQuery<MileageClaim>(col.orderBy('updatedAt', 'desc'), limit);
  return runQuery<MileageClaim>(col.where('claimantId', '==', actor.uid).orderBy('updatedAt', 'desc'), limit);
}

function priced(claim: MileageClaim, rates: import('@tms/shared').Rate[]): MileageClaim {
  const rate = effectiveRate(rates, 'MILEAGE_RATE', claim.date);
  const ratePerKm = rate?.value ?? claim.ratePerKm ?? 0;
  return { ...claim, rateId: rate?.id, ratePerKm, rateEffectiveFrom: rate?.effectiveFrom, amount: computeMileage(claim.distanceKm, ratePerKm) };
}

export async function createClaim(actor: Actor, body: CreateMileageClaimBody): Promise<MileageClaim> {
  const cfg = await loadConfig();
  const { id } = await nextRef('MIL');
  const now = nowIso();
  const claim = priced(
    {
      id,
      claimantId: actor.uid,
      claimantName: actor.profile.displayName,
      purpose: body.purpose,
      date: body.date,
      fromName: body.fromName,
      toName: body.toName,
      province: body.province ?? actor.profile.province ?? '',
      withinProvince: body.withinProvince ?? true,
      distanceKm: body.distanceKm,
      ratePerKm: 0,
      amount: 0,
      preApprovalRef: body.preApprovalRef,
      preApprovalAttached: !!body.preApprovalRef,
      routeEvidence: [],
      businessEvidence: [],
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
    },
    cfg.rates,
  );
  await db.collection(COL.mileageClaims).doc(id).set(claim);
  await audit(actor, { entityType: 'mileageClaim', entityId: id, action: 'CREATED', newValue: { distanceKm: claim.distanceKm, amount: claim.amount } });
  return claim;
}

async function save(actor: Actor, c: MileageClaim, action: string, extra: Partial<import('@tms/shared').AuditEvent> = {}): Promise<MileageClaim> {
  const next = { ...c, updatedAt: nowIso() };
  await db.collection(COL.mileageClaims).doc(c.id).set(next);
  await audit(actor, { entityType: 'mileageClaim', entityId: c.id, action, ...extra });
  return next;
}

export async function patchClaim(actor: Actor, id: string, body: Partial<CreateMileageClaimBody>): Promise<MileageClaim> {
  const claim = await getClaim(id);
  if (claim.claimantId !== actor.uid && !isAdmin(actor)) throw forbidden();
  if (claim.status !== 'DRAFT') throw unprocessable('NOT_EDITABLE', `Claim is ${claim.status}`);
  const cfg = await loadConfig();
  const merged: MileageClaim = { ...claim, ...body, preApprovalAttached: body.preApprovalRef !== undefined ? !!body.preApprovalRef : claim.preApprovalAttached };
  return save(actor, priced(merged, cfg.rates), 'UPDATED', { newValue: { keys: Object.keys(body) } });
}

export async function addEvidence(actor: Actor, id: string, attachmentId: string, type: 'ROUTE' | 'BUSINESS' | 'PRE_APPROVAL'): Promise<MileageClaim> {
  const claim = await getClaim(id);
  if (claim.claimantId !== actor.uid && !isAdmin(actor)) throw forbidden();
  if (claim.status !== 'DRAFT') throw unprocessable('NOT_EDITABLE', `Claim is ${claim.status}`);
  const att = await mustGet<Attachment>(COL.attachments, attachmentId, 'Attachment');
  if (att.uploadedBy !== actor.uid && !isAdmin(actor)) throw forbidden('You can only attach files you uploaded');
  const next = { ...claim };
  if (type === 'ROUTE') next.routeEvidence = [...claim.routeEvidence.filter((a) => a.id !== att.id), { ...att, kind: 'MAPS_ROUTE' }];
  else if (type === 'BUSINESS') next.businessEvidence = [...claim.businessEvidence.filter((a) => a.id !== att.id), { ...att, kind: att.kind === 'OTHER' ? 'AGENDA' : att.kind }];
  else {
    next.businessEvidence = [...claim.businessEvidence.filter((a) => a.id !== att.id), { ...att, kind: 'APPROVAL_EVIDENCE' }];
    next.preApprovalAttached = true;
    next.preApprovalRef = claim.preApprovalRef ?? att.name;
  }
  return save(actor, next, 'EVIDENCE_ADDED', { newValue: { attachmentId, type } });
}

export async function submitClaim(actor: Actor, id: string): Promise<MileageClaim> {
  const claim = await getClaim(id);
  if (claim.claimantId !== actor.uid && !isAdmin(actor)) throw forbidden();
  if (claim.status !== 'DRAFT') throw unprocessable('INVALID_STATE', `Claim is ${claim.status}`);
  const policy = mileagePolicyCheck(claim);
  if (!policy.ok) throw unprocessable('EVIDENCE_MISSING', 'Mileage policy checks are not all satisfied', { items: policy.items.filter((i) => !i.ok) });
  const next = await save(actor, { ...claim, status: 'SUBMITTED' }, 'SUBMITTED', { oldValue: { status: 'DRAFT' }, newValue: { status: 'SUBMITTED' } });
  const supervisorId = await supervisorOf(claim.claimantId);
  await notifyMany([supervisorId, ...(await userIdsWithRoles(['FINANCE_ACCOUNTANT']))], { title: 'Mileage claim awaiting review', body: `${claim.claimantName} · ${id} · ${claim.distanceKm} km · ZMW ${claim.amount.toFixed(2)}`, link: `/claims/${id}`, kind: 'MILEAGE_SUBMITTED' });
  return next;
}

export async function decideClaim(actor: Actor, id: string, decision: 'APPROVED' | 'REJECTED', comment?: string): Promise<MileageClaim> {
  const claim = await getClaim(id);
  if (claim.status !== 'SUBMITTED') throw unprocessable('INVALID_STATE', `Claim is ${claim.status}`);
  const supervisorId = await supervisorOf(claim.claimantId);
  if (!(supervisorId === actor.uid || hasAnyRole(actor.roles, ['FINANCE_ACCOUNTANT']) || isAdmin(actor))) throw forbidden('Only the claimant’s supervisor or Finance can decide this claim');
  if (decision === 'REJECTED' && !comment?.trim()) throw unprocessable('COMMENT_REQUIRED', 'Please give a reason');
  const next = await save(actor, { ...claim, status: decision, reviewerComment: comment }, `DECISION_${decision}`, { newValue: { decision, comment } });
  await notify(claim.claimantId, { title: decision === 'APPROVED' ? 'Mileage claim approved' : 'Mileage claim rejected', body: `${id} · ZMW ${claim.amount.toFixed(2)}${comment ? ` — ${comment}` : ''}`, link: `/claims/${id}`, kind: `MILEAGE_${decision}` });
  if (decision === 'APPROVED') await notifyMany(await userIdsWithRoles(['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT']), { title: 'Mileage reimbursement payable', body: `${claim.claimantName} · ${id} · ZMW ${claim.amount.toFixed(2)}`, link: `/claims/${id}`, kind: 'MILEAGE_PAYABLE' });
  return next;
}

export async function payClaim(actor: Actor, id: string, reference?: string): Promise<MileageClaim> {
  if (!hasAnyRole(actor.roles, FINANCE_ROLES) && !isAdmin(actor)) throw forbidden('Only Finance can mark a claim paid');
  const claim = await getClaim(id);
  if (claim.status !== 'APPROVED') throw unprocessable('INVALID_STATE', `Claim is ${claim.status}, not APPROVED`);
  const next = await save(actor, { ...claim, status: 'PAID', reviewerComment: reference ? `Paid · ref ${reference}` : claim.reviewerComment }, 'PAID', { newValue: { reference } });
  await notify(claim.claimantId, { title: 'Mileage reimbursement paid', body: `${id} · ZMW ${claim.amount.toFixed(2)}${reference ? ` · ref ${reference}` : ''}`, link: `/claims/${id}`, kind: 'MILEAGE_PAID' });
  return next;
}

export const sortClaims = (list: MileageClaim[]) => list.sort(byDesc((c) => c.updatedAt));
