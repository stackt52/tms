import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { UserProfile, Vendor } from '@tms/shared';
import { ROLES } from '@tms/shared';
import { actorOf, requireRoles } from '../lib/context';
import { parseBody, wrap } from '../lib/http';
import { COL } from '../lib/firebase';
import { getAllDocs } from '../lib/query';
import { loadConfig } from '../services/config';
import { createRate, createWorkflowVersion, listRates, listWorkflows, overview, patchPolicy, patchRate, updateUser, upsertMaster, upsertVendor } from '../services/admin';

const RateBody = z.object({
  key: z.enum(['ADVANCE_PERCENTAGE', 'MILEAGE_RATE', 'EXTERNAL_TRANSPORT_ALLOWANCE', 'EXTERNAL_DSA', 'EXTERNAL_LUNCH', 'PER_DIEM_DOMESTIC', 'PER_DIEM_INTERNATIONAL', 'STATIONERY_CAP']),
  value: z.number().positive(),
  unit: z.enum(['PERCENT', 'ZMW_PER_KM', 'ZMW_FLAT', 'ZMW_PER_DAY', 'ZMW_PER_NIGHT', 'ZMW_CAP', 'USD_PER_NIGHT']),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(500).optional(),
});
const Stage = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  roles: z.array(z.enum(ROLES)).min(1),
  status: z.enum(['SUBMITTED', 'SUPERVISOR_REVIEW', 'HOD_COST_CENTRE_REVIEW', 'FINANCE_REVIEW', 'FINANCE_DIRECTOR_REVIEW', 'FINAL_APPROVAL', 'PROCUREMENT_REVIEW']),
  checklist: z.boolean().optional(),
});
const WorkflowBody = z.object({ category: z.enum(['LOCAL', 'FIELD', 'INTERNATIONAL', 'EXTERNAL_PAYMENT', 'MILEAGE', 'VEHICLE_BOOKING']), name: z.string().max(120).optional(), stages: z.array(Stage).min(1).max(10), note: z.string().max(500).optional() });
const PolicyBody = z
  .object({
    distanceThresholdKm: z.number().optional(),
    hoursThreshold: z.number().optional(),
    liquidationDeadlineDays: z.number().optional(),
    advanceLeadTimeWorkingDays: z.number().optional(),
    procurementLeadTimeWorkingDays: z.number().optional(),
    internationalNoticeDays: z.number().optional(),
    meetingNoticeWorkingDays: z.number().optional(),
    eventNoticeWorkingDays: z.number().optional(),
    lateInternationalClaimDays: z.number().optional(),
    toggles: z
      .object({
        blockAdvanceOnOutstandingLiquidation: z.boolean().optional(),
        requireInternationalNotice: z.boolean().optional(),
        economyOnlyInternational: z.boolean().optional(),
        approvalDelegation: z.boolean().optional(),
        restrictRentalToApprovedVendors: z.boolean().optional(),
      })
      .optional(),
    publicHolidaysMMDD: z.array(z.string().regex(/^\d{2}-\d{2}$/)).optional(),
  })
  .strict();
const VendorBody = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120).optional(),
  category: z.enum(['AIRLINE', 'HOTEL', 'CAR_RENTAL', 'TRAVEL_AGENT', 'SHUTTLE', 'CATERING', 'VENUE', 'OTHER']).optional(),
  contact: z.string().max(200).optional(),
  locations: z.array(z.string()).optional(),
  contractValidTo: z.string().optional(),
  active: z.boolean().optional(),
  approvedRate: z.string().max(120).optional(),
});
const UserBody = z
  .object({
    roles: z.array(z.enum(ROLES)).min(1).optional(),
    departmentId: z.string().optional(),
    unitId: z.string().optional(),
    costCentreIds: z.array(z.string()).optional(),
    supervisorId: z.string().optional(),
    dutyStationId: z.string().optional(),
    active: z.boolean().optional(),
  })
  .strict();
const MASTER_KINDS = ['departments', 'units', 'projects', 'cost-centres', 'locations'] as const;

export function adminRouter(): Router {
  const r = Router();
  // Reads: SYSTEM_ADMIN or AUDITOR. Writes: SYSTEM_ADMIN only.
  r.use((req: Request, _res: Response, next: NextFunction) => {
    try {
      requireRoles(actorOf(req), req.method === 'GET' ? ['SYSTEM_ADMIN', 'AUDITOR'] : ['SYSTEM_ADMIN']);
      next();
    } catch (e) {
      next(e);
    }
  });

  r.get('/overview', wrap(async (_req, res) => res.json(await overview())));

  r.get('/rates', wrap(async (_req, res) => res.json({ items: await listRates() })));
  r.post('/rates', wrap(async (req, res) => res.status(201).json(await createRate(actorOf(req), parseBody(RateBody, req.body)))));
  r.patch('/rates/:id', wrap(async (req, res) => res.json(await patchRate(actorOf(req), req.params.id, parseBody(z.object({ note: z.string().max(500).optional(), effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }).strict(), req.body)))));

  r.get('/workflows', wrap(async (_req, res) => res.json({ items: await listWorkflows() })));
  r.post('/workflows', wrap(async (req, res) => res.status(201).json(await createWorkflowVersion(actorOf(req), parseBody(WorkflowBody, req.body)))));

  r.get('/policy', wrap(async (_req, res) => res.json((await loadConfig(true)).policy)));
  r.patch('/policy', wrap(async (req, res) => res.json(await patchPolicy(actorOf(req), parseBody(PolicyBody, req.body) as Parameters<typeof patchPolicy>[1]))));

  r.get('/vendors', wrap(async (_req, res) => res.json({ items: await getAllDocs<Vendor>(COL.vendors) })));
  r.post('/vendors', wrap(async (req, res) => res.status(201).json(await upsertVendor(actorOf(req), parseBody(VendorBody, req.body) as Partial<Vendor>))));
  r.patch('/vendors/:id', wrap(async (req, res) => res.json(await upsertVendor(actorOf(req), parseBody(VendorBody, req.body) as Partial<Vendor>, req.params.id))));

  r.get('/users', wrap(async (_req, res) => res.json({ items: await getAllDocs<UserProfile>(COL.users) })));
  r.patch('/users/:id', wrap(async (req, res) => res.json(await updateUser(actorOf(req), req.params.id, parseBody(UserBody, req.body)))));

  for (const kind of MASTER_KINDS) {
    r.post(`/${kind}`, wrap(async (req, res) => res.status(201).json(await upsertMaster(actorOf(req), kind, parseBody(z.record(z.unknown()), req.body)))));
    r.patch(`/${kind}/:id`, wrap(async (req, res) => res.json(await upsertMaster(actorOf(req), kind, parseBody(z.record(z.unknown()), req.body), req.params.id))));
  }
  return r;
}
