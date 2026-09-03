import type { AssignVehicleBody, Attachment, BookingConflictError, CreateVehicleBookingBody, FleetCalendarResponse, SelfDriveStepBody, Vehicle, VehicleBooking } from '@tms/shared';
import { hasAnyRole, FLEET_ROLES } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso } from '../lib/firebase';
import { conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import { nextRef } from '../lib/ids';
import { audit, notify, notifyMany } from '../lib/audit';
import { byAsc, byDesc, getAllDocs, mustGet, runQuery } from '../lib/query';
import { canViewAll, isAdmin, isFleetAdmin } from './access';
import { getProfile, userIdsWithRoles } from './people';
import { getVehicle } from './masterData';

export const BLOCKING_BOOKING_STATUSES: VehicleBooking['status'][] = ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS'];

/** Pure overlap check (unit-tested): [pickupAt, returnAt) intervals on the same vehicle. */
export function findConflicts(bookings: readonly VehicleBooking[], vehicleId: string, pickupAt: string, returnAt: string, excludeId?: string): BookingConflictError['conflicts'] {
  return bookings
    .filter((b) => b.vehicleId === vehicleId && b.id !== excludeId && BLOCKING_BOOKING_STATUSES.includes(b.status) && b.pickupAt < returnAt && b.returnAt > pickupAt)
    .map((b) => ({ id: b.id, pickupAt: b.pickupAt, returnAt: b.returnAt, requesterName: b.requesterName, destination: b.destination }));
}

export const vehicleLabel = (v: Vehicle) => `${v.make} ${v.model} · ${v.registration}`;

async function assertVehicleFree(vehicleId: string, pickupAt: string, returnAt: string, excludeId?: string): Promise<Vehicle> {
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) throw notFound('Vehicle');
  if (vehicle.status !== 'AVAILABLE') throw unprocessable('VEHICLE_UNAVAILABLE', `${vehicleLabel(vehicle)} is ${vehicle.status === 'IN_SERVICE' ? `in service${vehicle.serviceNote ? ` — ${vehicle.serviceNote}` : ''}${vehicle.serviceDueBack ? `, due back ${vehicle.serviceDueBack}` : ''}` : 'retired'}`);
  const candidates = await runQuery<VehicleBooking>(db.collection(COL.vehicleBookings).where('vehicleId', '==', vehicleId).where('status', 'in', BLOCKING_BOOKING_STATUSES), 200);
  const conflicts = findConflicts(candidates, vehicleId, pickupAt, returnAt, excludeId);
  if (conflicts.length) {
    const details: BookingConflictError = { code: 'BOOKING_CONFLICT', conflicts };
    throw conflict('BOOKING_CONFLICT', `${vehicleLabel(vehicle)} is already booked for that period`, details);
  }
  return vehicle;
}

export async function getBooking(id: string): Promise<VehicleBooking> {
  return mustGet<VehicleBooking>(COL.vehicleBookings, id, 'Vehicle booking');
}

export function canViewBooking(actor: Actor, b: VehicleBooking): boolean {
  return b.requesterId === actor.uid || b.driverId === actor.uid || isFleetAdmin(actor) || canViewAll(actor);
}

export async function calendar(from: string, to: string): Promise<FleetCalendarResponse> {
  const toEnd = `${to}T23:59:59.999Z`;
  const fromStart = `${from}T00:00:00.000Z`;
  const [vehicles, bookings] = await Promise.all([getAllDocs<Vehicle>(COL.vehicles), runQuery<VehicleBooking>(db.collection(COL.vehicleBookings).where('pickupAt', '<=', toEnd).orderBy('pickupAt', 'asc'), 300)]);
  return {
    from,
    to,
    vehicles: vehicles.filter((v) => v.status !== 'RETIRED').sort(byAsc((v) => v.registration)),
    bookings: bookings.filter((b) => b.returnAt >= fromStart && b.status !== 'CANCELLED' && b.status !== 'REJECTED'),
  };
}

export async function listBookings(actor: Actor, scope: 'mine' | 'all', limit: number): Promise<VehicleBooking[]> {
  const col = db.collection(COL.vehicleBookings);
  if (scope === 'all' && (isFleetAdmin(actor) || canViewAll(actor))) return runQuery<VehicleBooking>(col.orderBy('pickupAt', 'desc'), limit);
  const [mine, driving] = await Promise.all([runQuery<VehicleBooking>(col.where('requesterId', '==', actor.uid).orderBy('pickupAt', 'desc'), limit), runQuery<VehicleBooking>(col.where('driverId', '==', actor.uid), limit)]);
  const m = new Map(mine.map((b) => [b.id, b]));
  for (const b of driving) m.set(b.id, b);
  return [...m.values()].sort(byDesc((b) => b.pickupAt)).slice(0, limit);
}

export async function createBooking(actor: Actor, body: CreateVehicleBookingBody): Promise<VehicleBooking> {
  if (body.returnAt <= body.pickupAt) throw unprocessable('INVALID_RANGE', 'Return must be after pickup');
  let vehicle: Vehicle | null = null;
  if (body.vehicleId) vehicle = await assertVehicleFree(body.vehicleId, body.pickupAt, body.returnAt);
  const { id } = await nextRef('VEH');
  const now = nowIso();
  const booking: VehicleBooking = {
    id,
    vehicleId: vehicle?.id,
    vehicleLabel: vehicle ? vehicleLabel(vehicle) : undefined,
    requesterId: actor.uid,
    requesterName: actor.profile.displayName,
    requestId: body.requestId,
    purpose: body.purpose,
    destination: body.destination,
    passengers: body.passengers,
    pickupAt: body.pickupAt,
    returnAt: body.returnAt,
    mode: body.mode,
    driverId: body.mode === 'ASSIGNED_DRIVER' ? vehicle?.assignedDriverId : undefined,
    driverName: body.mode === 'ASSIGNED_DRIVER' ? vehicle?.assignedDriverName : undefined,
    status: 'REQUESTED',
    selfDrive: {},
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
  if (body.mode === 'SELF_DRIVE') {
    const expiry = actor.profile.driverLicenceExpiry;
    if (expiry) booking.selfDrive.licenceValid = { ok: expiry > body.returnAt.slice(0, 10), expiry, at: now };
  }
  await db.collection(COL.vehicleBookings).doc(id).set(booking);
  if (body.requestId) await db.collection(COL.travelRequests).doc(body.requestId).set({ 'transport.vehicleBookingId': id, updatedAt: now }, { merge: true }).catch(() => undefined);
  await audit(actor, { entityType: 'vehicleBooking', entityId: id, action: 'CREATED', newValue: { vehicleId: booking.vehicleId, pickupAt: booking.pickupAt, returnAt: booking.returnAt, mode: booking.mode } });
  await notifyMany(await userIdsWithRoles(['OFFICE_MANAGEMENT']), { title: 'Vehicle booking requested', body: `${booking.requesterName} · ${id} · ${booking.destination} · ${booking.mode === 'SELF_DRIVE' ? 'self-drive' : 'driver required'}`, link: `/fleet/bookings/${id}`, kind: 'VEHICLE_REQUESTED' });
  return booking;
}

function assertFleet(actor: Actor): void {
  if (!isFleetAdmin(actor)) throw forbidden('Only Office Management / Fleet Administration can do that');
}

async function save(actor: Actor, b: VehicleBooking, action: string, extra: Partial<import('@tms/shared').AuditEvent> = {}): Promise<VehicleBooking> {
  const next = { ...b, updatedAt: nowIso() };
  await db.collection(COL.vehicleBookings).doc(b.id).set(next);
  await audit(actor, { entityType: 'vehicleBooking', entityId: b.id, action, ...extra });
  return next;
}

export async function assignVehicle(actor: Actor, id: string, body: AssignVehicleBody): Promise<VehicleBooking> {
  assertFleet(actor);
  const b = await getBooking(id);
  if (!['REQUESTED', 'CONFIRMED'].includes(b.status)) throw unprocessable('INVALID_STATE', `Booking is ${b.status}`);
  const vehicle = await assertVehicleFree(body.vehicleId, b.pickupAt, b.returnAt, b.id);
  const driverId = body.driverId ?? (b.mode === 'ASSIGNED_DRIVER' ? vehicle.assignedDriverId : undefined);
  const driver = driverId ? await getProfile(driverId) : null;
  const next = await save(
    actor,
    { ...b, vehicleId: vehicle.id, vehicleLabel: vehicleLabel(vehicle), driverId, driverName: driver?.displayName ?? (driverId === vehicle.assignedDriverId ? vehicle.assignedDriverName : undefined), status: 'CONFIRMED' },
    'ASSIGNED',
    { newValue: { vehicleId: vehicle.id, driverId } },
  );
  await notify(b.requesterId, { title: 'Vehicle booking confirmed', body: `${id} · ${vehicleLabel(vehicle)}${next.driverName ? ` · driver ${next.driverName}` : ''} · ${b.destination}`, link: `/fleet/bookings/${id}`, kind: 'VEHICLE_CONFIRMED' });
  if (driverId && driverId !== b.requesterId) await notify(driverId, { title: 'You have been assigned a trip', body: `${id} · ${b.destination} · ${b.requesterName}`, link: `/fleet/bookings/${id}`, kind: 'DRIVER_ASSIGNED' });
  return next;
}

export async function rejectBooking(actor: Actor, id: string, reason: string): Promise<VehicleBooking> {
  assertFleet(actor);
  const b = await getBooking(id);
  if (!['REQUESTED', 'CONFIRMED'].includes(b.status)) throw unprocessable('INVALID_STATE', `Booking is ${b.status}`);
  const next = await save(actor, { ...b, status: 'REJECTED', notes: reason }, 'REJECTED', { newValue: { reason } });
  await notify(b.requesterId, { title: 'Vehicle booking declined', body: `${id} · ${reason}`, link: `/fleet/bookings/${id}`, kind: 'VEHICLE_REJECTED' });
  return next;
}

export async function cancelBooking(actor: Actor, id: string): Promise<VehicleBooking> {
  const b = await getBooking(id);
  if (!(b.requesterId === actor.uid || isFleetAdmin(actor) || isAdmin(actor))) throw forbidden();
  if (['CLOSED', 'CANCELLED', 'REJECTED', 'RETURNED'].includes(b.status)) throw unprocessable('INVALID_STATE', `Booking is ${b.status}`);
  const next = await save(actor, { ...b, status: 'CANCELLED' }, 'CANCELLED');
  if (b.requesterId !== actor.uid) await notify(b.requesterId, { title: 'Vehicle booking cancelled', body: `${id} · ${b.destination}`, link: `/fleet/bookings/${id}`, kind: 'VEHICLE_CANCELLED' });
  return next;
}

/** Self-drive gating: licence → pre-inspection → keys out → return inspection → dual key-return sign-off (SRS §15.4). */
export async function selfDriveStep(actor: Actor, id: string, body: SelfDriveStepBody): Promise<VehicleBooking> {
  const b = await getBooking(id);
  const requester = b.requesterId === actor.uid;
  const fleet = isFleetAdmin(actor);
  if (!requester && !fleet) throw forbidden();
  if (b.mode !== 'SELF_DRIVE' && body.step !== 'key_return') throw unprocessable('NOT_SELF_DRIVE', 'Inspection steps apply to self-drive bookings');
  const now = nowIso();
  const sd = { ...b.selfDrive };
  let status = b.status;
  const order = (needed: boolean, msg: string) => {
    if (!needed) throw unprocessable('STEP_ORDER', msg);
  };
  switch (body.step) {
    case 'licence':
      order(['REQUESTED', 'CONFIRMED'].includes(b.status), 'Licence can only be validated before departure');
      sd.licenceValid = { ok: body.expiry > b.returnAt.slice(0, 10), expiry: body.expiry, at: now };
      break;
    case 'pre_inspection':
      order(!!sd.licenceValid, 'Validate the driver licence first');
      order(b.status === 'CONFIRMED', 'Booking must be confirmed with a vehicle before inspection');
      sd.preDepartureInspection = { ok: body.ok, notes: body.notes, at: now, by: actor.uid };
      break;
    case 'keys_out':
      order(!!sd.preDepartureInspection?.ok, 'Log a passed pre-departure inspection first');
      order(!!sd.licenceValid?.ok, 'Driver licence must be valid for the whole booking before keys are released');
      order(b.status === 'CONFIRMED', `Booking is ${b.status}`);
      sd.keysAccepted = { odometerOut: body.odometerOut, fuelLevel: body.fuelLevel, at: now, by: actor.uid };
      status = 'IN_PROGRESS';
      break;
    case 'return_inspection':
      order(!!sd.keysAccepted && b.status === 'IN_PROGRESS', 'Keys must be accepted (booking in progress) before a return inspection');
      order(body.odometerIn >= (sd.keysAccepted?.odometerOut ?? 0), 'Odometer-in cannot be lower than odometer-out');
      sd.returnInspection = { odometerIn: body.odometerIn, fuelLevel: body.fuelLevel, faults: body.faults, at: now, by: actor.uid };
      status = 'RETURNED';
      if (b.vehicleId) await db.collection(COL.vehicles).doc(b.vehicleId).set({ odometerKm: body.odometerIn }, { merge: true });
      break;
    case 'key_return': {
      order(!!sd.returnInspection || (b.mode === 'ASSIGNED_DRIVER' && b.status === 'IN_PROGRESS'), 'Log the return inspection first');
      const kr = { ...(sd.keyReturn ?? {}) };
      if (body.party === 'TRAVELLER') {
        if (!requester && !isAdmin(actor)) throw forbidden('Only the traveller can sign as traveller');
        kr.travellerSignedAt = now;
      } else {
        if (!fleet) throw forbidden('Only Office Management can sign for the office');
        kr.officeSignedAt = now;
        kr.officeSignedBy = actor.uid;
      }
      sd.keyReturn = kr;
      if (kr.travellerSignedAt && kr.officeSignedAt) status = 'CLOSED';
      break;
    }
  }
  const next = await save(actor, { ...b, selfDrive: sd, status }, `STEP_${body.step.toUpperCase()}`, { oldValue: { status: b.status }, newValue: { status, step: body } });
  if (status === 'CLOSED' && b.status !== 'CLOSED') await notify(b.requesterId, { title: 'Vehicle returned — booking closed', body: `${id} · ${b.vehicleLabel ?? ''}`, link: `/fleet/bookings/${id}`, kind: 'VEHICLE_CLOSED' });
  return next;
}

export async function addPhoto(actor: Actor, id: string, attachmentId: string): Promise<VehicleBooking> {
  const b = await getBooking(id);
  if (!(b.requesterId === actor.uid || isFleetAdmin(actor))) throw forbidden();
  if (b.photos.length >= 6) throw unprocessable('PHOTO_LIMIT', 'A booking holds at most 6 condition photos');
  const att = await mustGet<Attachment>(COL.attachments, attachmentId, 'Attachment');
  if (att.uploadedBy !== actor.uid && !isFleetAdmin(actor)) throw forbidden('You can only attach photos you uploaded');
  return save(actor, { ...b, photos: [...b.photos.filter((p) => p.id !== att.id), { ...att, kind: 'PHOTO' }] }, 'PHOTO_ADDED', { newValue: { attachmentId } });
}

export async function upsertVehicle(actor: Actor, body: Partial<Vehicle> & { id?: string }, id?: string): Promise<Vehicle> {
  if (!hasAnyRole(actor.roles, [...FLEET_ROLES, 'SYSTEM_ADMIN'])) throw forbidden();
  const existing = id ? await getVehicle(id) : null;
  if (id && !existing) throw notFound('Vehicle');
  const driver = body.assignedDriverId ? await getProfile(body.assignedDriverId) : null;
  const vehicleId = id ?? body.id ?? db.collection(COL.vehicles).doc().id;
  const v: Vehicle = {
    id: vehicleId,
    make: body.make ?? existing?.make ?? '',
    model: body.model ?? existing?.model ?? '',
    year: body.year ?? existing?.year,
    registration: body.registration ?? existing?.registration ?? '',
    officeId: body.officeId ?? existing?.officeId,
    projectId: body.projectId ?? existing?.projectId,
    odometerKm: body.odometerKm ?? existing?.odometerKm ?? 0,
    status: body.status ?? existing?.status ?? 'AVAILABLE',
    serviceNote: body.serviceNote ?? existing?.serviceNote,
    serviceDueBack: body.serviceDueBack ?? existing?.serviceDueBack,
    assignedDriverId: body.assignedDriverId ?? existing?.assignedDriverId,
    assignedDriverName: driver?.displayName ?? (body.assignedDriverId ? existing?.assignedDriverName : existing?.assignedDriverName),
  };
  if (!v.make || !v.registration) throw unprocessable('VALIDATION', 'make and registration are required');
  await db.collection(COL.vehicles).doc(vehicleId).set(v);
  await audit(actor, { entityType: 'vehicle', entityId: vehicleId, action: existing ? 'UPDATED' : 'CREATED', oldValue: existing ?? undefined, newValue: v });
  return v;
}
