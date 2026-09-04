import type { AdminOverview, CostCentre, CreateRateBody, CreateUserBody, CreateUserResponse, CreateWorkflowVersionBody, Department, Location, PolicyConfig, Project, Rate, Unit, UpdateUserBody, UserProfile, Vehicle, Vendor, WorkflowDefinition } from '@tms/shared';
import { RATE_KEY_LABELS, addDays, initialsOf, isoDate } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, auth, db, nowIso } from '../lib/firebase';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { audit } from '../lib/audit';
import { byAsc, byDesc, getAllDocs, getDoc } from '../lib/query';
import { POLICY_DOC_ID, invalidateConfig, loadConfig } from './config';
import { loadMasterData } from './masterData';

export async function overview(): Promise<AdminOverview> {
  const [cfg, md, vendors, users, vehicles] = await Promise.all([loadConfig(true), loadMasterData(), getAllDocs<Vendor>(COL.vendors), getAllDocs<UserProfile>(COL.users), getAllDocs<Vehicle>(COL.vehicles)]);
  return {
    rates: cfg.rates.sort(byDesc((r) => `${r.key}|${r.effectiveFrom}`)),
    workflows: cfg.workflows.sort(byAsc((w) => `${w.category}|${String(w.version).padStart(3, '0')}`)),
    policy: cfg.policy,
    vendors,
    users: users.sort(byAsc((u) => u.displayName)),
    masterData: { departments: md.departments, units: md.units, projects: md.projects, costCentres: md.costCentres, locations: md.locations, vehicles },
  };
}

// ---------- rates ----------

export async function listRates(): Promise<Rate[]> {
  return (await loadConfig(true)).rates.sort(byDesc((r) => `${r.key}|${r.effectiveFrom}`));
}

export async function createRate(actor: Actor, body: CreateRateBody): Promise<Rate> {
  if (!(body.value > 0)) throw unprocessable('VALIDATION', 'Rate value must be greater than zero');
  if (body.effectiveTo && body.effectiveTo < body.effectiveFrom) throw unprocessable('VALIDATION', 'effectiveTo must be on or after effectiveFrom');
  const existing = (await loadConfig(true)).rates.filter((r) => r.key === body.key);
  const ref = db.collection(COL.rates).doc();
  const rate: Rate = {
    id: ref.id,
    key: body.key,
    label: RATE_KEY_LABELS[body.key],
    value: body.value,
    unit: body.unit,
    effectiveFrom: body.effectiveFrom,
    effectiveTo: body.effectiveTo ?? null,
    note: body.note,
    version: existing.length + 1,
    createdBy: actor.uid,
    createdAt: nowIso(),
  };
  const batch = db.batch();
  batch.set(ref, rate);
  // Close the currently open rate the day before the new one starts (effective-dated history, SRS §23.3).
  for (const prev of existing) {
    if (!prev.effectiveTo && prev.effectiveFrom < body.effectiveFrom) {
      batch.set(db.collection(COL.rates).doc(prev.id), { effectiveTo: isoDate(addDays(body.effectiveFrom, -1)) }, { merge: true });
    }
  }
  await batch.commit();
  invalidateConfig();
  await audit(actor, { entityType: 'rate', entityId: rate.id, action: 'CREATED', newValue: rate });
  return rate;
}

export async function patchRate(actor: Actor, id: string, body: { note?: string; effectiveTo?: string | null }): Promise<Rate> {
  const rate = await getDoc<Rate>(COL.rates, id);
  if (!rate) throw notFound('Rate');
  if (body.effectiveTo && body.effectiveTo < rate.effectiveFrom) throw unprocessable('VALIDATION', 'effectiveTo must be on or after effectiveFrom');
  const next: Rate = { ...rate, note: body.note ?? rate.note, effectiveTo: body.effectiveTo === undefined ? rate.effectiveTo : body.effectiveTo };
  await db.collection(COL.rates).doc(id).set(next);
  invalidateConfig();
  await audit(actor, { entityType: 'rate', entityId: id, action: 'UPDATED', oldValue: rate, newValue: next });
  return next;
}

// ---------- workflows ----------

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  return (await loadConfig(true)).workflows.sort(byAsc((w) => `${w.category}|${String(w.version).padStart(3, '0')}`));
}

export async function createWorkflowVersion(actor: Actor, body: CreateWorkflowVersionBody): Promise<WorkflowDefinition> {
  if (!body.stages.length) throw unprocessable('VALIDATION', 'A workflow needs at least one stage');
  for (const s of body.stages) if (!s.key || !s.label || !s.roles?.length || !s.status) throw unprocessable('VALIDATION', `Stage ${s.key || '?'} needs key, label, roles and status`);
  const all = (await loadConfig(true)).workflows.filter((w) => w.category === body.category);
  const version = all.reduce((m, w) => Math.max(m, w.version), 0) + 1;
  const id = `wf-${body.category.toLowerCase().replace(/_/g, '-')}-v${version}`;
  const wf: WorkflowDefinition = {
    id,
    category: body.category,
    name: body.name ?? all.find((w) => w.active)?.name ?? body.category,
    version,
    stages: body.stages,
    active: true,
    effectiveFrom: isoDate(new Date()),
    createdAt: nowIso(),
    createdBy: actor.uid,
    note: body.note,
  };
  const batch = db.batch();
  for (const prev of all) if (prev.active) batch.set(db.collection(COL.workflows).doc(prev.id), { active: false }, { merge: true });
  batch.set(db.collection(COL.workflows).doc(id), wf);
  await batch.commit();
  invalidateConfig();
  await audit(actor, { entityType: 'workflow', entityId: id, action: 'VERSION_CREATED', newValue: { category: wf.category, version, stages: wf.stages.map((s) => s.key) } });
  return wf;
}

// ---------- policy ----------

const NUMERIC_POLICY_KEYS = ['distanceThresholdKm', 'hoursThreshold', 'liquidationDeadlineDays', 'advanceLeadTimeWorkingDays', 'procurementLeadTimeWorkingDays', 'internationalNoticeDays', 'meetingNoticeWorkingDays', 'eventNoticeWorkingDays', 'lateInternationalClaimDays'] as const;

export async function patchPolicy(actor: Actor, patch: Partial<PolicyConfig>): Promise<PolicyConfig> {
  const current = (await loadConfig(true)).policy;
  for (const k of NUMERIC_POLICY_KEYS) {
    const v = patch[k];
    if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v > 0)) throw unprocessable('VALIDATION', `${k} must be a number greater than zero`);
  }
  const next: PolicyConfig = {
    ...current,
    ...patch,
    toggles: { ...current.toggles, ...(patch.toggles ?? {}) },
    publicHolidaysMMDD: patch.publicHolidaysMMDD ?? current.publicHolidaysMMDD,
    updatedAt: nowIso(),
    updatedBy: actor.uid,
  };
  await db.collection(COL.policies).doc(POLICY_DOC_ID).set(next);
  invalidateConfig();
  await audit(actor, { entityType: 'policy', entityId: POLICY_DOC_ID, action: 'UPDATED', oldValue: current, newValue: next });
  return next;
}

// ---------- vendors / users / master data ----------

export async function upsertVendor(actor: Actor, body: Partial<Vendor>, id?: string): Promise<Vendor> {
  const existing = id ? await getDoc<Vendor>(COL.vendors, id) : null;
  if (id && !existing) throw notFound('Vendor');
  const vendorId = id ?? body.id ?? db.collection(COL.vendors).doc().id;
  const v: Vendor = { active: true, ...existing, ...body, id: vendorId } as Vendor;
  if (!v.name || !v.category) throw unprocessable('VALIDATION', 'name and category are required');
  await db.collection(COL.vendors).doc(vendorId).set(v);
  await audit(actor, { entityType: 'vendor', entityId: vendorId, action: existing ? 'UPDATED' : 'CREATED', oldValue: existing ?? undefined, newValue: v });
  return v;
}

const AVATAR_TONES: UserProfile['avatarTone'][] = ['deep', 'secondary', 'tertiary', 'warning'];

/**
 * Sends Firebase's built-in "reset password" email, which doubles as the set-password invite for a
 * freshly created account. Uses the public web API key (functions/.env WEB_API_KEY); against the Auth
 * emulator the mail is printed in the emulator log instead of being delivered.
 */
async function sendSetPasswordEmail(email: string): Promise<boolean> {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const key = emulator ? 'emulator' : process.env.WEB_API_KEY;
  if (!key) {
    console.warn('[admin] WEB_API_KEY not configured; invite email skipped');
    return false;
  }
  const base = emulator ? `http://${emulator}` : 'https://identitytoolkit.googleapis.com';
  try {
    const res = await fetch(`${base}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    });
    if (!res.ok) console.warn('[admin] invite email failed', res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.warn('[admin] invite email failed', (e as Error).message);
    return false;
  }
}

/** Admin → Users & roles → Add user: creates the Auth account (no password), profile, claims and invite. */
export async function createUser(actor: Actor, body: CreateUserBody): Promise<CreateUserResponse> {
  const email = body.email.trim().toLowerCase();
  const displayName = body.displayName.trim();
  let uid: string;
  let existedInAuth = false;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    existedInAuth = true;
    const profile = await getDoc<UserProfile>(COL.users, uid);
    if (profile) throw conflict('USER_EXISTS', `${email} already has a TMS profile (${profile.displayName}). Edit it instead.`);
  } catch (e) {
    if ((e as { status?: number }).status === 409) throw e;
    const created = await auth.createUser({ email, displayName, emailVerified: false, disabled: false });
    uid = created.uid;
  }
  const profile: UserProfile = {
    id: uid,
    email,
    displayName,
    initials: initialsOf(displayName),
    avatarTone: AVATAR_TONES[Math.abs([...uid].reduce((h, c) => h + c.charCodeAt(0), 0)) % AVATAR_TONES.length]!,
    roles: body.roles,
    title: body.title,
    departmentId: body.departmentId,
    unitId: body.unitId,
    supervisorId: body.supervisorId,
    dutyStationId: body.dutyStationId,
    costCentreIds: body.costCentreIds ?? [],
    province: body.province,
    phone: body.phone,
    active: true,
    createdAt: nowIso(),
  };
  await db.collection(COL.users).doc(uid).set(profile);
  await auth.setCustomUserClaims(uid, { roles: body.roles }).catch((e: unknown) => console.warn('[admin] custom claims not set', (e as Error).message));
  let setupLink: string | undefined;
  try {
    setupLink = await auth.generatePasswordResetLink(email);
  } catch (e) {
    console.warn('[admin] could not generate set-password link', (e as Error).message);
  }
  const inviteSent = body.sendInvite === false ? false : await sendSetPasswordEmail(email);
  await audit(actor, { entityType: 'user', entityId: uid, action: 'CREATED', newValue: { email, roles: body.roles, inviteSent, existedInAuth } });
  return { user: profile, inviteSent, setupLink, existedInAuth };
}

export async function updateUser(actor: Actor, id: string, body: UpdateUserBody): Promise<UserProfile> {
  const user = await getDoc<UserProfile>(COL.users, id);
  if (!user) throw notFound('User');
  const next: UserProfile = { ...user, ...body };
  await db.collection(COL.users).doc(id).set(next);
  if (body.roles) {
    // Mirror roles into custom claims so clients can pre-render capabilities; authorisation stays server-side.
    await auth.setCustomUserClaims(id, { roles: body.roles }).catch((e: unknown) => console.warn('[admin] custom claims not updated', (e as Error).message));
  }
  await audit(actor, { entityType: 'user', entityId: id, action: 'UPDATED', oldValue: { roles: user.roles, active: user.active }, newValue: body });
  return next;
}

type MasterKind = 'departments' | 'units' | 'projects' | 'cost-centres' | 'locations';
const MASTER_COL: Record<MasterKind, string> = { departments: COL.departments, units: COL.units, projects: COL.projects, 'cost-centres': COL.costCentres, locations: COL.locations };
type MasterDoc = Department | Unit | Project | CostCentre | Location;

export async function upsertMaster(actor: Actor, kind: MasterKind, body: Record<string, unknown>, id?: string): Promise<MasterDoc> {
  const col = MASTER_COL[kind];
  const existing = id ? await getDoc<MasterDoc>(col, id) : null;
  if (id && !existing) throw notFound(kind);
  const docId = id ?? (typeof body.id === 'string' && body.id ? body.id : db.collection(col).doc().id);
  const next = { ...(existing ?? {}), ...body, id: docId } as MasterDoc;
  if (!('name' in next) || !next.name) throw unprocessable('VALIDATION', 'name is required');
  if (kind === 'locations') {
    const loc = next as Location;
    if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') throw unprocessable('VALIDATION', 'lat and lng are required');
    loc.country = loc.country ?? 'ZM';
    loc.isDutyStation = !!loc.isDutyStation;
  }
  if (kind === 'projects') (next as Project).active = (next as Project).active ?? true;
  await db.collection(col).doc(docId).set(next);
  invalidateConfig();
  await audit(actor, { entityType: kind, entityId: docId, action: existing ? 'UPDATED' : 'CREATED', oldValue: existing ?? undefined, newValue: next });
  return next;
}
