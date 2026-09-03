import { Router } from 'express';
import { z } from 'zod';
import type { MeResponse, UserProfile } from '@tms/shared';
import { APPROVER_ROLES, hasAnyRole } from '@tms/shared';
import { actorOf } from '../lib/context';
import { parseBody, wrap } from '../lib/http';
import { COL, db, nowIso } from '../lib/firebase';
import { audit } from '../lib/audit';
import { canSeeFinance, isFleetAdmin } from '../services/access';
import { getDepartment, getLocation, getUnit } from '../services/masterData';
import { getProfile } from '../services/people';
import { maskBank, maskMobileMoney } from '../lib/mask';

const PatchMe = z
  .object({
    phone: z.string().max(40).optional(),
    bank: z.object({ bankName: z.string().min(1).max(80), accountMasked: z.string().min(1).max(40) }).nullable().optional(),
    mobileMoney: z.object({ provider: z.enum(['AIRTEL', 'MTN', 'ZAMTEL']), numberMasked: z.string().min(1).max(40) }).nullable().optional(),
    driverLicenceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .strict();

export function meRouter(): Router {
  const r = Router();

  r.get(
    '/',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const p = actor.profile;
      const [department, unit, dutyStation, supervisor, unread] = await Promise.all([
        getDepartment(p.departmentId),
        getUnit(p.unitId),
        getLocation(p.dutyStationId),
        getProfile(p.supervisorId),
        db.collection(COL.notifications).where('userId', '==', actor.uid).where('read', '==', false).count().get(),
      ]);
      const body: MeResponse = {
        user: p,
        department: department ?? undefined,
        unit: unit ?? undefined,
        dutyStation: dutyStation ?? undefined,
        supervisor: supervisor ? { id: supervisor.id, displayName: supervisor.displayName, initials: supervisor.initials } : undefined,
        capabilities: {
          canApprove: hasAnyRole(actor.roles, APPROVER_ROLES),
          canSeeFinance: canSeeFinance(actor),
          canSeeFleetAdmin: isFleetAdmin(actor),
          canAdmin: actor.roles.includes('SYSTEM_ADMIN'),
          canProcure: actor.roles.includes('PROCUREMENT_OFFICER'),
        },
        unreadNotifications: unread.data().count,
      };
      res.json(body);
    }),
  );

  r.patch(
    '/',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const body = parseBody(PatchMe, req.body);
      const next: UserProfile = { ...actor.profile };
      if (body.phone !== undefined) next.phone = body.phone;
      if (body.bank !== undefined) next.bank = maskBank(body.bank);
      if (body.mobileMoney !== undefined) next.mobileMoney = maskMobileMoney(body.mobileMoney);
      if (body.driverLicenceExpiry !== undefined) next.driverLicenceExpiry = body.driverLicenceExpiry ?? undefined;
      await db.collection(COL.users).doc(actor.uid).set({ ...next, updatedAt: nowIso() });
      await audit(actor, { entityType: 'user', entityId: actor.uid, action: 'PROFILE_UPDATED', newValue: { keys: Object.keys(body) } });
      res.json({ user: next });
    }),
  );

  return r;
}
