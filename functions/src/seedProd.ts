/* eslint-disable no-console */
/**
 * Production bootstrap: writes organisation master data, effective-dated rates, workflow definitions
 * and the policy document (idempotent merge — never clears anything), and creates the first
 * SYSTEM_ADMIN user. No demo requests, trips or people are created.
 *
 *   npm run seed:prod -w functions -- --project <id> --admin-email you@org --admin-name "Your Name" --yes [--api-key <webApiKey>]
 */
import { ADMIN_EMAIL, ADMIN_NAME, CLI_USER, PROJECT_ID, WEB_API_KEY } from './seedProdEnv';
import { ROLES, initialsOf, type UserProfile } from '@tms/shared';
import { db, auth, COL, nowIso } from './lib/firebase';
import { departments, units, projects, costCentres, locations, vendors, vehicles, rates, workflows, policy } from './seedConfig';

async function upsertAll<T extends { id: string }>(col: string, docs: T[]): Promise<number> {
  const batch = db.batch();
  for (const d of docs) batch.set(db.collection(col).doc(d.id), d, { merge: true });
  await batch.commit();
  return docs.length;
}

/** Demo person ids (u-*) don't exist in production — drop those references. */
const noPeople = <T extends object>(obj: T, keys: (keyof T)[]): T => {
  const copy: T = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
};

async function ensureAdmin(): Promise<UserProfile | null> {
  if (!ADMIN_EMAIL) return null;
  let user;
  try {
    user = await auth.getUserByEmail(ADMIN_EMAIL);
    console.log(`  admin user exists: ${user.uid}`);
  } catch {
    user = await auth.createUser({ email: ADMIN_EMAIL, displayName: ADMIN_NAME, emailVerified: true });
    console.log(`  created admin auth user: ${user.uid} (no password set — use the reset link to choose one)`);
  }
  const allRoles = [...ROLES];
  await auth.setCustomUserClaims(user.uid, { roles: allRoles });
  const existing = await db.collection(COL.users).doc(user.uid).get();
  const profile: UserProfile = {
    ...(existing.exists ? (existing.data() as UserProfile) : {}),
    id: user.uid,
    email: ADMIN_EMAIL,
    displayName: ADMIN_NAME,
    initials: initialsOf(ADMIN_NAME),
    avatarTone: 'deep',
    roles: allRoles,
    title: 'System Administrator',
    dutyStationId: 'loc-lusaka-hq',
    province: 'Lusaka',
    active: true,
    createdAt: existing.exists ? (existing.data() as UserProfile).createdAt : nowIso(),
  };
  await db.collection(COL.users).doc(user.uid).set(profile, { merge: true });

  if (WEB_API_KEY) {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${WEB_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: ADMIN_EMAIL }),
    });
    console.log(res.ok ? `  password-setup email sent to ${ADMIN_EMAIL}` : `  could not send password email: ${res.status} ${await res.text()}`);
  }
  return profile;
}

async function main(): Promise<void> {
  console.log(`Bootstrapping production config for ${PROJECT_ID} as ${CLI_USER}`);
  const stamp = nowIso();
  const admin = await ensureAdmin();
  const by = admin?.id ?? 'bootstrap';

  const n = {
    departments: await upsertAll(COL.departments, departments.map((d) => noPeople(d, ['hodId']))),
    units: await upsertAll(COL.units, units.map((u) => noPeople(u, ['supervisorId']))),
    projects: await upsertAll(COL.projects, projects.map((p) => noPeople(p, ['managerId', 'directorId']))),
    costCentres: await upsertAll(COL.costCentres, costCentres.map((c) => noPeople(c, ['ownerId']))),
    locations: await upsertAll(COL.locations, locations),
    vendors: await upsertAll(COL.vendors, vendors),
    vehicles: await upsertAll(COL.vehicles, vehicles.map((v) => noPeople(v, ['assignedDriverId', 'assignedDriverName']))),
    rates: await upsertAll(COL.rates, rates.map((r) => ({ ...r, createdBy: by, createdAt: stamp }))),
    workflows: await upsertAll(COL.workflows, workflows.map((w) => ({ ...w, createdBy: by, createdAt: stamp }))),
  };
  await db.collection(COL.policies).doc('current').set({ ...policy, updatedAt: stamp, updatedBy: by }, { merge: true });
  console.log('  written:', JSON.stringify({ ...n, policy: 1 }));
  console.log('Done. Rates, workflows and policy are editable under Admin in the app; assign HODs, supervisors and cost-centre owners under Admin → Master data once staff accounts exist.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
