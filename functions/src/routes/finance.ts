import { Router } from 'express';
import { z } from 'zod';
import type { Liquidation } from '@tms/shared';
import { actorOf } from '../lib/context';
import { parseBody, wrap } from '../lib/http';
import { COL, db } from '../lib/firebase';
import { paged, parseLimit, runQuery } from '../lib/query';
import { advanceQueue, approveException, assertFinanceViewer, recordMilestone, requestException } from '../services/finance';

const Milestone = z.object({ milestone: z.enum(['PREPARED', 'SUBMITTED', 'AUTH_1', 'AUTH_2', 'RELEASED']), reference: z.string().max(80).optional() });

export function financeRouter(): Router {
  const r = Router();
  r.get('/advances', wrap(async (req, res) => res.json(await advanceQueue(actorOf(req)))));
  r.post(
    '/advances/:requestId/milestones',
    wrap(async (req, res) => {
      const body = parseBody(Milestone, req.body);
      const updated = await recordMilestone(actorOf(req), req.params.requestId, body.milestone, body.reference);
      res.json({ requestId: updated.id, status: updated.status, advance: updated.advance });
    }),
  );
  r.post(
    '/advances/:requestId/exception',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ reason: z.string().min(3).max(1000) }), req.body);
      const updated = await requestException(actorOf(req), req.params.requestId, body.reason);
      res.json({ requestId: updated.id, status: updated.status, advance: updated.advance });
    }),
  );
  r.post(
    '/advances/:requestId/exception/approve',
    wrap(async (req, res) => {
      const updated = await approveException(actorOf(req), req.params.requestId);
      res.json({ requestId: updated.id, status: updated.status, advance: updated.advance });
    }),
  );
  r.get(
    '/liquidations',
    wrap(async (req, res) => {
      assertFinanceViewer(actorOf(req));
      const limit = parseLimit(req);
      res.json(paged(await runQuery<Liquidation>(db.collection(COL.liquidations).where('status', '==', 'SUBMITTED').orderBy('dueDate', 'asc'), limit), limit));
    }),
  );
  return r;
}
