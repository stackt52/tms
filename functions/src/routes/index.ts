import { Router } from 'express';
import { meRouter } from './me';
import { masterDataRouter } from './masterData';
import { dashboardRouter } from './dashboard';
import { travelRequestsRouter } from './travelRequests';
import { approvalsRouter } from './approvals';
import { tripsRouter } from './trips';
import { filesRouter } from './files';
import { liquidationsRouter } from './liquidations';
import { fleetRouter } from './fleet';
import { mileageRouter } from './mileage';
import { financeRouter } from './finance';
import { externalPaymentsRouter } from './externalPayments';
import { adminRouter } from './admin';
import { notificationsRouter } from './notifications';
import { searchRouter } from './search';
import { jobsRouter } from './jobs';

/** All routes are mounted under /api/v1 behind `authenticate` (see app.ts). */
export function apiRouter(): Router {
  const r = Router();
  r.use('/me', meRouter());
  r.use('/master-data', masterDataRouter());
  r.use('/dashboard', dashboardRouter());
  r.use('/travel-requests', travelRequestsRouter());
  r.use('/approvals', approvalsRouter());
  r.use('/trips', tripsRouter());
  r.use('/files', filesRouter());
  r.use('/liquidations', liquidationsRouter());
  r.use('/', fleetRouter()); // /vehicles, /vehicle-bookings
  r.use('/mileage-claims', mileageRouter());
  r.use('/finance', financeRouter());
  r.use('/external-payments', externalPaymentsRouter());
  r.use('/admin', adminRouter());
  r.use('/notifications', notificationsRouter());
  r.use('/search', searchRouter());
  r.use('/jobs', jobsRouter());
  return r;
}
