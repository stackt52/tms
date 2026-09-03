import { Router } from 'express';
import { actorOf, requireRoles } from '../lib/context';
import { wrap } from '../lib/http';
import { runDailyJobs } from '../services/jobs';

export function jobsRouter(): Router {
  const r = Router();
  r.post(
    '/run-daily',
    wrap(async (req, res) => {
      requireRoles(actorOf(req), ['SYSTEM_ADMIN']);
      res.json(await runDailyJobs());
    }),
  );
  return r;
}
