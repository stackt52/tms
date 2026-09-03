import type { Role, TravelRequest } from '@tms/shared';
import { APPROVER_ROLES, FINANCE_ROLES, FLEET_ROLES, hasAnyRole } from '@tms/shared';
import type { Actor } from '../lib/context';

/** Roles that see every travel record (SRS §6, §21.4–21.5, §23). */
export const VIEW_ALL_ROLES: Role[] = [...FINANCE_ROLES, 'PROCUREMENT_OFFICER', 'OFFICE_MANAGEMENT', 'PROJECT_DIRECTOR', 'CEO', 'SYSTEM_ADMIN', 'AUDITOR'];
export const FINANCE_VIEW_ROLES: Role[] = [...FINANCE_ROLES, 'PROJECT_DIRECTOR', 'CEO', 'AUDITOR', 'SYSTEM_ADMIN'];
export const FILE_READER_ROLES: Role[] = [...FINANCE_ROLES, ...APPROVER_ROLES, ...FLEET_ROLES, 'PROCUREMENT_OFFICER', 'SYSTEM_ADMIN', 'AUDITOR'];
export const ARRANGEMENT_ROLES: Role[] = ['PROCUREMENT_OFFICER', 'OFFICE_MANAGEMENT', 'SYSTEM_ADMIN'];
export const FLEET_ADMIN_ROLES: Role[] = [...FLEET_ROLES, 'SYSTEM_ADMIN'];

export const isAdmin = (actor: Actor) => actor.roles.includes('SYSTEM_ADMIN');
export const canViewAll = (actor: Actor) => hasAnyRole(actor.roles, VIEW_ALL_ROLES);
export const canSeeFinance = (actor: Actor) => hasAnyRole(actor.roles, FINANCE_VIEW_ROLES);
export const isFinance = (actor: Actor) => hasAnyRole(actor.roles, FINANCE_ROLES) || isAdmin(actor);
export const isFleetAdmin = (actor: Actor) => hasAnyRole(actor.roles, FLEET_ADMIN_ROLES);

export function isOwner(actor: Actor, req: Pick<TravelRequest, 'requesterId' | 'travellers' | 'travellerIds'>): boolean {
  return req.requesterId === actor.uid || (req.travellerIds ?? req.travellers.map((t) => t.userId)).includes(actor.uid);
}

/** Roles held by the actor that intersect a stage's roles. */
export function stageRolesHeld(roles: readonly Role[], stageRoles: readonly Role[]): Role[] {
  return stageRoles.filter((r) => roles.includes(r));
}

/** Supervisor stage is scoped: the request's supervisor, or a supervisor-role holder from the same unit. */
export function supervisorScopeOk(actor: Actor, req: Pick<TravelRequest, 'supervisorId' | 'unitId'>): boolean {
  if (req.supervisorId && req.supervisorId === actor.uid) return true;
  return !!req.unitId && actor.profile.unitId === req.unitId;
}

/** Sync visibility rule (no delegation lookup): owner, supervisor, unit supervisor, anyone on the chain, or view-all roles. */
export function canViewRequest(actor: Actor, req: TravelRequest): boolean {
  if (canViewAll(actor) || isOwner(actor, req)) return true;
  if (req.supervisorId === actor.uid) return true;
  if (hasAnyRole(actor.roles, ['UNIT_SUPERVISOR', 'PROJECT_MANAGER', 'HEAD_OF_DEPARTMENT']) && req.unitId && req.unitId === actor.profile.unitId) return true;
  if (hasAnyRole(actor.roles, ['HEAD_OF_DEPARTMENT']) && req.departmentId && req.departmentId === actor.profile.departmentId) return true;
  if (hasAnyRole(actor.roles, ['COST_CENTRE_OWNER']) && req.costCentreId && (actor.profile.costCentreIds ?? []).includes(req.costCentreId)) return true;
  const stages = req.workflow?.stages ?? [];
  return stages.some((s) => stageRolesHeld(actor.roles, s.roles).length > 0 && (s.key !== 'supervisor' || supervisorScopeOk(actor, req)));
}
