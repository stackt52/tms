import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../lib/context';
import { parseBody, qs, wrap } from '../lib/http';
import { paged, parseLimit } from '../lib/query';
import { addDocument, listTrips, removeDocument, startTrip, tripDetail, upsertArrangement } from '../services/trips';
import { getRequest } from '../services/travelRequests';

const Arrangement = z.object({
  type: z.enum(['FLIGHT', 'HOTEL', 'SHUTTLE', 'IHM_VEHICLE', 'RENTAL', 'OTHER']),
  title: z.string().min(1).max(200),
  detail: z.string().max(500).optional(),
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  bookingRef: z.string().max(80).optional(),
  amount: z.number().min(0).optional(),
  currency: z.string().max(3).optional(),
  status: z.enum(['REQUESTED', 'QUOTED', 'CONFIRMED', 'CANCELLED']).optional(),
  officerId: z.string().optional(),
  bookedAt: z.string().optional(),
  cancellationTerms: z.string().max(500).optional(),
});
const KINDS = ['QUOTATION', 'BOARDING_PASS', 'RECEIPT', 'MAPS_ROUTE', 'TICKET', 'BOOKING_CONFIRMATION', 'RENTAL_AGREEMENT', 'APPROVAL_EVIDENCE', 'VISA', 'ATTENDANCE_REGISTER', 'ACQUITTAL', 'TRIP_REPORT', 'AUTHORISATION', 'PAYMENT_PROOF', 'PHOTO', 'AGENDA', 'OTHER'] as const;

export function tripsRouter(): Router {
  const r = Router();
  r.get(
    '/',
    wrap(async (req, res) => {
      const limit = parseLimit(req);
      const scope = (qs(req, 'scope') as 'mine' | 'team' | 'all' | undefined) ?? 'mine';
      res.json(paged(await listTrips(actorOf(req), scope, limit), limit));
    }),
  );
  r.get('/:id', wrap(async (req, res) => res.json(await tripDetail(actorOf(req), req.params.id))));
  r.post(
    '/:id/arrangements',
    wrap(async (req, res) => {
      const body = parseBody(Arrangement, req.body);
      await upsertArrangement(actorOf(req), req.params.id, body);
      res.status(201).json(await tripDetail(actorOf(req), req.params.id));
    }),
  );
  r.patch(
    '/:id/arrangements/:aid',
    wrap(async (req, res) => {
      const body = parseBody(Arrangement.partial(), req.body);
      await upsertArrangement(actorOf(req), req.params.id, body as Parameters<typeof upsertArrangement>[2], req.params.aid);
      res.json(await tripDetail(actorOf(req), req.params.id));
    }),
  );
  r.post(
    '/:id/documents',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ attachmentId: z.string().min(1), kind: z.enum(KINDS).optional() }), req.body);
      await addDocument(actorOf(req), req.params.id, body);
      res.status(201).json(await tripDetail(actorOf(req), req.params.id));
    }),
  );
  r.delete(
    '/:id/documents/:docId',
    wrap(async (req, res) => {
      await removeDocument(actorOf(req), req.params.id, req.params.docId);
      res.json(await tripDetail(actorOf(req), req.params.id));
    }),
  );
  r.post(
    '/:id/start',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      await startTrip(actor, await getRequest(req.params.id));
      res.json(await tripDetail(actor, req.params.id));
    }),
  );
  return r;
}
