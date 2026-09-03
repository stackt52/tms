import type {
  ApprovalDecisionBody,
  ApprovalDetailResponse,
  ApprovalQueueItem,
  ApprovalQueueResponse,
  ApprovalRecord,
  ExternalPaymentRequest,
  MileageClaim,
  Role,
  TravelRequest,
  UserProfile,
  VehicleBooking,
  WorkflowStage,
} from '@tms/shared';
import { FINANCE_ROLES, FLEET_ROLES, REVIEW_STATUSES, SUPERVISOR_CHECKLIST, STATUS_META, TRAVEL_CATEGORY_LABELS, calendarDaysBetween, hasAnyRole, isoDate, shortRef } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso } from '../lib/firebase';
import { forbidden, unprocessable } from '../lib/errors';
import { shortId } from '../lib/ids';
import { audit, notify, notifyMany } from '../lib/audit';
import { byDesc, getDoc, runQuery } from '../lib/query';
import { loadConfig, type Config } from './config';
import { stageRolesHeld, supervisorScopeOk } from './access';
import { approversForStage, buildDetail, getRequest, getRequestForActor } from './travelRequests';
import { buildAdvanceRecord, outstandingLiquidationRequestIds } from './advance';
import { tripForRequest } from './trips';
import { getProfiles, userIdsWithRoles } from './people';
import { getVendor } from './masterData';

export interface Delegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  roles: Role[];
  from: string; // ISO date
  to: string; // ISO date
  active?: boolean;
}

export interface ActingResolution {
  canAct: boolean;
  stage: WorkflowStage | null;
  role: Role | null;
  delegatedFromId?: string;
}

async function activeDelegationsTo(uid: string): Promise<Delegation[]> {
  const today = isoDate(new Date());
  const list = await runQuery<Delegation>(db.collection(COL.delegations).where('toUserId', '==', uid), 20);
  return list.filter((d) => d.active !== false && d.from <= today && d.to >= today);
}

/** Can the actor decide the current stage of a travel request (own roles, unit scope, or an active delegation)? */
export async function resolveActing(actor: Actor, req: TravelRequest, cfg?: Pick<Config, 'policy'>): Promise<ActingResolution> {
  const stage = req.workflow?.stages[req.currentStageIndex] ?? null;
  if (!stage || req.status !== stage.status) return { canAct: false, stage, role: null };
  const own = stageRolesHeld(actor.roles, stage.roles);
  if (own.length && (stage.key !== 'supervisor' || supervisorScopeOk(actor, req) || actor.roles.includes('SYSTEM_ADMIN'))) return { canAct: true, stage, role: own[0]! };
  if (actor.roles.includes('SYSTEM_ADMIN')) return { canAct: true, stage, role: stage.roles[0]! };
  const policy = cfg?.policy ?? (await loadConfig()).policy;
  if (policy.toggles.approvalDelegation) {
    for (const d of await activeDelegationsTo(actor.uid)) {
      const viaDelegate = stageRolesHeld(d.roles, stage.roles);
      if (!viaDelegate.length) continue;
      if (stage.key === 'supervisor' && req.supervisorId && req.supervisorId !== d.fromUserId) continue;
      return { canAct: true, stage, role: viaDelegate[0]!, delegatedFromId: d.fromUserId };
    }
  }
  return { canAct: false, stage, role: null };
}

/** Generic stage check for documents that carry a workflow snapshot (external payments). */
export function rolesCanActOn(roles: readonly Role[], stage: WorkflowStage | undefined | null): Role | null {
  if (!stage) return null;
  return stageRolesHeld(roles, stage.roles)[0] ?? null;
}

// ---------- queue ----------

export function travelTags(req: TravelRequest, asOf: string | Date = new Date()): ApprovalQueueItem['tags'] {
  const tags: ApprovalQueueItem['tags'] = [];
  if (req.category) tags.push({ label: TRAVEL_CATEGORY_LABELS[req.category], tone: req.category === 'INTERNATIONAL' ? 'info' : 'neutral' });
  if (req.itinerary.nights > 0) tags.push({ label: `${req.itinerary.nights} night${req.itinerary.nights === 1 ? '' : 's'}`, tone: 'neutral' });
  if (req.itinerary.departAt) {
    const days = calendarDaysBetween(asOf, req.itinerary.departAt);
    if (days >= 0 && days <= 10) tags.push({ label: days === 0 ? 'Departs today' : `Departs in ${days} day${days === 1 ? '' : 's'}`, tone: days <= 7 ? 'pending' : 'neutral' });
    else if (days < 0) tags.push({ label: 'Departure date passed', tone: 'blocked' });
  }
  if (req.category === 'INTERNATIONAL' && req.eligibility?.internationalNoticeOk === false) tags.push({ label: 'Under 2-week notice', tone: 'blocked' });
  else if (req.eligibility && !req.eligibility.leadTimeOk && req.costing.advanceEligibleTotal > 0) tags.push({ label: 'Lead time short', tone: 'pending' });
  if (req.isGroup) tags.push({ label: `Group · ${req.travellers.length}`, tone: 'neutral' });
  if (req.version > 1) tags.push({ label: `Resubmitted v${req.version}`, tone: 'info' });
  return tags;
}

function personOf(people: Map<string, UserProfile>, id: string, fallbackName: string) {
  const p = people.get(id);
  return {
    requesterName: p?.displayName ?? fallbackName,
    requesterInitials: p?.initials ?? fallbackName.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase(),
    avatarTone: p?.avatarTone ?? ('deep' as const),
  };
}

function trvItem(req: TravelRequest, people: Map<string, UserProfile>): ApprovalQueueItem {
  return {
    kind: 'TRV',
    id: req.id,
    ref: req.id,
    shortRef: shortRef(req.id),
    title: req.activityTitle,
    ...personOf(people, req.requesterId, req.requesterName),
    status: req.status,
    statusLabel: STATUS_META[req.status].label,
    tags: travelTags(req),
    submittedAt: req.submittedAt ?? req.updatedAt,
    amount: req.costing.total,
    href: `/approvals/${req.id}`,
  };
}

function extItem(p: ExternalPaymentRequest, people: Map<string, UserProfile>): ApprovalQueueItem {
  return {
    kind: 'EXT',
    id: p.id,
    ref: p.id,
    shortRef: shortRef(p.id),
    title: p.activityTitle,
    ...personOf(people, p.requesterId, p.requesterName),
    status: p.status,
    statusLabel: p.status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
    tags: [
      { label: 'External payment', tone: 'info' },
      { label: `${p.participants.length} participants`, tone: 'neutral' },
      ...(p.participants.some((l) => !l.payout) ? [{ label: 'Payout missing', tone: 'blocked' as const }] : []),
    ],
    submittedAt: p.updatedAt,
    amount: p.totals.total,
    href: `/finance/external-payments/${p.id}`,
  };
}

function milItem(c: MileageClaim, people: Map<string, UserProfile>): ApprovalQueueItem {
  return {
    kind: 'MIL',
    id: c.id,
    ref: c.id,
    shortRef: shortRef(c.id),
    title: c.purpose,
    ...personOf(people, c.claimantId, c.claimantName),
    status: c.status,
    statusLabel: c.status.charAt(0) + c.status.slice(1).toLowerCase(),
    tags: [
      { label: 'Mileage', tone: 'neutral' },
      { label: `${c.distanceKm} km`, tone: 'neutral' },
      ...(!c.withinProvince ? [{ label: 'Outside province', tone: 'blocked' as const }] : []),
    ],
    submittedAt: c.updatedAt,
    amount: c.amount,
    href: `/claims/${c.id}`,
  };
}

function vehItem(b: VehicleBooking, people: Map<string, UserProfile>): ApprovalQueueItem {
  return {
    kind: 'VEH',
    id: b.id,
    ref: b.id,
    shortRef: shortRef(b.id),
    title: `${b.mode === 'SELF_DRIVE' ? 'Self-drive' : 'Vehicle'}, ${b.purpose}`,
    ...personOf(people, b.requesterId, b.requesterName),
    status: b.status,
    statusLabel: b.status.charAt(0) + b.status.slice(1).toLowerCase().replace('_', ' '),
    tags: [
      { label: b.mode === 'SELF_DRIVE' ? 'Self-drive' : 'Assigned driver', tone: 'neutral' },
      { label: `${b.passengers} pax`, tone: 'neutral' },
    ],
    submittedAt: b.createdAt,
    href: `/fleet/bookings/${b.id}`,
  };
}

function lastDecisionBy(approvals: ApprovalRecord[], uid: string, decisions: ApprovalRecord['decision'][]): boolean {
  const last = approvals[approvals.length - 1];
  return !!last && last.actorId === uid && decisions.includes(last.decision);
}

export async function approvalQueue(actor: Actor): Promise<ApprovalQueueResponse> {
  const cfg = await loadConfig();
  const isFinance = hasAnyRole(actor.roles, FINANCE_ROLES);
  const isFleet = hasAnyRole(actor.roles, FLEET_ROLES) || actor.roles.includes('SYSTEM_ADMIN');
  const [inReview, returnedTrv, doneTrv, extInReview, extDone, milSubmitted, vehRequested] = await Promise.all([
    runQuery<TravelRequest>(db.collection(COL.travelRequests).where('status', 'in', REVIEW_STATUSES.filter((s) => s !== 'CLARIFICATION_REQUESTED')).orderBy('updatedAt', 'desc'), 200),
    runQuery<TravelRequest>(db.collection(COL.travelRequests).where('status', 'in', ['RETURNED_FOR_CORRECTION', 'CLARIFICATION_REQUESTED']).orderBy('updatedAt', 'desc'), 100),
    runQuery<TravelRequest>(db.collection(COL.travelRequests).where('approverIds', 'array-contains', actor.uid), 200),
    runQuery<ExternalPaymentRequest>(db.collection(COL.externalPayments).where('status', 'in', ['CC_HEAD_REVIEW', 'FINANCE_REVIEW', 'FINANCE_DIRECTOR_REVIEW', 'FINAL_APPROVAL', 'RETURNED']), 100),
    runQuery<ExternalPaymentRequest>(db.collection(COL.externalPayments).where('approverIds', 'array-contains', actor.uid), 100),
    runQuery<MileageClaim>(db.collection(COL.mileageClaims).where('status', '==', 'SUBMITTED'), 100),
    isFleet ? runQuery<VehicleBooking>(db.collection(COL.vehicleBookings).where('status', '==', 'REQUESTED'), 100) : Promise.resolve([] as VehicleBooking[]),
  ]);

  const pendingTrv: TravelRequest[] = [];
  for (const r of inReview) if ((await resolveActing(actor, r, cfg)).canAct) pendingTrv.push(r);
  const pendingExt = extInReview.filter((p) => p.status !== 'RETURNED' && rolesCanActOn(actor.roles, p.workflow?.stages[p.currentStageIndex]));

  const claimants = await getProfiles(milSubmitted.map((c) => c.claimantId));
  const pendingMil = milSubmitted.filter((c) => isFinance || actor.roles.includes('SYSTEM_ADMIN') || claimants.get(c.claimantId)?.supervisorId === actor.uid);

  const returnedTrvMine = returnedTrv.filter((r) => lastDecisionBy(r.approvals, actor.uid, ['RETURNED', 'CLARIFICATION_REQUESTED']));
  const returnedExtMine = extInReview.filter((p) => p.status === 'RETURNED' && lastDecisionBy(p.approvals, actor.uid, ['RETURNED', 'CLARIFICATION_REQUESTED']));

  const decidedAt = (approvals: ApprovalRecord[]) => [...approvals].reverse().find((a) => a.actorId === actor.uid)?.at ?? '';
  const doneTrvSorted = doneTrv.filter((r) => !pendingTrv.some((p) => p.id === r.id) && !returnedTrvMine.some((p) => p.id === r.id)).sort(byDesc((r) => decidedAt(r.approvals)));
  const doneExtSorted = extDone.filter((p) => !pendingExt.some((x) => x.id === p.id)).sort(byDesc((p) => decidedAt(p.approvals)));

  const peopleIds = [...pendingTrv, ...returnedTrvMine, ...doneTrvSorted].map((r) => r.requesterId).concat([...pendingExt, ...returnedExtMine, ...doneExtSorted].map((p) => p.requesterId), pendingMil.map((c) => c.claimantId), vehRequested.map((b) => b.requesterId));
  const people = await getProfiles(peopleIds);

  const pending = [...pendingTrv.map((r) => trvItem(r, people)), ...pendingExt.map((p) => extItem(p, people)), ...pendingMil.map((c) => milItem(c, people)), ...vehRequested.map((b) => vehItem(b, people))].sort(byDesc((i) => i.submittedAt)).reverse();
  const returned = [...returnedTrvMine.map((r) => trvItem(r, people)), ...returnedExtMine.map((p) => extItem(p, people))];
  const done = [...doneTrvSorted.map((r) => trvItem(r, people)), ...doneExtSorted.map((p) => extItem(p, people))].slice(0, 50);
  return { pending, returned, done, counts: { pending: pending.length, returned: returned.length, done: done.length } };
}

// ---------- detail + checklist ----------

const draftId = (requestId: string, uid: string) => `${requestId}_${uid}`;

export async function approvalDetail(actor: Actor, requestId: string): Promise<ApprovalDetailResponse> {
  const req = await getRequestForActor(actor, requestId);
  const [detail, acting, draft] = await Promise.all([buildDetail(actor, req), resolveActing(actor, req), getDoc<{ checklist: Record<string, boolean> }>(COL.approvalDrafts, draftId(requestId, actor.uid))]);
  const stage = req.workflow?.stages[req.currentStageIndex] ?? null;
  return {
    ...detail,
    stage,
    checklist: stage?.checklist ? SUPERVISOR_CHECKLIST : null,
    checklistState: draft?.checklist ?? {},
    canAct: acting.canAct,
    actingRole: acting.role,
  };
}

export async function saveChecklist(actor: Actor, requestId: string, checklist: Record<string, boolean>): Promise<Record<string, boolean>> {
  const req = await getRequestForActor(actor, requestId);
  const acting = await resolveActing(actor, req);
  if (!acting.canAct) throw forbidden('You cannot act on this request at its current stage');
  const clean: Record<string, boolean> = {};
  for (const item of SUPERVISOR_CHECKLIST) clean[item.key] = !!checklist[item.key];
  await db.collection(COL.approvalDrafts).doc(draftId(requestId, actor.uid)).set({ requestId, userId: actor.uid, checklist: clean, updatedAt: nowIso() });
  return clean;
}

// ---------- decide ----------

export async function decide(actor: Actor, requestId: string, body: ApprovalDecisionBody): Promise<TravelRequest> {
  const cfg = await loadConfig();
  const req = await getRequest(requestId);
  const acting = await resolveActing(actor, req, cfg);
  if (!acting.canAct || !acting.stage || !acting.role) throw forbidden('You cannot act on this request at its current stage');
  const stage = acting.stage;
  const stages = req.workflow!.stages;

  let checklist: Record<string, boolean> | undefined;
  if (stage.checklist) {
    const draft = await getDoc<{ checklist: Record<string, boolean> }>(COL.approvalDrafts, draftId(requestId, actor.uid));
    checklist = { ...(draft?.checklist ?? {}), ...(body.checklist ?? {}) };
    if (body.decision === 'APPROVED') {
      const missing = SUPERVISOR_CHECKLIST.filter((c) => !checklist![c.key]).map((c) => c.key);
      if (missing.length) throw unprocessable('CHECKLIST_INCOMPLETE', `${missing.length} check${missing.length === 1 ? '' : 's'} left before you can approve`, { missing });
    }
  }
  if ((body.decision === 'RETURNED' || body.decision === 'CLARIFICATION_REQUESTED' || body.decision === 'REJECTED') && !body.comment?.trim()) {
    throw unprocessable('COMMENT_REQUIRED', 'Please add a comment for the traveller');
  }

  const now = nowIso();
  const record: ApprovalRecord = {
    id: shortId(),
    stageKey: stage.key,
    stageLabel: stage.label,
    role: acting.role,
    actorId: actor.uid,
    actorName: actor.profile.displayName,
    delegatedFromId: acting.delegatedFromId,
    decision: body.decision,
    comment: body.comment?.trim() || undefined,
    checklist,
    requestVersion: req.version,
    at: now,
  };
  let next: TravelRequest = { ...req, approvals: [...req.approvals, record], approverIds: [...new Set([...(req.approverIds ?? []), actor.uid])], updatedAt: now };
  let nextApprovers: string[] = [];
  let travellerTitle = '';
  let travellerBody = `${req.id} · ${req.activityTitle}`;

  switch (body.decision) {
    case 'APPROVED': {
      const nextIndex = req.currentStageIndex + 1;
      if (nextIndex >= stages.length) {
        next = { ...next, status: 'APPROVED', approvedAt: now, approvedVersion: req.version, currentStageIndex: nextIndex, resumeStageIndex: null };
        next = await postApproval(actor, next, cfg);
        travellerTitle = 'Travel approved';
        travellerBody += next.advance?.requested ? ` — approved. Advance of ZMW ${next.advance.amount.toFixed(2)} (${next.advance.percentage}%) is with Finance.` : ' — approved.';
      } else {
        next = { ...next, currentStageIndex: nextIndex, status: stages[nextIndex]!.status, resumeStageIndex: null };
        nextApprovers = await approversForStage(next, stages[nextIndex]!);
        travellerTitle = `Approved by ${stage.label}`;
        travellerBody += ` — now with ${stages[nextIndex]!.label}.`;
      }
      break;
    }
    case 'REJECTED':
      next = { ...next, status: 'REJECTED', resumeStageIndex: null, closedAt: now };
      travellerTitle = 'Travel request rejected';
      travellerBody += ` — ${body.comment}`;
      break;
    case 'RETURNED':
      next = { ...next, status: 'RETURNED_FOR_CORRECTION', resumeStageIndex: null };
      travellerTitle = 'Request returned for correction';
      travellerBody += ` — ${body.comment}`;
      break;
    case 'CLARIFICATION_REQUESTED':
      next = { ...next, status: 'CLARIFICATION_REQUESTED', resumeStageIndex: req.currentStageIndex };
      travellerTitle = 'Clarification requested';
      travellerBody += ` — ${body.comment}`;
      break;
  }

  await db.collection(COL.travelRequests).doc(requestId).set(next);
  await db
    .collection(COL.approvalDrafts)
    .doc(draftId(requestId, actor.uid))
    .delete()
    .catch(() => undefined);
  await audit(actor, { entityType: 'travelRequest', entityId: requestId, action: `DECISION_${body.decision}`, stage: stage.key, oldValue: { status: req.status }, newValue: { status: next.status, comment: record.comment, delegatedFromId: record.delegatedFromId } });
  await notify(req.requesterId, { title: travellerTitle, body: travellerBody, link: `/requests/${req.id}`, kind: `DECISION_${body.decision}` });
  if (nextApprovers.length) {
    await notifyMany(nextApprovers, { title: 'Request awaiting your approval', body: `${req.requesterName} · ${req.id} · ${req.activityTitle}`, link: `/approvals/${req.id}`, kind: 'APPROVAL_PENDING' });
  }
  return next;
}

/** Final approval → trip workspace, advance record and gate, arrangement queue, notifications (SRS §11–12, §10.6–10.7). */
export async function postApproval(actor: Actor | { uid: string; name: string }, approved: TravelRequest, cfg: Config): Promise<TravelRequest> {
  const approvedAt = approved.approvedAt ?? nowIso();
  const outstanding = await outstandingLiquidationRequestIds(approved.requesterId, approved.id, cfg.policy, approvedAt);
  const advance = buildAdvanceRecord({ ...approved, approvedAt }, { policy: cfg.policy, rates: cfg.rates, outstanding, asOf: approvedAt }, null);
  const withAdvance: TravelRequest = { ...approved, advance, approvedAt };
  const vendor = approved.accommodation.preferredVendorId ? await getVendor(approved.accommodation.preferredVendorId) : null;
  const trip = tripForRequest(withAdvance, cfg.policy, vendor?.name);
  let status: TravelRequest['status'] = advance.requested ? 'ADVANCE_PROCESSING' : 'TRAVEL_ARRANGEMENTS';
  if (status === 'TRAVEL_ARRANGEMENTS' && trip.arrangements.length === 0) status = 'READY_FOR_TRAVEL';
  const next: TravelRequest = { ...withAdvance, status, updatedAt: nowIso() };
  await db.collection(COL.trips).doc(trip.id).set(trip);
  await audit(actor, { entityType: 'travelRequest', entityId: approved.id, action: 'FINAL_APPROVAL', newValue: { status, advance: { requested: advance.requested, amount: advance.amount, policyStatus: advance.policyStatus, blockedByRequestId: advance.blockedByRequestId } } });

  const notices: Promise<void>[] = [];
  if (advance.requested) {
    notices.push(
      userIdsWithRoles(['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT']).then((ids) =>
        notifyMany(ids, { title: 'Advance ready for processing', body: `${approved.id} · ${approved.requesterName} · ZMW ${advance.amount.toFixed(2)}${advance.policyStatus !== 'CLEAR' ? ` · ${advance.policyStatus.replace(/_/g, ' ').toLowerCase()}` : ''}`, link: `/finance/advances`, kind: 'ADVANCE_READY' }),
      ),
    );
    if (advance.policyStatus === 'BLOCKED') {
      notices.push(notify(approved.requesterId, { title: 'Advance blocked by an outstanding liquidation', body: `${approved.id} — liquidate ${advance.blockedByRequestId} before this advance can be paid.`, link: `/requests/${advance.blockedByRequestId}`, kind: 'ADVANCE_BLOCKED' }));
    }
  }
  if (trip.arrangements.length) {
    notices.push(userIdsWithRoles(['PROCUREMENT_OFFICER']).then((ids) => notifyMany(ids, { title: 'Approved trip awaiting booking', body: `${approved.id} · ${approved.activityTitle} · ${trip.arrangements.map((a) => a.type.toLowerCase()).join(', ')}`, link: `/trips/${approved.id}`, kind: 'BOOKING_REQUESTED' })));
  }
  if (approved.transport.mode === 'IHM_VEHICLE') {
    notices.push(userIdsWithRoles(['OFFICE_MANAGEMENT']).then((ids) => notifyMany(ids, { title: 'Approved trip needs an IHM vehicle', body: `${approved.id} · ${approved.activityTitle} — book a vehicle from the fleet calendar.`, link: `/fleet`, kind: 'VEHICLE_NEEDED' })));
  }
  await Promise.all(notices);
  return next;
}
