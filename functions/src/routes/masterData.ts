import { Router } from 'express';
import type { UserProfile } from '@tms/shared';
import { wrap } from '../lib/http';
import { COL } from '../lib/firebase';
import { getAllDocs } from '../lib/query';
import { loadMasterData, userPick } from '../services/masterData';

export function masterDataRouter(): Router {
  const r = Router();
  r.get(
    '/',
    wrap(async (_req, res) => {
      const [md, users] = await Promise.all([loadMasterData(), getAllDocs<UserProfile>(COL.users)]);
      res.json({ ...md, users: users.filter((u) => u.active !== false).map(userPick) });
    }),
  );
  return r;
}
