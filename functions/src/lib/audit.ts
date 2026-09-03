import type { AuditEvent, Notification } from '@tms/shared';
import { db, COL, nowIso } from './firebase';
import type { Actor } from './context';

export async function audit(actor: Actor | { uid: string; name: string }, e: Omit<AuditEvent, 'id' | 'actorId' | 'actorName' | 'at'>): Promise<void> {
  const ref = db.collection(COL.auditEvents).doc();
  const actorId = 'uid' in actor ? actor.uid : '';
  const actorName = 'profile' in actor ? actor.profile.displayName : (actor as { name: string }).name;
  const event: AuditEvent = { id: ref.id, actorId, actorName, at: nowIso(), ...e };
  await ref.set(event);
}

export async function notify(userId: string | undefined | null, n: Omit<Notification, 'id' | 'userId' | 'read' | 'createdAt'>): Promise<void> {
  if (!userId) return;
  const ref = db.collection(COL.notifications).doc();
  const doc: Notification = { id: ref.id, userId, read: false, createdAt: nowIso(), ...n };
  await ref.set(doc);
}

export async function notifyMany(userIds: (string | undefined | null)[], n: Omit<Notification, 'id' | 'userId' | 'read' | 'createdAt'>): Promise<void> {
  await Promise.all([...new Set(userIds.filter(Boolean) as string[])].map((u) => notify(u, n)));
}
