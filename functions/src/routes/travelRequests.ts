import { Router } from 'express';
import { z } from 'zod';
import type { EligibilityPreviewResponse, TravelRequestDetail } from '@tms/shared';
import { WIZARD_STEPS, computeEligibility, estimateRoadKm, nightsBetween } from '@tms/shared';
import { actorOf } from '../lib/context';
import { parseBody, qs, wrap } from '../lib/http';
import { paged, parseLimit, parseStatusList } from '../lib/query';
import { loadConfig } from '../services/config';
import { buildDetail, cancelRequest, createRequest, getRequestForActor, listAudit, listRequests, patchRequest, submitRequest } from '../services/travelRequests';

const Category = z.enum(['LOCAL', 'FIELD', 'INTERNATIONAL']);
const Money = z.number().min(0);
const CostLine = z.object({
  id: z.string().min(1),
  category: z.enum(['PER_DIEM', 'ACCOMMODATION', 'FLIGHTS', 'GROUND_TRANSPORT', 'CAR_RENTAL', 'FUEL', 'MILEAGE', 'VISA', 'BAGGAGE', 'PARKING_TOLLS', 'STATIONERY', 'OTHER']),
  label: z.string().min(1).max(120),
  quantity: z.number().min(0),
  unitCost: Money,
  amount: Money.optional().default(0),
  employeeContribution: Money.optional(),
  paidDirectly: z.boolean().optional(),
  receiptRequired: z.boolean().default(true),
  note: z.string().max(500).optional(),
});
const Traveller = z.object({
  userId: z.string().optional(),
  externalId: z.string().optional(),
  name: z.string().min(1),
  initials: z.string().min(1).max(3),
  departmentId: z.string().optional(),
  costCentreId: z.string().optional(),
  isLead: z.boolean().optional(),
});
const Iso = z.string().min(10);
const ATTACHMENT_KINDS = ['QUOTATION', 'BOARDING_PASS', 'RECEIPT', 'MAPS_ROUTE', 'TICKET', 'BOOKING_CONFIRMATION', 'RENTAL_AGREEMENT', 'APPROVAL_EVIDENCE', 'VISA', 'ATTENDANCE_REGISTER', 'ACQUITTAL', 'TRIP_REPORT', 'AUTHORISATION', 'PAYMENT_PROOF', 'PHOTO', 'AGENDA', 'OTHER'] as const;
const Update = z
  .object({
    category: Category.nullable().optional(),
    activityTitle: z.string().max(200).optional(),
    purpose: z.string().max(2000).optional(),
    activityDescription: z.string().max(5000).optional(),
    expectedOutcomes: z.string().max(5000).optional(),
    workPlanRef: z.string().max(120).optional(),
    justification: z.string().max(5000).optional(),
    departmentId: z.string().optional(),
    unitId: z.string().optional(),
    projectId: z.string().optional(),
    costCentreId: z.string().optional(),
    supervisorId: z.string().optional(),
    travellers: z.array(Traveller).max(50).optional(),
    isGroup: z.boolean().optional(),
    itinerary: z
      .object({
        originId: z.string().optional(),
        originName: z.string().optional(),
        destinationId: z.string().optional(),
        destinationName: z.string().optional(),
        stops: z.array(z.object({ id: z.string().optional(), name: z.string() })).max(20).optional(),
        departAt: Iso.optional(),
        returnAt: Iso.optional(),
        distanceOverrideKm: z.number().min(0).nullable().optional(),
      })
      .optional(),
    transport: z
      .object({
        mode: z.enum(['IHM_VEHICLE', 'RENTAL', 'PRIVATE_VEHICLE', 'AIR', 'PUBLIC', 'OTHER']).nullable().optional(),
        justification: z.string().max(2000).optional(),
        driverRequired: z.boolean().optional(),
        vehicleBookingId: z.string().optional(),
        preferredVendorId: z.string().optional(),
      })
      .optional(),
    accommodation: z.object({ required: z.boolean().optional(), preferredVendorId: z.string().optional(), ratePerNight: Money.optional(), fullBoardProvided: z.boolean().optional() }).optional(),
    allowances: z.object({ overheadFunded: z.boolean().optional(), perDiemWaived: z.boolean().optional(), waiverReason: z.string().max(500).optional() }).optional(),
    costingLines: z.array(CostLine).max(60).optional(),
    international: z
      .object({
        countries: z.array(z.string()),
        cities: z.array(z.string()),
        passportValid: z.boolean(),
        visaRequired: z.boolean(),
        visaStatus: z.enum(['NOT_REQUIRED', 'TO_APPLY', 'APPLIED', 'GRANTED']).optional(),
        airports: z.string().optional(),
        transit: z.string().optional(),
        insurance: z.boolean().optional(),
        currency: z.string().optional(),
        emergencyContact: z.string().optional(),
        cabinClass: z.enum(['ECONOMY', 'PREMIUM', 'BUSINESS', 'FIRST']),
        upgradeDifference: Money.optional(),
      })
      .optional(),
    personal: z
      .object({
        combined: z.boolean(),
        personalDates: z.object({ from: z.string(), to: z.string() }).optional(),
        personalDestinations: z.string().optional(),
        directOfficialQuote: Money.optional(),
        combinedQuote: Money.optional(),
        personalContribution: Money.optional(),
        contributionSettled: z.boolean().optional(),
        leaveWeekdays: z.number().int().min(0).optional(),
      })
      .optional(),
    attachments: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().optional(),
          contentType: z.string().optional(),
          size: z.number().optional(),
          storagePath: z.string().optional(),
          url: z.string().optional(),
          kind: z.enum(ATTACHMENT_KINDS).optional(),
          uploadedBy: z.string().optional(),
          uploadedAt: z.string().optional(),
        }),
      )
      .max(40)
      .optional(),
    wizardStep: z.enum(WIZARD_STEPS).optional(),
    completeStep: z.enum(WIZARD_STEPS).optional(),
  })
  .strict();

const Preview = z.object({
  originId: z.string().optional(),
  destinationId: z.string().optional(),
  distanceKm: z.number().min(0).optional(),
  departAt: Iso.optional(),
  returnAt: Iso.optional(),
  category: Category.nullable().optional(),
});

export function travelRequestsRouter(): Router {
  const r = Router();

  r.get(
    '/',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const scope = (qs(req, 'scope') as 'mine' | 'team' | 'all' | undefined) ?? 'mine';
      const limit = parseLimit(req);
      const items = await listRequests(actor, scope, parseStatusList(qs(req, 'status')), limit);
      res.json(paged(items, limit));
    }),
  );

  r.post(
    '/',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const body = parseBody(z.object({ category: Category.optional() }), req.body ?? {});
      const created = await createRequest(actor, body.category);
      const detail: TravelRequestDetail = await buildDetail(actor, created);
      res.status(201).json(detail);
    }),
  );

  r.get(
    '/:id',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const request = await getRequestForActor(actor, req.params.id);
      res.json(await buildDetail(actor, request, { includeAudit: qs(req, 'audit') === '1' }));
    }),
  );

  r.patch(
    '/:id',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const body = parseBody(Update, req.body);
      const updated = await patchRequest(actor, req.params.id, body as Parameters<typeof patchRequest>[2]);
      res.json(await buildDetail(actor, updated));
    }),
  );

  r.post(
    '/:id/eligibility-preview',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const body = parseBody(Preview, req.body ?? {});
      const cfg = await loadConfig();
      let distanceKm = body.distanceKm ?? 0;
      if (body.distanceKm === undefined && body.destinationId) {
        const base = cfg.locationById.get(actor.profile.dutyStationId ?? '') ?? (body.originId ? cfg.locationById.get(body.originId) : undefined);
        const dest = cfg.locationById.get(body.destinationId);
        if (base && dest) distanceKm = estimateRoadKm(base, dest);
      }
      const eligibility = computeEligibility({ distanceKm, departAt: body.departAt, returnAt: body.returnAt, category: body.category ?? null, policy: cfg.policy });
      const out: EligibilityPreviewResponse = { eligibility, distanceKm, nights: body.departAt && body.returnAt ? nightsBetween(body.departAt, body.returnAt) : 0 };
      res.json(out);
    }),
  );

  r.post(
    '/:id/submit',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const submitted = await submitRequest(actor, req.params.id);
      res.json(await buildDetail(actor, submitted));
    }),
  );

  r.post(
    '/:id/cancel',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const body = parseBody(z.object({ reason: z.string().max(500).optional() }), req.body ?? {});
      const cancelled = await cancelRequest(actor, req.params.id, body.reason);
      res.json(await buildDetail(actor, cancelled));
    }),
  );

  r.get(
    '/:id/audit',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      await getRequestForActor(actor, req.params.id);
      res.json(await listAudit(req.params.id));
    }),
  );

  return r;
}
