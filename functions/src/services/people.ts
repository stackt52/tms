import type { Role, UserProfile } from '@tms/shared';
import { COL, db } from '../lib/firebase';
import { getDoc, getMany, runQuery } from '../lib/query';

export type PersonPick = Pick<UserProfile, 'id' | 'displayName' | 'initials' | 'avatarTone'>;

export async function getProfile(uid: string | undefined | null): Promise<UserProfile | null> {
  if (!uid) return null;
  return getDoc<UserProfile>(COL.users, uid);
}

export async function getProfiles(ids: readonly (string | undefined | null)[]): Promise<Map<string, UserProfile>> {
  return getMany<UserProfile>(COL.users, ids.filter(Boolean) as string[]);
}

/** Active users holding any of the given roles (array-contains-any; ≤30 roles). */
export async function usersWithRoles(roles: readonly Role[]): Promise<UserProfile[]> {
  if (!roles.length) return [];
  const users = await runQuery<UserProfile>(db.collection(COL.users).where('roles', 'array-contains-any', [...roles].slice(0, 30)), 200);
  return users.filter((u) => u.active !== false);
}

export async function userIdsWithRoles(roles: readonly Role[]): Promise<string[]> {
  return (await usersWithRoles(roles)).map((u) => u.id);
}

export function pick(p: UserProfile): PersonPick {
  return { id: p.id, displayName: p.displayName, initials: p.initials, avatarTone: p.avatarTone };
}

export async function peopleMap(ids: readonly (string | undefined | null)[]): Promise<Record<string, PersonPick>> {
  const map = await getProfiles(ids);
  const out: Record<string, PersonPick> = {};
  for (const [id, p] of map) out[id] = pick(p);
  return out;
}

/** "T. Mulenga" style short name used in chain labels and notifications. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]![0]!}. ${parts[parts.length - 1]!}`;
}
