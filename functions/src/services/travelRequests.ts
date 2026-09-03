import type {
  ApprovalChainItem,
  Attachment,
  CostLine,
  Liquidation,
  Location,
  RequestStatus,
  TravelRequest,
  TravelRequestDetail,
  TravellerRef,
  Trip,
  UpdateTravelRequestBody,
  VehicleBooking,
  WizardStep,
  WorkflowStage,
} from '@tms/shared';
import {
  ACTIVE_TRIP_STATUSES,
  EDITABLE_STATUSES,
  MATERIAL_FIELDS,
  REVIEW_STATUSES,
  computeCosting,
  computeEligibility,
  effectiveRate,
  estimateRoadKm,
  nightsBetween,
  transportNeedsJustification,
  workflowForCategory,
  round2,
} from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso } from '../lib/firebase';
import { forbidden, notFound, unprocessable } from '../lib/errors';
import { nextRef } from '../lib/ids';
import { audit, notify, notifyMany } from '../lib/audit';
import { byDesc, getDoc, getMany, mustGet, runQuery } from '../lib/query';
import { loadConfig, type Config } from './config';
import { canViewAll, canViewRequest, isAdmin, isOwner, stageRolesHeld, supervisorScopeOk } from './access';
import { getProfiles, peopleMap, shortName, userIdsWithRoles } from './people';
import { getCostCentre, getDepartment, getProject } from './masterData';

export const AUTO_PER_DIEM_LINE = 'auto_per_diem';
export const AUTO_ACCOMMODATION_LINE = 'auto_accommodation';
export const AUTO_UPGRADE_LINE = 'auto_upgrade';

const POST_APPROVAL: RequestStatus[] = ['APPROVED', ...ACTIVE_TRIP_STATUSES, 'LIQUIDATED', 'CLOSED'];

// ---------- construction ----------

export function travellerIdsOf(req: Pick<TravelRequest, 'requesterId' | 'travellers'>): string[] {
  return [...new Set([req.requesterId, ...req.travellers.map((t) => t.userId).filter(Boolean)])] as string[];
}

export function newRequest(actor: Actor, id: string, seq: number, year: number, category?: TravelRequest['category']): TravelRequest {
  const p = actor.profile;
  const now = nowIso();
  const self: TravellerRef = { userId: p.id, name: p.displayName, initials: p.initials, departmentId: p.departmentId, costCentreId: p.costCentreIds?.[0], isLead: true };
  const req: TravelRequest = {
    id,
    seq,
    year,
    requesterId: p.id,
    requesterName: p.displayName,
    travellers: [self],
    isGroup: false,
    category: category ?? null,
    activityTitle: '',
    purpose: '',
    activityDescription: '',
    expectedOutcomes: '',
    workPlanRef: '',
    justification: '',
    departmentId: p.departmentId,
    unitId: p.unitId,
    projectId: p.projectIds?.[0],
    costCentreId: p.costCentreIds?.[0],
    supervisorId: p.supervisorId,
    dutyStationId: p.dutyStationId,
    itinerary: { stops: [], nights: 0, distanceKm: 0, distanceOverrideKm: null },
    transport: { mode: null },
    accommodation: { required: false, nights: 0, ratePerNight: 0, fullBoardProvided: false },
    allowances: { perDiemNights: 0, perDiemRate: 0, overheadFunded: false, perDiemWaived: false },
    costing: computeCosting([]),
    attachments: [],
    eligibility: null,
    status: 'DRAFT',
    workflow: null,
    currentStageIndex: -1,
    approvals: [],
    version: 1,
    advance: null,
    wizard: { completedSteps: [], lastStep: 'travel_type', savedAt: now },
    createdAt: now,
    updatedAt: now,
    travellerIds: [p.id],
    approverIds: [],
  };
  return req;
}

// ---------- patch + recompute (pure; unit-tested) ----------

export function applyPatch(req: TravelRequest, body: UpdateTravelRequestBody): TravelRequest {
  const next: TravelRequest = { ...req };
  const scalar = ['category', 'activityTitle', 'purpose', 'activityDescription', 'expectedOutcomes', 'workPlanRef', 'justification', 'departmentId', 'unitId', 'projectId', 'costCentreId', 'supervisorId', 'isGroup'] as const;
  for (const k of scalar) if (body[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = body[k];
  if (body.travellers) next.travellers = body.travellers.map((t) => ({ ...t }));
  if (body.itinerary) next.itinerary = { ...req.itinerary, ...body.itinerary, stops: body.itinerary.stops ?? req.itinerary.stops };
  if (body.transport) next.transport = { ...req.transport, ...body.transport };
  if (body.accommodation) next.accommodation = { ...req.accommodation, ...body.accommodation };
  if (body.allowances) next.allowances = { ...req.allowances, ...body.allowances };
  if (body.international !== undefined) next.international = body.international;
  if (body.personal !== undefined) next.personal = body.personal;
  if (body.costingLines) next.costing = { ...req.costing, lines: body.costingLines };
  if (body.attachments) next.attachments = body.attachments.map((a) => ({ ...a }));
  const wizard = { ...req.wizard, completedSteps: [...req.wizard.completedSteps] };
  if (body.completeStep && !wizard.completedSteps.includes(body.completeStep)) wizard.completedSteps.push(body.completeStep as WizardStep);
  if (body.wizardStep) wizard.lastStep = body.wizardStep;
  wizard.savedAt = nowIso();
  next.wizard = wizard;
  next.isGroup = body.isGroup ?? next.travellers.length > 1;
  next.travellerIds = travellerIdsOf(next);
  return next;
}

export function computeDistanceKm(req: TravelRequest, locationById: Map<string, Location>): number {
  const it = req.itinerary;
  if (typeof it.distanceOverrideKm === 'number' && it.distanceOverrideKm >= 0) return it.distanceOverrideKm;
  const base = (req.dutyStationId && locationById.get(req.dutyStationId)) || (it.originId && locationById.get(it.originId));
  if (!base) return it.distanceKm ?? 0;
  const targets = [it.destinationId, ...it.stops.map((s) => s.id)].filter(Boolean).map((id) => locationById.get(id!)).filter(Boolean) as Location[];
  if (!targets.length) return 0;
  return Math.max(...targets.map((t) => estimateRoadKm(base, t)));
}

/** Recompute derived fields: nights, distance, eligibility, per-diem allowance, auto cost lines, costing. */
export function recompute(input: TravelRequest, cfg: Pick<Config, 'policy' | 'rates' | 'locationById'>, opts: { explicitLines?: boolean; asOf?: string | Date } = {}): TravelRequest {
  const req: TravelRequest = { ...input, itinerary: { ...input.itinerary }, accommodation: { ...input.accommodation }, allowances: { ...input.allowances } };
  const it = req.itinerary;
  if (it.originId && !it.originName) it.originName = cfg.locationById.get(it.originId)?.name;
  if (it.destinationId && !it.destinationName) it.destinationName = cfg.locationById.get(it.destinationId)?.name;
  it.nights = it.departAt && it.returnAt ? nightsBetween(it.departAt, it.returnAt) : 0;
  it.distanceKm = computeDistanceKm(req, cfg.locationById);
  req.eligibility = computeEligibility({ distanceKm: it.distanceKm, departAt: it.departAt, returnAt: it.returnAt, category: req.category, asOf: opts.asOf ?? new Date(), policy: cfg.policy });

  const rateKey = req.category === 'INTERNATIONAL' ? 'PER_DIEM_INTERNATIONAL' : 'PER_DIEM_DOMESTIC';
  const rate = effectiveRate(cfg.rates, rateKey, it.departAt ?? new Date());
  req.allowances.perDiemRate = rate?.value ?? req.allowances.perDiemRate ?? 0;
  req.allowances.perDiemRateId = rate?.id;
  req.allowances.perDiemNights = req.eligibility.perDiemEligible && !req.allowances.perDiemWaived ? it.nights : 0;
  req.accommodation.nights = req.accommodation.required ? it.nights : 0;

  let lines: CostLine[] = req.costing.lines.map((l) => ({ ...l }));
  if (!opts.explicitLines) {
    lines = lines.filter((l) => l.id !== AUTO_PER_DIEM_LINE && l.id !== AUTO_ACCOMMODATION_LINE);
    if (req.allowances.perDiemNights > 0 && req.allowances.perDiemRate > 0) {
      lines.unshift({
        id: AUTO_PER_DIEM_LINE,
        category: 'PER_DIEM',
        label: `Per diem · ${req.allowances.perDiemNights} night${req.allowances.perDiemNights === 1 ? '' : 's'}`,
        quantity: req.allowances.perDiemNights,
        unitCost: req.allowances.perDiemRate,
        amount: round2(req.allowances.perDiemNights * req.allowances.perDiemRate),
        receiptRequired: false,
      });
    }
    if (req.accommodation.required && req.accommodation.nights > 0 && req.accommodation.ratePerNight > 0) {
      const idx = lines.findIndex((l) => l.id === AUTO_PER_DIEM_LINE);
      lines.splice(idx + 1, 0, {
        id: AUTO_ACCOMMODATION_LINE,
        category: 'ACCOMMODATION',
        label: 'Accommodation',
        quantity: req.accommodation.nights,
        unitCost: req.accommodation.ratePerNight,
        amount: round2(req.accommodation.nights * req.accommodation.ratePerNight),
        receiptRequired: true,
        paidDirectly: !!req.accommodation.preferredVendorId,
      });
    }
  }
  req.costing = computeCosting(lines);
  return req;
}

export function materialSnapshot(req: TravelRequest): string {
  const pickd: Record<string, unknown> = {};
  for (const k of MATERIAL_FIELDS) pickd[k] = k === 'costing' ? req.costing.lines : (req as unknown as Record<string, unknown>)[k];
  return JSON.stringify(pickd);
}

export function materialChanged(before: TravelRequest, after: TravelRequest): boolean {
  return materialSnapshot(before) !== materialSnapshot(after);
}

export function invalidateApprovals(req: TravelRequest): TravelRequest {
  return { ...req, version: req.version + 1, approvals: req.approvals.map((a) => (a.decision === 'APPROVED' ? { ...a, invalidated: true } : a)) };
}

// ---------- validation ----------

export function validateForSubmit(req: TravelRequest, cfg: Pick<Config, 'policy'>): string[] {
  const p: string[] = [];
  if (!req.category) p.push('Travel category is required');
  if (!req.activityTitle.trim()) p.push('Activity title is required');
  if (!req.purpose.trim()) p.push('Business purpose is required');
  if (!req.itinerary.originId && !req.itinerary.originName) p.push('Origin is required');
  if (!req.itinerary.destinationId && !req.itinerary.destinationName) p.push('Destination is required');
  if (!req.itinerary.departAt || !req.itinerary.returnAt) p.push('Departure and return date/time are required');
  else if (req.itinerary.returnAt < req.itinerary.departAt) p.push('Return must be after departure');
  if (!req.travellers.length) p.push('At least one traveller is required');
  if (!req.costing.lines.length) p.push('At least one cost line is required');
  if (!req.transport.mode) p.push('Transport mode is required');
  else if (transportNeedsJustification(req.transport.mode) && !req.transport.justification?.trim()) p.push('Justification is required for transport that is not first in the SOP order of precedence');
  if (req.category === 'INTERNATIONAL') {
    if (!req.international) p.push('International travel details are required');
    else if (cfg.policy.toggles.economyOnlyInternational && req.international.cabinClass !== 'ECONOMY' && !(req.international.upgradeDifference && req.international.upgradeDifference > 0)) {
      p.push('Only Economy is organisation-funded — record the upgrade difference as an employee contribution');
    }
  }
  return p;
}

/** Ensure a personal cabin upgrade is carried as an employee contribution on a cost line (SRS §13.1). */
export function applyUpgradeContribution(req: TravelRequest): TravelRequest {
  const diff = req.international?.upgradeDifference ?? 0;
  if (req.category !== 'INTERNATIONAL' || diff <= 0 || req.international?.cabinClass === 'ECONOMY') return req;
  const lines = req.costing.lines.map((l) => ({ ...l }));
  if (lines.some((l) => (l.employeeContribution ?? 0) >= diff)) return req;
  const flights = lines.find((l) => l.category === 'FLIGHTS' && l.id !== AUTO_UPGRADE_LINE);
  if (flights) flights.employeeContribution = diff;
  else {
    const existing = lines.find((l) => l.id === AUTO_UPGRADE_LINE);
    if (existing) {
      existing.unitCost = diff;
      existing.employeeContribution = diff;
    } else lines.push({ id: AUTO_UPGRADE_LINE, category: 'FLIGHTS', label: 'Personal cabin upgrade (employee-paid)', quantity: 1, unitCost: diff, amount: diff, employeeContribution: diff, receiptRequired: true });
  }
  return { ...req, costing: computeCosting(lines) };
}

// ---------- approval chain ----------

export function buildApprovalChain(req: TravelRequest, fallbackNames: Record<string, string | undefined> = {}): ApprovalChainItem[] {
  const items: ApprovalChainItem[] = [];
  if (req.submittedAt) items.push({ key: 'submitted', label: 'Submitted', state: 'done', actorName: req.requesterName, at: req.submittedAt });
  const stages = req.workflow?.stages ?? [];
  const pastApproval = POST_APPROVAL.includes(req.status);
  stages.forEach((s, i) => {
    const recs = req.approvals.filter((a) => a.stageKey === s.key);
    const latest = recs[recs.length - 1];
    let state: ApprovalChainItem['state'];
    if (pastApproval) state = 'done';
    else if (latest?.decision === 'REJECTED' && req.status === 'REJECTED') state = 'rejected';
    else if (i < req.currentStageIndex) state = latest?.invalidated || latest?.decision !== 'APPROVED' ? 'invalidated' : 'done';
    else if (i === req.currentStageIndex) state = latest?.decision === 'APPROVED' && !latest.invalidated ? 'done' : 'current';
    else state = 'upcoming';
    items.push({
      key: s.key,
      label: s.label,
      state,
      actorName: latest?.actorName ?? fallbackNames[s.key],
      at: latest?.at,
      comment: latest?.comment,
    });
  });
  return items;
}

async function fallbackNamesFor(req: TravelRequest): Promise<Record<string, string | undefined>> {
  const [cc, dept] = await Promise.all([getCostCentre(req.costCentreId), getDepartment(req.departmentId)]);
  const ids = [req.supervisorId, cc?.ownerId, dept?.hodId];
  const people = await getProfiles(ids);
  const nm = (id?: string) => (id && people.get(id) ? shortName(people.get(id)!.displayName) : undefined);
  return { supervisor: nm(req.supervisorId), hod_cc: nm(cc?.ownerId) ?? nm(dept?.hodId), cc_head: nm(cc?.ownerId) ?? nm(dept?.hodId) };
}

// ---------- reads ----------

export async function getRequest(id: string): Promise<TravelRequest> {
  return mustGet<TravelRequest>(COL.travelRequests, id, 'Travel request');
}

export async function getRequestForActor(actor: Actor, id: string): Promise<TravelRequest> {
  const req = await getRequest(id);
  if (!canViewRequest(actor, req)) throw forbidden('You cannot view this travel request');
  return req;
}

export async function buildDetail(actor: Actor, req: TravelRequest, extra: { includeAudit?: boolean } = {}): Promise<TravelRequestDetail> {
  const [trip, liquidation, booking, project, costCentre, fallback] = await Promise.all([
    getDoc<Trip>(COL.trips, req.id),
    req.status === 'DRAFT' ? Promise.resolve(null) : runQuery<Liquidation>(db.collection(COL.liquidations).where('requestId', '==', req.id), 1).then((l) => l[0] ?? null),
    req.transport.vehicleBookingId ? getDoc<VehicleBooking>(COL.vehicleBookings, req.transport.vehicleBookingId) : runQuery<VehicleBooking>(db.collection(COL.vehicleBookings).where('requestId', '==', req.id), 1).then((b) => b[0] ?? null),
    getProject(req.projectId),
    getCostCentre(req.costCentreId),
    fallbackNamesFor(req),
  ]);
  const peopleIds = [req.requesterId, req.supervisorId, ...req.travellers.map((t) => t.userId), ...req.approvals.map((a) => a.actorId), ...(booking ? [booking.driverId] : [])];
  const people = await peopleMap(peopleIds);
  const owner = req.requesterId === actor.uid || isAdmin(actor);
  const detail: TravelRequestDetail = {
    request: req,
    trip,
    liquidation,
    vehicleBooking: booking,
    people,
    project: project ?? undefined,
    costCentre: costCentre ?? undefined,
    canEdit: owner && EDITABLE_STATUSES.includes(req.status),
    canSubmit: owner && EDITABLE_STATUSES.includes(req.status),
    canCancel: (req.requesterId === actor.uid && ['DRAFT', ...REVIEW_STATUSES, 'RETURNED_FOR_CORRECTION'].includes(req.status)) || (isAdmin(actor) && !['CLOSED', 'CANCELLED', 'REJECTED'].includes(req.status)),
    approvalChain: buildApprovalChain(req, fallback),
  };
  if (extra.includeAudit) detail.audit = await listAudit(req.id);
  return detail;
}

export async function listAudit(entityId: string) {
  return runQuery<import('@tms/shared').AuditEvent>(db.collection(COL.auditEvents).where('entityId', '==', entityId).orderBy('at', 'desc'), 100);
}

export async function listRequests(actor: Actor, scope: 'mine' | 'team' | 'all', statuses: string[] | undefined, limit: number): Promise<TravelRequest[]> {
  const col = db.collection(COL.travelRequests);
  const filt = (list: TravelRequest[]) => (statuses ? list.filter((r) => statuses.includes(r.status)) : list);
  if (scope === 'all' && canViewAll(actor)) {
    let q = statuses && statuses.length <= 30 ? col.where('status', 'in', statuses) : col;
    q = q.orderBy('updatedAt', 'desc');
    return filt(await runQuery<TravelRequest>(q, limit));
  }
  if (scope === 'mine' || (scope === 'all' && !canViewAll(actor) && !stageRolesHeld(actor.roles, ['UNIT_SUPERVISOR', 'PROJECT_MANAGER', 'HEAD_OF_DEPARTMENT', 'COST_CENTRE_OWNER']).length)) {
    return filt(await runQuery<TravelRequest>(col.where('travellerIds', 'array-contains', actor.uid).orderBy('updatedAt', 'desc'), limit));
  }
  // team: my unit + requests I supervise + anything at a stage I can act on
  const [byUnit, bySup, inReview] = await Promise.all([
    actor.profile.unitId ? runQuery<TravelRequest>(col.where('unitId', '==', actor.profile.unitId).orderBy('updatedAt', 'desc'), limit) : Promise.resolve([]),
    runQuery<TravelRequest>(col.where('supervisorId', '==', actor.uid).orderBy('updatedAt', 'desc'), limit),
    runQuery<TravelRequest>(col.where('status', 'in', REVIEW_STATUSES).orderBy('updatedAt', 'desc'), 200),
  ]);
  const actable = inReview.filter((r) => {
    const stage = r.workflow?.stages[r.currentStageIndex];
    return stage && stageRolesHeld(actor.roles, stage.roles).length > 0 && (stage.key !== 'supervisor' || supervisorScopeOk(actor, r));
  });
  const merged = new Map<string, TravelRequest>();
  for (const r of [...byUnit, ...bySup, ...actable]) merged.set(r.id, r);
  return filt([...merged.values()].sort(byDesc((r) => r.updatedAt))).slice(0, limit);
}

// ---------- mutations ----------

export async function createRequest(actor: Actor, category?: TravelRequest['category']): Promise<TravelRequest> {
  const { id, seq, year } = await nextRef('TRV');
  const cfg = await loadConfig();
  const req = recompute(newRequest(actor, id, seq, year, category), cfg);
  await db.collection(COL.travelRequests).doc(id).set(req);
  await audit(actor, { entityType: 'travelRequest', entityId: id, action: 'CREATED', newValue: { status: 'DRAFT' } });
  return req;
}

export async function patchRequest(actor: Actor, id: string, body: UpdateTravelRequestBody): Promise<TravelRequest> {
  const before = await getRequest(id);
  if (before.requesterId !== actor.uid && !isAdmin(actor)) throw forbidden('Only the requester can edit this request');
  if (!EDITABLE_STATUSES.includes(before.status)) throw unprocessable('NOT_EDITABLE', `Request cannot be edited while ${before.status}`);
  const cfg = await loadConfig();
  let next = recompute(applyPatch(before, body), cfg, { explicitLines: !!body.costingLines });
  if (body.attachments) next.attachments = await hydrateAttachments(actor, body.attachments);
  if (before.status !== 'DRAFT' && materialChanged(before, next)) next = invalidateApprovals(next);
  next.updatedAt = nowIso();
  await db.collection(COL.travelRequests).doc(id).set(next);
  await audit(actor, { entityType: 'travelRequest', entityId: id, action: 'UPDATED', newValue: { keys: Object.keys(body), version: next.version } });
  return next;
}

/**
 * The wizard PATCHes the full attachment list after uploading via POST /files. Re-hydrate each entry from the
 * `attachments` collection so clients cannot spoof size/path/uploader; only the `kind` label is taken from the client.
 */
async function hydrateAttachments(actor: Actor, list: Attachment[]): Promise<Attachment[]> {
  const stored = await getMany<Attachment>(COL.attachments, list.map((a) => a.id));
  const out: Attachment[] = [];
  for (const a of list) {
    const doc = stored.get(a.id);
    if (!doc) throw unprocessable('ATTACHMENT_NOT_FOUND', `Attachment ${a.id} does not exist — upload it via POST /files first`);
    if (doc.uploadedBy !== actor.uid && !isAdmin(actor)) throw forbidden(`Attachment ${a.id} was uploaded by someone else`);
    out.push({ ...doc, kind: a.kind ?? doc.kind });
  }
  return out;
}

/** Who should be notified for a stage: named supervisor / cost-centre owner first, else any holder of the stage roles. */
export async function approversForStage(req: TravelRequest, stage: WorkflowStage): Promise<string[]> {
  if (stage.key === 'supervisor' && req.supervisorId) return [req.supervisorId];
  if (stage.key === 'hod_cc' || stage.key === 'cc_head') {
    const [cc, dept] = await Promise.all([getCostCentre(req.costCentreId), getDepartment(req.departmentId)]);
    const named = [cc?.ownerId, dept?.hodId].filter(Boolean) as string[];
    if (named.length) return [...new Set(named)];
  }
  return userIdsWithRoles(stage.roles);
}

export async function submitRequest(actor: Actor, id: string): Promise<TravelRequest> {
  const before = await getRequest(id);
  if (before.requesterId !== actor.uid && !isAdmin(actor)) throw forbidden('Only the requester can submit this request');
  if (!EDITABLE_STATUSES.includes(before.status)) throw unprocessable('NOT_EDITABLE', `Request cannot be submitted while ${before.status}`);
  const cfg = await loadConfig();
  let req = recompute(before, cfg, { explicitLines: true });
  req = applyUpgradeContribution(req);
  const problems = validateForSubmit(req, cfg);
  if (problems.length) throw unprocessable('VALIDATION', 'Request is not complete', { problems });

  const resubmission = before.status !== 'DRAFT' && !!before.workflow;
  if (!resubmission) {
    const wf = workflowForCategory(cfg.workflows, req.category!);
    if (!wf) throw unprocessable('NO_WORKFLOW', `No active workflow for ${req.category}`);
    req.workflow = { id: wf.id, version: wf.version, stages: wf.stages };
  }
  const stageIndex = before.status === 'CLARIFICATION_REQUESTED' ? (before.resumeStageIndex ?? 0) : 0;
  req.currentStageIndex = stageIndex;
  req.status = req.workflow!.stages[stageIndex]!.status;
  req.approvals = req.approvals.filter((a) => !a.invalidated);
  req.resumeStageIndex = null;
  req.submittedAt = req.submittedAt ?? nowIso();
  if (before.status === 'DRAFT' || before.status === 'RETURNED_FOR_CORRECTION') req.submittedAt = nowIso();
  req.updatedAt = nowIso();
  if (!req.wizard.completedSteps.includes('review')) req.wizard.completedSteps.push('review');
  await db.collection(COL.travelRequests).doc(id).set(req);

  const stage = req.workflow!.stages[stageIndex]!;
  const approvers = await approversForStage(req, stage);
  await audit(actor, { entityType: 'travelRequest', entityId: id, action: resubmission ? 'RESUBMITTED' : 'SUBMITTED', stage: stage.key, oldValue: { status: before.status }, newValue: { status: req.status, version: req.version } });
  await notifyMany(approvers, {
    title: 'Request awaiting your approval',
    body: `${req.requesterName} · ${req.id} · ${req.activityTitle}`,
    link: `/approvals/${req.id}`,
    kind: 'APPROVAL_PENDING',
  });
  if (req.category === 'INTERNATIONAL' && req.eligibility?.internationalNoticeOk === false) {
    await notifyMany([req.requesterId, ...approvers], {
      title: 'International request submitted late',
      body: `${req.id} gives ${req.eligibility.internationalNoticeDays} days' notice; ${cfg.policy.internationalNoticeDays} required.`,
      link: `/requests/${req.id}`,
      kind: 'INTERNATIONAL_LATE',
    });
  }
  return req;
}

export async function cancelRequest(actor: Actor, id: string, reason?: string): Promise<TravelRequest> {
  const req = await getRequest(id);
  const owner = req.requesterId === actor.uid;
  const beforeApproval = ['DRAFT', ...REVIEW_STATUSES, 'RETURNED_FOR_CORRECTION'].includes(req.status);
  if (!(isAdmin(actor) || (owner && beforeApproval))) throw forbidden('Request can only be cancelled by the requester before approval, or by an administrator');
  if (['CLOSED', 'CANCELLED', 'REJECTED'].includes(req.status)) throw unprocessable('INVALID_STATE', `Request is already ${req.status}`);
  const next: TravelRequest = { ...req, status: 'CANCELLED', updatedAt: nowIso(), closedAt: nowIso() };
  await db.collection(COL.travelRequests).doc(id).set(next);
  await audit(actor, { entityType: 'travelRequest', entityId: id, action: 'CANCELLED', oldValue: { status: req.status }, newValue: { status: 'CANCELLED', reason } });
  if (!owner) await notify(req.requesterId, { title: 'Travel request cancelled', body: `${req.id} · ${req.activityTitle}${reason ? ` — ${reason}` : ''}`, link: `/requests/${req.id}`, kind: 'REQUEST_CANCELLED' });
  return next;
}

export function assertOwnerOrAdmin(actor: Actor, req: TravelRequest): void {
  if (!isOwner(actor, req) && !isAdmin(actor)) throw forbidden();
}

export { notFound };
