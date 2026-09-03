import type { Request } from 'express';
import type { UserProfile, Role } from '@tms/shared';
import { hasAnyRole } from '@tms/shared';
import { forbidden } from './errors';

export interface Actor {
  uid: string;
  profile: UserProfile;
  roles: Role[];
}

export interface AuthedRequest extends Request {
  actor: Actor;
}

export function actorOf(req: Request): Actor {
  const a = (req as AuthedRequest).actor;
  if (!a) throw forbidden('No actor on request');
  return a;
}

export function requireRoles(actor: Actor, roles: readonly Role[], message?: string): void {
  if (!hasAnyRole(actor.roles, roles)) throw forbidden(message ?? `Requires one of: ${roles.join(', ')}`);
}

export function isAdmin(actor: Actor): boolean {
  return actor.roles.includes('SYSTEM_ADMIN');
}
