import type { DashboardResponse, ExternalPaymentRequest, Liquidation, MileageClaim, TravelRequest, Trip, VehicleBooking } from '@tms/shared';
import { EXTERNAL_STATUS_LABELS, ACTIVE_TRIP_STATUSES, STATUS_META, fmtLongDay, isoDate, liquidationDaysRemaining, yearOf } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db } from '../lib/firebase';
import { byAsc, byDesc, getMany, runQuery } from '../lib/query';
import { getLocation, getUnit } from './masterData';
import { approvalQueue } from './approvals';
import { hasAnyRole, APPROVER_ROLES, FLEET_ROLES } from '@tms/shared';

const COUNTED_FOR_YEAR: TravelRequest['status'][] = ['IN_PROGRESS', 'AWAITING_LIQUIDATION', 'LIQUIDATION_REVIEW', 'LIQUIDATED', 'CLOSED'];

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export async function dashboard(actor: Actor): Promise<DashboardResponse> {
  const p = actor.profile;
  const now = new Date();
  const [dutyStation, unit, mine, liqs, claims, bookings, ext] = await Promise.all([
    getLocation(p.dutyStationId),
    getUnit(p.unitId),
    runQuery<TravelRequest>(db.collection(COL.travelRequests).where('travellerIds', 'array-contains', actor.uid).orderBy('updatedAt', 'desc'), 200),
    runQuery<Liquidation>(db.collection(COL.liquidations).where('travellerId', '==', actor.uid), 100),
    runQuery<MileageClaim>(db.collection(COL.mileageClaims).where('claimantId', '==', actor.uid).orderBy('updatedAt', 'desc'), 20),
    runQuery<VehicleBooking>(db.collection(COL.vehicleBookings).where('requesterId', '==', actor.uid).orderBy('pickupAt', 'desc'), 20),
    runQuery<ExternalPaymentRequest>(db.collection(COL.externalPayments).where('requesterId', '==', actor.uid), 20),
  ]);
  const today = isoDate(now);

  const openLiqs = liqs.filter((l) => l.status === 'OPEN' || l.status === 'RETURNED');
  const reqById = new Map(mine.map((r) => [r.id, r]));
  const blockers = openLiqs
    .filter((l) => l.dueDate < today)
    .map((l) => ({ type: 'OVERDUE_LIQUIDATION' as const, requestId: l.requestId, liquidationId: l.id, title: reqById.get(l.requestId)?.activityTitle ?? l.tripTitle, dueDate: l.dueDate, daysOverdue: -liquidationDaysRemaining(l.dueDate, now) }))
    .sort(byDesc((b) => b.daysOverdue));

  const active = mine.filter((r) => ACTIVE_TRIP_STATUSES.includes(r.status) && r.itinerary.departAt).sort(byAsc((r) => r.itinerary.departAt));
  // Nearest departure that is not already waiting for liquidation, else the most recent one.
  const currentReq = active.find((r) => !['AWAITING_LIQUIDATION', 'LIQUIDATION_REVIEW'].includes(r.status)) ?? active[0] ?? null;
  const trips = await getMany<Trip>(COL.trips, currentReq ? [currentReq.id] : []);
  const currentTrip = currentReq ? { ...currentReq, trip: trips.get(currentReq.id) ?? null } : null;

  const year = yearOf(now);
  const yearReqs = mine.filter((r) => r.requesterId === actor.uid && r.year === year && COUNTED_FOR_YEAR.includes(r.status));
  const yearStats = {
    trips: yearReqs.length,
    nights: yearReqs.reduce((s, r) => s + (r.itinerary.nights || 0), 0),
    spend: Math.round(yearReqs.reduce((s, r) => s + (r.costing.total || 0), 0) * 100) / 100,
  };

  const myRequests = [
    ...mine.filter((r) => r.requesterId === actor.uid).map((r) => ({ id: r.id, ref: r.id, title: r.activityTitle || 'Untitled request', status: r.status, statusLabel: STATUS_META[r.status].label, kind: 'TRV' as const, href: `/requests/${r.id}`, updatedAt: r.updatedAt })),
    ...claims.map((c) => ({ id: c.id, ref: c.id, title: c.purpose, status: c.status as unknown as TravelRequest['status'], statusLabel: titleCase(c.status), kind: 'MIL' as const, href: `/claims/${c.id}`, updatedAt: c.updatedAt })),
    ...bookings.map((b) => ({ id: b.id, ref: b.id, title: `${b.mode === 'SELF_DRIVE' ? 'Self-drive' : 'Vehicle'} · ${b.destination}`, status: b.status as unknown as TravelRequest['status'], statusLabel: titleCase(b.status), kind: 'VEH' as const, href: `/fleet/bookings/${b.id}`, updatedAt: b.updatedAt })),
    ...ext.map((e) => ({ id: e.id, ref: e.id, title: e.activityTitle, status: e.status as unknown as TravelRequest['status'], statusLabel: EXTERNAL_STATUS_LABELS[e.status] ?? titleCase(e.status), kind: 'EXT' as const, href: `/finance/external-payments/${e.id}`, updatedAt: e.updatedAt })),
  ]
    .sort(byDesc((x) => x.updatedAt))
    .slice(0, 8)
    .map(({ updatedAt: _u, ...rest }) => rest);

  const upcomingTrips = active.filter((r) => ['APPROVED', 'ADVANCE_PROCESSING', 'TRAVEL_ARRANGEMENTS', 'READY_FOR_TRAVEL'].includes(r.status) && r.itinerary.departAt! >= now.toISOString()).slice(0, 5);

  const approvalsPending = hasAnyRole(actor.roles, [...APPROVER_ROLES, ...FLEET_ROLES, 'SYSTEM_ADMIN']) ? (await approvalQueue(actor)).counts.pending : 0;

  const liquidationsDue = openLiqs
    .map((l) => ({ id: l.id, requestId: l.requestId, title: reqById.get(l.requestId)?.activityTitle ?? l.tripTitle, dueDate: l.dueDate, daysRemaining: liquidationDaysRemaining(l.dueDate, now) }))
    .sort(byAsc((l) => l.dueDate));

  return {
    greetingName: p.displayName.split(' ')[0]!,
    today: isoDate(now),
    dutyStationName: dutyStation?.town ? `${dutyStation.town}${dutyStation.isDutyStation ? ' HQ' : ''}` : (dutyStation?.name ?? ''),
    unitName: unit?.name ?? '',
    blockers,
    currentTrip,
    yearStats,
    myRequests,
    upcomingTrips,
    approvalsPending,
    liquidationsDue,
    vehicleBookings: bookings.filter((b) => !['CLOSED', 'CANCELLED', 'REJECTED'].includes(b.status)).slice(0, 5),
  };
}
