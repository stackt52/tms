import { Router } from 'express';
import type { Notification, NotificationsResponse } from '@tms/shared';
import { actorOf } from '../lib/context';
import { forbidden, notFound } from '../lib/errors';
import { wrap } from '../lib/http';
import { COL, db } from '../lib/firebase';
import { runQuery } from '../lib/query';

export function notificationsRouter(): Router {
  const r = Router();
  r.get(
    '/',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const [items, unread] = await Promise.all([
        runQuery<Notification>(db.collection(COL.notifications).where('userId', '==', actor.uid).orderBy('createdAt', 'desc'), 30),
        db.collection(COL.notifications).where('userId', '==', actor.uid).where('read', '==', false).count().get(),
      ]);
      const out: NotificationsResponse = { items, unread: unread.data().count };
      res.json(out);
    }),
  );
  r.post(
    '/read-all',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const snap = await db.collection(COL.notifications).where('userId', '==', actor.uid).where('read', '==', false).limit(500).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
      res.json({ updated: snap.size });
    }),
  );
  r.post(
    '/:id/read',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const ref = db.collection(COL.notifications).doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) throw notFound('Notification');
      if ((snap.data() as Notification).userId !== actor.uid) throw forbidden();
      await ref.update({ read: true });
      res.json({ ...(snap.data() as Notification), read: true });
    }),
  );
  return r;
}
