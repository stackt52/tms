import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../lib/context';
import { parseBody, qs, wrap } from '../lib/http';
import { paged, parseLimit } from '../lib/query';
import { addEvidence, claimDetail, createClaim, decideClaim, getClaim, listClaims, patchClaim, payClaim, submitClaim } from '../services/mileage';

const Create = z.object({
  purpose: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromName: z.string().min(1).max(200),
  toName: z.string().min(1).max(200),
  distanceKm: z.number().positive().max(5000),
  province: z.string().max(60).optional(),
  withinProvince: z.boolean().optional(),
  preApprovalRef: z.string().max(60).optional(),
});

export function mileageRouter(): Router {
  const r = Router();
  const detail = async (req: Parameters<Parameters<typeof wrap>[0]>[0], id: string) => claimDetail(actorOf(req), await getClaim(id));

  r.get(
    '/',
    wrap(async (req, res) => {
      const limit = parseLimit(req);
      const scope = (qs(req, 'scope') as 'mine' | 'review' | 'all' | undefined) ?? 'mine';
      res.json(paged(await listClaims(actorOf(req), scope, limit), limit));
    }),
  );
  r.post('/', wrap(async (req, res) => res.status(201).json(await claimDetail(actorOf(req), await createClaim(actorOf(req), parseBody(Create, req.body))))));
  r.get('/:id', wrap(async (req, res) => res.json(await detail(req, req.params.id))));
  r.patch('/:id', wrap(async (req, res) => res.json(await claimDetail(actorOf(req), await patchClaim(actorOf(req), req.params.id, parseBody(Create.partial(), req.body))))));
  r.post(
    '/:id/evidence',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ attachmentId: z.string().min(1), type: z.enum(['ROUTE', 'BUSINESS', 'PRE_APPROVAL']) }), req.body);
      res.status(201).json(await claimDetail(actorOf(req), await addEvidence(actorOf(req), req.params.id, body.attachmentId, body.type)));
    }),
  );
  r.post('/:id/submit', wrap(async (req, res) => res.json(await claimDetail(actorOf(req), await submitClaim(actorOf(req), req.params.id)))));
  r.post(
    '/:id/decide',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), comment: z.string().max(1000).optional() }), req.body);
      res.json(await claimDetail(actorOf(req), await decideClaim(actorOf(req), req.params.id, body.decision, body.comment)));
    }),
  );
  r.post(
    '/:id/pay',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ reference: z.string().max(80).optional() }), req.body ?? {});
      res.json(await claimDetail(actorOf(req), await payClaim(actorOf(req), req.params.id, body.reference)));
    }),
  );
  return r;
}
