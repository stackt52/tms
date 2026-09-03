import { Router } from 'express';
import { z } from 'zod';
import { actorOf } from '../lib/context';
import { parseBody, wrap } from '../lib/http';
import { approvalDetail, approvalQueue, decide, saveChecklist } from '../services/approvals';

const Decision = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED', 'CLARIFICATION_REQUESTED']),
  comment: z.string().max(2000).optional(),
  checklist: z.record(z.boolean()).optional(),
});

export function approvalsRouter(): Router {
  const r = Router();
  r.get('/queue', wrap(async (req, res) => res.json(await approvalQueue(actorOf(req)))));
  r.get('/:requestId', wrap(async (req, res) => res.json(await approvalDetail(actorOf(req), req.params.requestId))));
  r.put(
    '/:requestId/checklist',
    wrap(async (req, res) => {
      const body = parseBody(z.object({ checklist: z.record(z.boolean()) }), req.body);
      res.json({ checklist: await saveChecklist(actorOf(req), req.params.requestId, body.checklist) });
    }),
  );
  r.post(
    '/:requestId/decide',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const body = parseBody(Decision, req.body);
      await decide(actor, req.params.requestId, body);
      res.json(await approvalDetail(actor, req.params.requestId));
    }),
  );
  return r;
}
