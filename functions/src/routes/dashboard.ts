import { Router } from 'express';
import { actorOf } from '../lib/context';
import { wrap } from '../lib/http';
import { dashboard } from '../services/dashboard';
import { financeDashboard } from '../services/finance';

export function dashboardRouter(): Router {
  const r = Router();
  r.get('/', wrap(async (req, res) => res.json(await dashboard(actorOf(req)))));
  r.get('/finance', wrap(async (req, res) => res.json(await financeDashboard(actorOf(req)))));
  return r;
}
