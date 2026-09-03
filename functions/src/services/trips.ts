import type { AddDocumentBody, Arrangement, Attachment, PolicyConfig, TravelRequest, Trip, TripDetailResponse, UpsertArrangementBody } from '@tms/shared';
import { hasAnyRole, liquidationDueDate, ACTIVE_TRIP_STATUSES } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso } from '../lib/firebase';
import { forbidden, notFound, unprocessable } from '../lib/errors';
import { shortId } from '../lib/ids';
import { audit, notify } from '../lib/audit';
import { byDesc, getDoc, getMany, mustGet, queryIn, runQuery } from '../lib/query';
import { ARRANGEMENT_ROLES, canViewAll, canViewRequest, isAdmin, isOwner, VIEW_ALL_ROLES } from './access';
import { buildDetail, getRequest } from './travelRequests';
import { getVendor } from './masterData';

export const TRIP_STATUSES = [...ACTIVE_TRIP_STATUSES, 'LIQUIDATED', 'CLOSED'] as const;

/** Seed the trip workspace from an approved request (SRS §12.1, §18.1). */
export function tripForRequest(req: TravelRequest, policy: PolicyConfig, vendorName?: string): Trip {
  const now = nowIso();
  const arrangements: Arrangement[] = [];
  const dest = req.itinerary.destinationName ?? 'destination';
  if (req.transport.mode === 'AIR') {
    arrangements.push({ id: shortId(), type: 'FLIGHT', title: `Flight · ${req.itinerary.originName ?? 'Origin'} → ${dest}`, detail: 'With Procurement · booking requested', status: 'REQUESTED' });
  }
  if (req.transport.mode === 'RENTAL') {
    arrangements.push({ id: shortId(), type: 'RENTAL', title: `Rental vehicle · ${dest}`, detail: 'With Procurement · approved-vendor quotation requested', status: 'REQUESTED' });
  }
  if (req.accommodation.required) {
    arrangements.push({
      id: shortId(),
      type: 'HOTEL',
      title: `${vendorName ?? 'Accommodation'} · ${req.accommodation.nights} night${req.accommodation.nights === 1 ? '' : 's'}`,
      detail: vendorName ? `With Procurement · preferred vendor` : 'With Procurement · hotel to be confirmed',
      vendorId: req.accommodation.preferredVendorId,
      vendorName,
      status: 'REQUESTED',
    });
  }
  return {
    id: req.id,
    requestId: req.id,
    title: req.activityTitle,
    travellerNames: req.travellers.map((t) => t.name),
    arrangements,
    documents: [],
    financials: {
      approvedBudget: req.costing.total,
      advancePercentage: req.advance?.percentage ?? 75,
      advanceAmount: req.advance?.requested ? req.advance.amount : 0,
      employeeContribution: req.costing.employeeContribution,
      expensesLogged: 0,
      liquidationDueDate: req.itinerary.returnAt ? liquidationDueDate(req.itinerary.returnAt, policy) : null,
    },
    liquidationId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getTrip(id: string): Promise<Trip | null> {
  return getDoc<Trip>(COL.trips, id);
}

export async function listTrips(actor: Actor, scope: 'mine' | 'team' | 'all', limit: number): Promise<(TravelRequest & { trip: Trip | null })[]> {
  const col = db.collection(COL.travelRequests);
  let reqs: TravelRequest[];
  if (scope !== 'mine' && canViewAll(actor)) {
    reqs = await queryIn<TravelRequest>(COL.travelRequests, 'status', TRIP_STATUSES, limit, { field: 'updatedAt', dir: 'desc' });
  } else {
    reqs = (await runQuery<TravelRequest>(col.where('travellerIds', 'array-contains', actor.uid).orderBy('updatedAt', 'desc'), 200)).filter((r) => (TRIP_STATUSES as readonly string[]).includes(r.status));
    if (scope === 'team' && actor.profile.unitId) {
      const unit = (await runQuery<TravelRequest>(col.where('unitId', '==', actor.profile.unitId).orderBy('updatedAt', 'desc'), 200)).filter((r) => (TRIP_STATUSES as readonly string[]).includes(r.status));
      const m = new Map(reqs.map((r) => [r.id, r]));
      for (const r of unit) m.set(r.id, r);
      reqs = [...m.values()];
    }
  }
  reqs = reqs.sort(byDesc((r) => r.updatedAt)).slice(0, limit);
  const trips = await getMany<Trip>(COL.trips, reqs.map((r) => r.id));
  return reqs.map((r) => ({ ...r, trip: trips.get(r.id) ?? null }));
}

export async function tripDetail(actor: Actor, id: string): Promise<TripDetailResponse> {
  const req = await getRequest(id);
  if (!canViewRequest(actor, req)) throw forbidden('You cannot view this trip');
  const trip = await getTrip(id);
  if (!trip) throw notFound('Trip');
  const detail = await buildDetail(actor, req);
  return { ...detail, trip };
}

function assertArrangementRole(actor: Actor): void {
  if (!hasAnyRole(actor.roles, ARRANGEMENT_ROLES)) throw forbidden('Only Procurement or Office Management can manage arrangements');
}

/** Once every arrangement is confirmed and the advance is not blocked/pending, the trip is ready (SRS §12). */
export async function maybeMarkReady(actor: Actor | { uid: string; name: string }, req: TravelRequest, trip: Trip): Promise<TravelRequest> {
  if (req.status !== 'TRAVEL_ARRANGEMENTS') return req;
  const open = trip.arrangements.filter((a) => a.status !== 'CONFIRMED' && a.status !== 'CANCELLED');
  if (open.length) return req;
  const adv = req.advance;
  if (adv?.requested && (adv.policyStatus === 'BLOCKED' || !adv.milestones.RELEASED)) return req;
  const next: TravelRequest = { ...req, status: 'READY_FOR_TRAVEL', updatedAt: nowIso() };
  await db.collection(COL.travelRequests).doc(req.id).set(next);
  await audit(actor, { entityType: 'travelRequest', entityId: req.id, action: 'STATUS_CHANGED', oldValue: { status: req.status }, newValue: { status: 'READY_FOR_TRAVEL' } });
  await notify(req.requesterId, { title: 'Booking confirmed', body: `${req.id} · ${req.activityTitle} — all arrangements confirmed. You are ready to travel.`, link: `/trips/${req.id}`, kind: 'BOOKING_CONFIRMED' });
  return next;
}

export async function upsertArrangement(actor: Actor, id: string, body: UpsertArrangementBody, aid?: string): Promise<Trip> {
  assertArrangementRole(actor);
  const [req, trip] = await Promise.all([getRequest(id), getTrip(id)]);
  if (!trip) throw notFound('Trip');
  const vendor = body.vendorId ? await getVendor(body.vendorId) : null;
  const now = nowIso();
  let arrangement: Arrangement;
  const arrangements = [...trip.arrangements];
  if (aid) {
    const idx = arrangements.findIndex((a) => a.id === aid);
    if (idx < 0) throw notFound('Arrangement');
    arrangement = { ...arrangements[idx]!, ...body, id: aid, vendorName: body.vendorName ?? vendor?.name ?? arrangements[idx]!.vendorName };
    arrangements[idx] = arrangement;
  } else {
    arrangement = { id: shortId(), status: 'REQUESTED', detail: '', ...body, vendorName: body.vendorName ?? vendor?.name };
    arrangements.push(arrangement);
  }
  if (arrangement.status === 'CONFIRMED') {
    arrangement.officerId = arrangement.officerId ?? actor.uid;
    arrangement.bookedAt = arrangement.bookedAt ?? now;
  }
  const next: Trip = { ...trip, arrangements, updatedAt: now };
  await db.collection(COL.trips).doc(id).set(next);
  await audit(actor, { entityType: 'trip', entityId: id, action: aid ? 'ARRANGEMENT_UPDATED' : 'ARRANGEMENT_ADDED', newValue: arrangement });
  if (arrangement.status === 'CONFIRMED') {
    await notify(req.requesterId, { title: 'Booking confirmed', body: `${req.id} · ${arrangement.title}`, link: `/trips/${req.id}`, kind: 'BOOKING_CONFIRMED' });
  }
  await maybeMarkReady(actor, req, next);
  return next;
}

export async function addDocument(actor: Actor, id: string, body: AddDocumentBody): Promise<Trip> {
  const [req, trip, att] = await Promise.all([getRequest(id), getTrip(id), mustGet<Attachment>(COL.attachments, body.attachmentId, 'Attachment')]);
  if (!trip) throw notFound('Trip');
  if (!(isOwner(actor, req) || hasAnyRole(actor.roles, [...VIEW_ALL_ROLES]))) throw forbidden();
  if (att.uploadedBy !== actor.uid && !hasAnyRole(actor.roles, VIEW_ALL_ROLES)) throw forbidden('You can only link files you uploaded');
  const doc: Attachment = { ...att, kind: body.kind ?? att.kind };
  const next: Trip = { ...trip, documents: [...trip.documents.filter((d) => d.id !== doc.id), doc], updatedAt: nowIso() };
  await db.collection(COL.trips).doc(id).set(next);
  await audit(actor, { entityType: 'trip', entityId: id, action: 'DOCUMENT_ADDED', newValue: { attachmentId: doc.id, kind: doc.kind, name: doc.name } });
  return next;
}

export async function removeDocument(actor: Actor, id: string, docId: string): Promise<Trip> {
  const [req, trip] = await Promise.all([getRequest(id), getTrip(id)]);
  if (!trip) throw notFound('Trip');
  const doc = trip.documents.find((d) => d.id === docId);
  if (!doc) throw notFound('Document');
  if (!(doc.uploadedBy === actor.uid || isOwner(actor, req) || isAdmin(actor) || hasAnyRole(actor.roles, ['PROCUREMENT_OFFICER', 'FINANCE_ACCOUNTANT']))) throw forbidden();
  const next: Trip = { ...trip, documents: trip.documents.filter((d) => d.id !== docId), updatedAt: nowIso() };
  await db.collection(COL.trips).doc(id).set(next);
  await audit(actor, { entityType: 'trip', entityId: id, action: 'DOCUMENT_REMOVED', oldValue: { attachmentId: docId, name: doc.name } });
  return next;
}

export async function startTrip(actor: Actor | { uid: string; name: string }, req: TravelRequest, byJob = false): Promise<TravelRequest> {
  if (!byJob && !(isOwner(actor as Actor, req) || isAdmin(actor as Actor))) throw forbidden();
  if (!['READY_FOR_TRAVEL', 'TRAVEL_ARRANGEMENTS', 'ADVANCE_PROCESSING', 'APPROVED'].includes(req.status)) throw unprocessable('INVALID_STATE', `Trip cannot start while ${req.status}`);
  const next: TravelRequest = { ...req, status: 'IN_PROGRESS', updatedAt: nowIso() };
  await db.collection(COL.travelRequests).doc(req.id).set(next);
  await audit(actor, { entityType: 'travelRequest', entityId: req.id, action: 'TRIP_STARTED', oldValue: { status: req.status }, newValue: { status: 'IN_PROGRESS' } });
  return next;
}
