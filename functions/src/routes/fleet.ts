import { Router } from 'express';
import { z } from 'zod';
import type { Vehicle } from '@tms/shared';
import { actorOf } from '../lib/context';
import { badRequest, forbidden } from '../lib/errors';
import { parseBody, qs, wrap } from '../lib/http';
import { COL } from '../lib/firebase';
import { getAllDocs, paged, parseLimit } from '../lib/query';
import { addPhoto, assignVehicle, calendar, cancelBooking, canViewBooking, createBooking, getBooking, listBookings, rejectBooking, selfDriveStep, upsertVehicle } from '../services/fleet';

const Iso = z.string().min(10);
const VehicleBody = z.object({
  id: z.string().optional(),
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.number().int().optional(),
  registration: z.string().min(1).optional(),
  officeId: z.string().optional(),
  projectId: z.string().optional(),
  odometerKm: z.number().min(0).optional(),
  status: z.enum(['AVAILABLE', 'IN_SERVICE', 'RETIRED']).optional(),
  serviceNote: z.string().max(200).optional(),
  serviceDueBack: z.string().optional(),
  assignedDriverId: z.string().optional(),
});
const CreateBooking = z.object({
  vehicleId: z.string().optional(),
  requestId: z.string().optional(),
  purpose: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  passengers: z.number().int().min(1).max(60),
  pickupAt: Iso,
  returnAt: Iso,
  mode: z.enum(['ASSIGNED_DRIVER', 'SELF_DRIVE']),
});
const Assign = z.object({ vehicleId: z.string().min(1), driverId: z.string().optional() });
const Step = z.discriminatedUnion('step', [
  z.object({ step: z.literal('licence'), expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ step: z.literal('pre_inspection'), ok: z.boolean(), notes: z.string().max(1000).optional() }),
  z.object({ step: z.literal('keys_out'), odometerOut: z.number().min(0), fuelLevel: z.string().min(1).max(10) }),
  z.object({ step: z.literal('return_inspection'), odometerIn: z.number().min(0), fuelLevel: z.string().min(1).max(10), faults: z.string().max(1000).optional() }),
  z.object({ step: z.literal('key_return'), party: z.enum(['TRAVELLER', 'OFFICE']) }),
]);

export function fleetRouter(): Router {
  const r = Router();

  r.get('/vehicles', wrap(async (_req, res) => res.json({ items: await getAllDocs<Vehicle>(COL.vehicles) })));
  r.post('/vehicles', wrap(async (req, res) => res.status(201).json(await upsertVehicle(actorOf(req), parseBody(VehicleBody, req.body)))));
  r.patch('/vehicles/:id', wrap(async (req, res) => res.json(await upsertVehicle(actorOf(req), parseBody(VehicleBody, req.body), req.params.id))));

  r.get(
    '/vehicle-bookings/calendar',
    wrap(async (req, res) => {
      const from = qs(req, 'from');
      const to = qs(req, 'to');
      if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw badRequest('from and to (YYYY-MM-DD) are required');
      res.json(await calendar(from, to));
    }),
  );
  r.get(
    '/vehicle-bookings',
    wrap(async (req, res) => {
      const limit = parseLimit(req);
      const scope = (qs(req, 'scope') as 'mine' | 'all' | undefined) ?? 'mine';
      res.json(paged(await listBookings(actorOf(req), scope, limit), limit));
    }),
  );
  r.post('/vehicle-bookings', wrap(async (req, res) => res.status(201).json(await createBooking(actorOf(req), parseBody(CreateBooking, req.body)))));
  r.get(
    '/vehicle-bookings/:id',
    wrap(async (req, res) => {
      const b = await getBooking(req.params.id);
      if (!canViewBooking(actorOf(req), b)) throw forbidden();
      res.json(b);
    }),
  );
  r.post('/vehicle-bookings/:id/assign', wrap(async (req, res) => res.json(await assignVehicle(actorOf(req), req.params.id, parseBody(Assign, req.body)))));
  r.post('/vehicle-bookings/:id/reject', wrap(async (req, res) => res.json(await rejectBooking(actorOf(req), req.params.id, parseBody(z.object({ reason: z.string().min(1).max(500) }), req.body).reason))));
  r.post('/vehicle-bookings/:id/steps', wrap(async (req, res) => res.json(await selfDriveStep(actorOf(req), req.params.id, parseBody(Step, req.body)))));
  r.post('/vehicle-bookings/:id/photos', wrap(async (req, res) => res.status(201).json(await addPhoto(actorOf(req), req.params.id, parseBody(z.object({ attachmentId: z.string().min(1) }), req.body).attachmentId))));
  r.post('/vehicle-bookings/:id/cancel', wrap(async (req, res) => res.json(await cancelBooking(actorOf(req), req.params.id))));
  return r;
}
