import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../lib/context';
import { notFound } from '../lib/errors';
import { parseBody, qs, wrap } from '../lib/http';
import { paged, parseLimit } from '../lib/query';
import {
  addLine,
  approveTripReport,
  attachBoardingPass,
  attachReceipt,
  deleteLine,
  getLiquidation,
  liquidationDetail,
  liquidationForRequest,
  listLiquidations,
  openEarly,
  reviewLiquidation,
  submitLiquidation,
  submitTripReport,
  updateLiquidation,
} from '../services/liquidations';

const Category = z.enum(['PER_DIEM', 'ACCOMMODATION', 'FLIGHTS', 'GROUND_TRANSPORT', 'CAR_RENTAL', 'FUEL', 'MILEAGE', 'VISA', 'BAGGAGE', 'PARKING_TOLLS', 'STATIONERY', 'OTHER']);
const Attachment = z.object({
  id: z.string(),
  name: z.string(),
  contentType: z.string(),
  size: z.number(),
  storagePath: z.string(),
  url: z.string().optional(),
  kind: z.string(),
  uploadedBy: z.string(),
  uploadedAt: z.string(),
});
const Line = z.object({
  id: z.string().optional().default(''),
  category: Category,
  label: z.string().min(1).max(120),
  budgeted: z.number().min(0),
  actual: z.number().min(0),
  receiptRequired: z.boolean(),
  receipts: z.array(Attachment).optional(),
  note: z.string().max(500).optional(),
});
const Update = z
  .object({
    lines: z.array(Line).max(60).optional(),
    tripReport: z
      .object({
        objective: z.string().max(4000).optional(),
        activities: z.string().max(8000).optional(),
        locations: z.string().max(2000).optional(),
        outcomes: z.string().max(8000).optional(),
        challenges: z.string().max(4000).optional(),
        followUps: z.string().max(4000).optional(),
        recommendations: z.string().max(4000).optional(),
      })
      .optional(),
    refundReference: z.string().max(80).optional(),
  })
  .strict();
const AddLine = z.object({ category: Category, label: z.string().min(1).max(120), budgeted: z.number().min(0).optional(), actual: z.number().min(0), receiptRequired: z.boolean().optional() });
const Attach = z.object({ attachmentId: z.string().min(1) });
const Review = z.object({ decision: z.enum(['APPROVED', 'RETURNED']), comment: z.string().max(2000).optional(), settlementReference: z.string().max(80).optional() });

export function liquidationsRouter(): Router {
  const r = Router();
  const detail = async (req: Parameters<Parameters<typeof wrap>[0]>[0], id: string) => liquidationDetail(actorOf(req), await getLiquidation(id));

  r.get(
    '/',
    wrap(async (req, res) => {
      const limit = parseLimit(req);
      const scope = (qs(req, 'scope') as 'mine' | 'review' | 'all' | undefined) ?? 'mine';
      res.json(paged(await listLiquidations(actorOf(req), scope, limit), limit));
    }),
  );
  r.get(
    '/by-request/:requestId',
    wrap(async (req, res) => {
      const liq = await liquidationForRequest(req.params.requestId);
      if (!liq) throw notFound('Liquidation');
      res.json(await liquidationDetail(actorOf(req), liq));
    }),
  );
  r.post('/open/:requestId', wrap(async (req, res) => res.status(201).json(await liquidationDetail(actorOf(req), await openEarly(actorOf(req), req.params.requestId)))));
  r.get('/:id', wrap(async (req, res) => res.json(await detail(req, req.params.id))));
  r.patch(
    '/:id',
    wrap(async (req, res) => {
      const body = parseBody(Update, req.body);
      res.json(await liquidationDetail(actorOf(req), await updateLiquidation(actorOf(req), req.params.id, body as Parameters<typeof updateLiquidation>[2])));
    }),
  );
  r.post(
    '/:id/lines',
    wrap(async (req, res) => {
      const body = parseBody(AddLine, req.body);
      res.status(201).json(await liquidationDetail(actorOf(req), await addLine(actorOf(req), req.params.id, body)));
    }),
  );
  r.delete('/:id/lines/:lineId', wrap(async (req, res) => res.json(await liquidationDetail(actorOf(req), await deleteLine(actorOf(req), req.params.id, req.params.lineId)))));
  r.post(
    '/:id/lines/:lineId/receipts',
    wrap(async (req, res) => {
      const body = parseBody(Attach, req.body);
      res.status(201).json(await liquidationDetail(actorOf(req), await attachReceipt(actorOf(req), req.params.id, req.params.lineId, body.attachmentId)));
    }),
  );
  r.post(
    '/:id/boarding-passes',
    wrap(async (req, res) => {
      const body = parseBody(Attach, req.body);
      res.status(201).json(await liquidationDetail(actorOf(req), await attachBoardingPass(actorOf(req), req.params.id, body.attachmentId)));
    }),
  );
  r.post('/:id/trip-report/submit', wrap(async (req, res) => res.json(await liquidationDetail(actorOf(req), await submitTripReport(actorOf(req), req.params.id)))));
  r.post(
    '/:id/trip-report/approve',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ comment: z.string().max(2000).optional() }), req.body ?? {});
      res.json(await liquidationDetail(actorOf(req), await approveTripReport(actorOf(req), req.params.id, body.comment)));
    }),
  );
  r.post('/:id/submit', wrap(async (req, res) => res.json(await liquidationDetail(actorOf(req), await submitLiquidation(actorOf(req), req.params.id)))));
  r.post(
    '/:id/review',
    wrap(async (req, res) => {
      const body = parseBody(Review, req.body);
      res.json(await liquidationDetail(actorOf(req), await reviewLiquidation(actorOf(req), req.params.id, body)));
    }),
  );
  return r;
}
