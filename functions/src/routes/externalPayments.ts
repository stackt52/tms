import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../lib/context';
import { parseBody, qs, wrap } from '../lib/http';
import { paged, parseLimit } from '../lib/query';
import { createPayment, decidePayment, getPayment, listPayments, payPayment, paymentDetail, recordAcquittal, setParticipants, submitPayment } from '../services/externalPayments';

const Create = z.object({
  activityTitle: z.string().min(1).max(200),
  activityLocationName: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsBeforeNoon: z.boolean().optional(),
  costCentreId: z.string().min(1),
});
const Payout = z.union([
  z.object({ type: z.literal('MOBILE_MONEY'), provider: z.enum(['AIRTEL', 'MTN', 'ZAMTEL']), numberMasked: z.string().min(1).max(40) }),
  z.object({ type: z.literal('BANK'), bankName: z.string().min(1).max(80), accountMasked: z.string().min(1).max(40) }),
  z.null(),
]);
const Participant = z.object({
  participantId: z.string().optional(),
  fullName: z.string().min(1).max(120),
  organisation: z.string().min(1).max(120),
  dutyStationName: z.string().min(1).max(120),
  isHostSite: z.boolean().optional(),
  ihmProvidesTransport: z.boolean().optional(),
  payout: Payout.optional(),
});
const Decision = z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED', 'CLARIFICATION_REQUESTED']), comment: z.string().max(2000).optional(), checklist: z.record(z.boolean()).optional() });

export function externalPaymentsRouter(): Router {
  const r = Router();
  const detail = async (req: Parameters<Parameters<typeof wrap>[0]>[0], id: string) => paymentDetail(actorOf(req), await getPayment(id));

  r.get(
    '/',
    wrap(async (req, res) => {
      const limit = parseLimit(req);
      const scope = (qs(req, 'scope') as 'mine' | 'review' | 'all' | undefined) ?? 'mine';
      res.json(paged(await listPayments(actorOf(req), scope, limit), limit));
    }),
  );
  r.post('/', wrap(async (req, res) => res.status(201).json(await paymentDetail(actorOf(req), await createPayment(actorOf(req), parseBody(Create, req.body))))));
  r.get('/:id', wrap(async (req, res) => res.json(await detail(req, req.params.id))));
  r.put(
    '/:id/participants',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ participants: z.array(Participant).max(500) }), req.body);
      res.json(await paymentDetail(actorOf(req), await setParticipants(actorOf(req), req.params.id, body.participants)));
    }),
  );
  r.post('/:id/submit', wrap(async (req, res) => res.json(await paymentDetail(actorOf(req), await submitPayment(actorOf(req), req.params.id)))));
  r.post('/:id/decide', wrap(async (req, res) => res.json(await paymentDetail(actorOf(req), await decidePayment(actorOf(req), req.params.id, parseBody(Decision, req.body))))));
  r.post(
    '/:id/pay',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ reference: z.string().max(80).optional() }), req.body ?? {});
      res.json(await paymentDetail(actorOf(req), await payPayment(actorOf(req), req.params.id, body.reference)));
    }),
  );
  r.post(
    '/:id/acquittal',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ attendanceRegisterId: z.string().optional(), acquittalSheetIds: z.array(z.string()).max(50).optional(), bankEvidenceId: z.string().optional() }), req.body ?? {});
      res.json(await paymentDetail(actorOf(req), await recordAcquittal(actorOf(req), req.params.id, body)));
    }),
  );
  return r;
}
