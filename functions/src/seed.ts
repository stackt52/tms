/* eslint-disable no-console */
import './seedEnv';
import type {
  AdvanceRecord,
  ApprovalRecord,
  Attachment,
  AuditEvent,
  CostCategory,
  CostCentre,
  CostLine,
  Department,
  ExpenseLine,
  ExternalParticipant,
  ExternalParticipantLine,
  ExternalPaymentRequest,
  Liquidation,
  Location,
  MileageClaim,
  Notification,
  PolicyConfig,
  Project,
  Rate,
  RequestStatus,
  Role,
  TransportMode,
  TravelCategory,
  TravelRequest,
  Trip,
  Unit,
  UserProfile,
  Vehicle,
  VehicleBooking,
  Vendor,
  WorkflowDefinition,
} from '@tms/shared';
import { DEFAULT_POLICY, DEFAULT_WORKFLOWS, ROLES, computeCosting, computeEligibility, computeExternalLine, effectiveRate, estimateRoadKm, initialsOf, liquidationDueDate, nightsBetween, reconcile, summariseExternal, workflowForCategory } from '@tms/shared';
import { auth, COL, db, storage } from './lib/firebase';

// ---------- anchor + helpers ----------

/** All demo dates are relative to this anchor so numbers match the mockups. */
const TODAY = '2026-09-03';
const PASSWORD = 'Password123!';
const YEAR = 2026;

/** Zambia local time (CAT, UTC+2) → ISO UTC. */
const cat = (date: string, time = '08:00') => new Date(`${date}T${time}:00+02:00`).toISOString();
const seqOf = (id: string) => Number(id.split('-')[2]);
let idCounter = 0;
const sid = (prefix: string) => `${prefix}-${String(++idCounter).padStart(3, '0')}`;

// ---------- people ----------

interface PersonSpec {
  uid: string;
  name: string;
  roles: Role[];
  email?: string;
  title?: string;
  tone?: UserProfile['avatarTone'];
  departmentId?: string;
  unitId?: string;
  projectIds?: string[];
  costCentreIds?: string[];
  supervisorId?: string;
  province?: string;
  licence?: string;
  phone?: string;
  bank?: UserProfile['bank'];
  mobileMoney?: UserProfile['mobileMoney'];
}

const PEOPLE: PersonSpec[] = [
  { uid: 'u-chanda', name: 'Chanda Mwansa', roles: ['TRAVELLER'], title: 'Health Systems Officer', tone: 'deep', departmentId: 'dept-programmes', unitId: 'unit-hsu', projectIds: ['GHSC-Z'], costCentreIds: ['CC-114'], supervisorId: 'u-thandiwe', province: 'Lusaka', licence: '2028-03-31', phone: '+260 97 712 3456', bank: { bankName: 'Zanaco', accountMasked: '···2210' }, mobileMoney: { provider: 'AIRTEL', numberMasked: '···3456' } },
  { uid: 'u-mercy', name: 'Mercy Tembo', roles: ['TRAVELLER'], title: 'M&E Officer', tone: 'tertiary', departmentId: 'dept-programmes', unitId: 'unit-me', projectIds: ['GHSC-Z'], costCentreIds: ['CC-114'], supervisorId: 'u-thandiwe', province: 'Lusaka', phone: '+260 96 601 2288' },
  { uid: 'u-joseph', name: 'Joseph Banda', roles: ['TRAVELLER'], title: 'Cold Chain Specialist', tone: 'secondary', departmentId: 'dept-programmes', unitId: 'unit-hsu', projectIds: ['MCH-Z'], costCentreIds: ['CC-108'], supervisorId: 'u-thandiwe', province: 'Lusaka' },
  { uid: 'u-natasha', name: 'Natasha Zulu', roles: ['TRAVELLER'], title: 'Partnerships Lead', tone: 'warning', departmentId: 'dept-programmes', unitId: 'unit-me', projectIds: ['GHSC-Z'], costCentreIds: ['CC-114'], supervisorId: 'u-thandiwe', province: 'Lusaka' },
  { uid: 'u-kelvin', name: 'Kelvin Phiri', roles: ['TRAVELLER'], title: 'Community Health Coordinator', tone: 'deep', departmentId: 'dept-programmes', unitId: 'unit-hsu', projectIds: ['MCH-Z'], costCentreIds: ['CC-108'], supervisorId: 'u-thandiwe', province: 'Lusaka', licence: '2028-03-31' },
  { uid: 'u-thandiwe', name: 'Thandiwe Mulenga', roles: ['UNIT_SUPERVISOR', 'TRAVELLER'], title: 'Unit Supervisor · Health Systems & M&E', tone: 'secondary', departmentId: 'dept-programmes', unitId: 'unit-hsu', projectIds: ['GHSC-Z'], costCentreIds: ['CC-114'], supervisorId: 'u-bwalya', province: 'Lusaka' },
  { uid: 'u-bwalya', name: 'Bwalya Kapaya', roles: ['HEAD_OF_DEPARTMENT', 'COST_CENTRE_OWNER', 'TRAVELLER'], title: 'Head of Programmes', tone: 'tertiary', departmentId: 'dept-programmes', unitId: 'unit-hsu', projectIds: ['GHSC-Z', 'MCH-Z'], costCentreIds: ['CC-114', 'CC-108'], supervisorId: 'u-mwaba', province: 'Lusaka' },
  { uid: 'u-lombe', name: 'Lombe Musonda', roles: ['FINANCE_ACCOUNTANT', 'TRAVELLER'], title: 'Finance Accountant', tone: 'deep', departmentId: 'dept-finops', unitId: 'unit-finance', costCentreIds: ['CC-108', 'CC-101'], supervisorId: 'u-ruth', province: 'Lusaka' },
  { uid: 'u-ruth', name: 'Ruth Sakala', roles: ['FINANCE_DIRECTOR'], title: 'Finance Director', tone: 'warning', departmentId: 'dept-finops', unitId: 'unit-finance', supervisorId: 'u-kunda', province: 'Lusaka' },
  { uid: 'u-mwaba', name: 'Mwaba Simukonda', roles: ['PROJECT_DIRECTOR'], title: 'Project Director', tone: 'secondary', departmentId: 'dept-programmes', supervisorId: 'u-kunda', province: 'Lusaka' },
  { uid: 'u-kunda', name: 'Kunda Mwale', roles: ['CEO'], title: 'Chief Executive Officer', tone: 'deep', province: 'Lusaka' },
  { uid: 'u-precious', name: 'Precious Lungu', roles: ['PROCUREMENT_OFFICER'], title: 'Procurement Officer', tone: 'tertiary', departmentId: 'dept-finops', unitId: 'unit-finance', supervisorId: 'u-ruth', province: 'Lusaka' },
  { uid: 'u-grace', name: 'Grace Nkonde', roles: ['OFFICE_MANAGEMENT', 'FLEET_ADMIN'], title: 'Office Manager', tone: 'warning', departmentId: 'dept-finops', unitId: 'unit-finance', supervisorId: 'u-ruth', province: 'Lusaka' },
  { uid: 'u-elias', name: 'Elias Chirwa', roles: ['TRAVELLER'], title: 'Driver', tone: 'secondary', departmentId: 'dept-finops', unitId: 'unit-finance', supervisorId: 'u-grace', province: 'Lusaka', licence: '2029-06-30' },
  { uid: 'u-admin', name: 'System Administrator', email: 'admin@ihm.org.zm', roles: [...ROLES], title: 'System Administrator (demo — every role)', tone: 'deep', departmentId: 'dept-finops', unitId: 'unit-finance', costCentreIds: ['CC-114', 'CC-108', 'CC-101'], province: 'Lusaka' },
];
const emailOf = (p: PersonSpec) => p.email ?? `${p.name.toLowerCase().replace(/\s+/g, '.')}@ihm.org.zm`;
const P = Object.fromEntries(PEOPLE.map((p) => [p.uid, p])) as Record<string, PersonSpec>;

function profileOf(p: PersonSpec): UserProfile {
  return {
    id: p.uid,
    email: emailOf(p),
    displayName: p.name,
    initials: initialsOf(p.name),
    avatarTone: p.tone ?? 'deep',
    roles: p.roles,
    title: p.title,
    departmentId: p.departmentId,
    unitId: p.unitId,
    projectIds: p.projectIds,
    costCentreIds: p.costCentreIds,
    dutyStationId: 'loc-lusaka-hq',
    province: p.province,
    supervisorId: p.supervisorId,
    phone: p.phone,
    driverLicenceExpiry: p.licence,
    bank: p.bank,
    mobileMoney: p.mobileMoney,
    active: true,
    createdAt: cat('2026-01-05'),
  };
}

// ---------- org + master data ----------

const departments: Department[] = [
  { id: 'dept-programmes', name: 'Programmes', hodId: 'u-bwalya' },
  { id: 'dept-finops', name: 'Finance & Operations', hodId: 'u-ruth' },
];
const units: Unit[] = [
  { id: 'unit-hsu', name: 'Health Systems Unit', departmentId: 'dept-programmes', supervisorId: 'u-thandiwe' },
  { id: 'unit-me', name: 'M&E Unit', departmentId: 'dept-programmes', supervisorId: 'u-thandiwe' },
  { id: 'unit-finance', name: 'Finance', departmentId: 'dept-finops', supervisorId: 'u-ruth' },
];
const projects: Project[] = [
  { id: 'GHSC-Z', name: 'Global Health Supply Chain – Zambia', managerId: 'u-thandiwe', directorId: 'u-mwaba', active: true },
  { id: 'MCH-Z', name: 'Maternal & Child Health Zambia', managerId: 'u-thandiwe', directorId: 'u-mwaba', active: true },
];
const costCentres: CostCentre[] = [
  { id: 'CC-114', name: 'GHSC-Z field operations', ownerId: 'u-bwalya', projectId: 'GHSC-Z', fundingSource: 'PROJECT', budget: 1_850_000 },
  { id: 'CC-108', name: 'MCH-Z community outreach', ownerId: 'u-bwalya', projectId: 'MCH-Z', fundingSource: 'PROJECT', budget: 1_200_000 },
  { id: 'CC-101', name: 'Overhead', ownerId: 'u-ruth', fundingSource: 'OVERHEAD', budget: 640_000 },
];
const loc = (id: string, name: string, town: string, province: string, lat: number, lng: number, extra: Partial<Location> = {}): Location => ({ id, name, town, province, country: 'ZM', lat, lng, isDutyStation: false, ...extra });
const locations: Location[] = [
  loc('loc-lusaka-hq', 'Lusaka — IHM HQ, Ibex Hill', 'Lusaka', 'Lusaka', -15.418, 28.362, { isDutyStation: true }),
  loc('loc-ndola', 'Ndola — Copperbelt PHO', 'Ndola', 'Copperbelt', -12.968, 28.633),
  loc('loc-livingstone', 'Livingstone — Southern PHO', 'Livingstone', 'Southern', -17.853, 25.861),
  loc('loc-kabwe', 'Kabwe — Central PHO', 'Kabwe', 'Central', -14.446, 28.446),
  loc('loc-solwezi', 'Solwezi — North-Western PHO', 'Solwezi', 'North-Western', -12.173, 26.389),
  loc('loc-chipata', 'Chipata — Eastern PHO', 'Chipata', 'Eastern', -13.639, 32.646),
  loc('loc-kasama', 'Kasama — Northern PHO', 'Kasama', 'Northern', -10.213, 31.181),
  loc('loc-mongu', 'Mongu — Western PHO', 'Mongu', 'Western', -15.254, 23.131),
  loc('loc-kafue', 'Kafue District Hospital', 'Kafue', 'Lusaka', -15.769, 28.181),
  loc('loc-chongwe', 'Chongwe DHO', 'Chongwe', 'Lusaka', -15.329, 28.682),
  loc('loc-choma', 'Choma — District Health Office', 'Choma', 'Southern', -16.809, 26.952),
  loc('loc-mansa', 'Mansa — Luapula PHO', 'Mansa', 'Luapula', -11.199, 28.894),
  loc('loc-geneva', 'Geneva — WHO HQ', 'Geneva', 'Geneva', 46.232, 6.134, { country: 'CH' }),
];
const LOC = Object.fromEntries(locations.map((l) => [l.id, l])) as Record<string, Location>;
const vendors: Vendor[] = [
  { id: 'ven-proflight', name: 'Proflight Zambia', category: 'AIRLINE', contact: 'reservations@proflight-zambia.com', locations: ['Lusaka', 'Ndola', 'Livingstone', 'Solwezi', 'Mansa'], contractValidTo: '2027-03-31', active: true },
  { id: 'ven-voyagers', name: 'Voyagers Travel', category: 'TRAVEL_AGENT', contact: 'ihm@voyagerszambia.com', locations: ['Lusaka'], contractValidTo: '2027-06-30', active: true },
  { id: 'ven-protea-ndola', name: 'Protea Hotel Ndola', category: 'HOTEL', contact: '+260 212 621 555', locations: ['Ndola'], contractValidTo: '2026-12-31', active: true, approvedRate: 'ZMW 1,450/night B&B' },
  { id: 'ven-avani', name: 'Avani Victoria Falls', category: 'HOTEL', contact: '+260 213 321 122', locations: ['Livingstone'], contractValidTo: '2026-12-31', active: true, approvedRate: 'ZMW 2,150/night B&B' },
  { id: 'ven-avis', name: 'Avis Zambia', category: 'CAR_RENTAL', contact: 'lusaka@avis.co.zm', locations: ['Lusaka', 'Ndola', 'Livingstone'], contractValidTo: '2027-01-31', active: true, approvedRate: 'ZMW 1,650/day 4×4 incl. super waiver' },
  { id: 'ven-europcar', name: 'Europcar Zambia', category: 'CAR_RENTAL', contact: 'bookings@europcar.co.zm', locations: ['Lusaka', 'Ndola'], contractValidTo: '2026-11-30', active: true },
  { id: 'ven-ndola-shuttle', name: 'Ndola Airport Shuttle', category: 'SHUTTLE', contact: '+260 97 555 0101', locations: ['Ndola'], active: true, approvedRate: 'ZMW 300/transfer' },
];
const vehicles: Vehicle[] = [
  { id: 'veh-landcruiser', make: 'Toyota', model: 'Land Cruiser', year: 2022, registration: 'BAD 4721', officeId: 'loc-lusaka-hq', projectId: 'GHSC-Z', odometerKm: 84_310, status: 'AVAILABLE', assignedDriverId: 'u-elias', assignedDriverName: 'Elias Chirwa' },
  { id: 'veh-hilux', make: 'Toyota', model: 'Hilux', year: 2023, registration: 'BAE 2287', officeId: 'loc-lusaka-hq', projectId: 'MCH-Z', odometerKm: 41_902, status: 'AVAILABLE' },
  { id: 'veh-xtrail', make: 'Nissan', model: 'X-Trail', year: 2019, registration: 'BAC 9915', officeId: 'loc-lusaka-hq', odometerKm: 112_076, status: 'IN_SERVICE', serviceNote: 'brake overhaul', serviceDueBack: '2026-09-15' },
  { id: 'veh-corolla', make: 'Toyota', model: 'Corolla Cross', year: 2024, registration: 'BAF 0533', officeId: 'loc-lusaka-hq', odometerKm: 18_449, status: 'AVAILABLE' },
];

const rate = (id: string, key: Rate['key'], value: number, unit: Rate['unit'], effectiveFrom: string, extra: Partial<Rate> = {}): Rate => ({
  id,
  key,
  label: ({ ADVANCE_PERCENTAGE: 'Travel advance percentage', MILEAGE_RATE: 'Mileage rate (POV)', EXTERNAL_TRANSPORT_ALLOWANCE: 'External transport allowance', EXTERNAL_DSA: 'External DSA — GRZ/PSMD band A', EXTERNAL_LUNCH: 'External lunch allowance', PER_DIEM_DOMESTIC: 'Per diem — domestic overnight', PER_DIEM_INTERNATIONAL: 'Per diem — international', STATIONERY_CAP: 'Workshop stationery cap' } as Record<Rate['key'], string>)[key],
  value,
  unit,
  effectiveFrom,
  effectiveTo: null,
  version: 1,
  createdBy: 'u-admin',
  createdAt: cat('2025-12-15'),
  ...extra,
});
const rates: Rate[] = [
  rate('rate-advance-2026', 'ADVANCE_PERCENTAGE', 75, 'PERCENT', '2026-01-01', { note: 'Travel SOP §11.2' }),
  rate('rate-mileage-2025', 'MILEAGE_RATE', 4.5, 'ZMW_PER_KM', '2025-01-01', { effectiveTo: '2025-12-31', note: 'Superseded 01 Jan 2026' }),
  rate('rate-mileage-2026', 'MILEAGE_RATE', 5, 'ZMW_PER_KM', '2026-01-01', { version: 2, note: 'Travel SOP §16 — ZMW 5.00/km' }),
  rate('rate-ext-transport-2026', 'EXTERNAL_TRANSPORT_ALLOWANCE', 150, 'ZMW_FLAT', '2026-01-01', { note: 'Flat local transport allowance, SOP §14.3' }),
  rate('rate-ext-dsa-2026q2', 'EXTERNAL_DSA', 440, 'ZMW_PER_DAY', '2026-04-01', { note: 'GRZ / PSMD circular B.4 of 2026' }),
  rate('rate-ext-lunch-2026q2', 'EXTERNAL_LUNCH', 60, 'ZMW_PER_DAY', '2026-04-01', { note: 'Host-site participants only; not before 12:00' }),
  rate('rate-stationery-2026', 'STATIONERY_CAP', 500, 'ZMW_CAP', '2026-01-01', { note: 'SOP §17.4' }),
  rate('rate-perdiem-dom-2026', 'PER_DIEM_DOMESTIC', 1200, 'ZMW_PER_NIGHT', '2026-01-01', { effectiveTo: '2026-09-30', note: 'Finance policy FP-2026-01' }),
  rate('rate-perdiem-dom-2026q4', 'PER_DIEM_DOMESTIC', 1300, 'ZMW_PER_NIGHT', '2026-10-01', { version: 2, note: 'Scheduled uplift — Finance memo 14 Aug 2026' }),
  rate('rate-perdiem-intl-2026', 'PER_DIEM_INTERNATIONAL', 220, 'USD_PER_NIGHT', '2026-01-01', { note: 'Per night, converted at BoZ mid-rate on payment date' }),
];
const workflows: WorkflowDefinition[] = DEFAULT_WORKFLOWS.map((w) => ({ ...w, createdAt: cat('2025-12-15'), createdBy: 'u-admin' }));
const policy: PolicyConfig = { ...DEFAULT_POLICY, updatedAt: cat('2026-01-01'), updatedBy: 'u-admin' };

// ---------- attachments (metadata + tiny placeholder bytes in the storage emulator) ----------

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const JPG_BYTES = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const attachments: Attachment[] = [];
let storageOk = true;
function att(id: string, name: string, kind: Attachment['kind'], uploadedBy: string, uploadedAt: string): Attachment {
  const isPdf = name.toLowerCase().endsWith('.pdf');
  const a: Attachment = {
    id,
    name,
    contentType: isPdf ? 'application/pdf' : 'image/jpeg',
    size: isPdf ? PDF_BYTES.length : JPG_BYTES.length,
    storagePath: `uploads/${uploadedBy}/${id}-${name.replace(/[^\w.\-]+/g, '_')}`,
    url: `/api/v1/files/${id}`,
    kind,
    uploadedBy,
    uploadedAt,
  };
  attachments.push(a);
  return a;
}

// ---------- travel request builder ----------

interface LineSpec {
  id?: string;
  category: CostCategory;
  label: string;
  quantity: number;
  unitCost: number;
  paidDirectly?: boolean;
  receiptRequired?: boolean;
  employeeContribution?: number;
}
interface ApprovalSpec {
  stageKey: string;
  by: string;
  at: string;
  decision?: ApprovalRecord['decision'];
  comment?: string;
}
interface TrvSpec {
  id: string;
  requester: string;
  title: string;
  purpose: string;
  description?: string;
  outcomes?: string;
  workPlanRef?: string;
  category: TravelCategory;
  projectId?: string;
  costCentreId: string;
  destinationId: string;
  stops?: string[];
  depart: string;
  ret: string;
  transport: TransportMode;
  transportJustification?: string;
  vehicleBookingId?: string;
  accommodation?: { ratePerNight: number; vendorId?: string; paidDirectly?: boolean };
  extraLines?: LineSpec[];
  perDiemRate?: number;
  status: RequestStatus;
  submittedAt?: string;
  approvals?: ApprovalSpec[];
  approvedAt?: string;
  advance?: AdvanceRecord | null;
  currentStageIndex?: number;
  wizard?: TravelRequest['wizard'];
  international?: TravelRequest['international'];
  attachments?: Attachment[];
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
}

const STAGE_ROLE: Record<string, Role> = { supervisor: 'UNIT_SUPERVISOR', hod_cc: 'HEAD_OF_DEPARTMENT', finance: 'FINANCE_ACCOUNTANT', finance_director: 'FINANCE_DIRECTOR', final: 'PROJECT_DIRECTOR', procurement: 'PROCUREMENT_OFFICER', cc_head: 'COST_CENTRE_OWNER' };
const CHECKLIST_ALL = { work_plan: true, prudent_days: true, no_weekends: true, dates_clear: true, per_diem_justified: true, activity_described: true, complete: true };

function approvalRecord(stages: WorkflowDefinition['stages'], a: ApprovalSpec): ApprovalRecord {
  const stage = stages.find((s) => s.key === a.stageKey)!;
  const person = P[a.by]!;
  const role = person.roles.find((r) => stage.roles.includes(r)) ?? STAGE_ROLE[a.stageKey]!;
  return { id: sid('apr'), stageKey: stage.key, stageLabel: stage.label, role, actorId: person.uid, actorName: person.name, decision: a.decision ?? 'APPROVED', comment: a.comment, checklist: stage.checklist ? CHECKLIST_ALL : undefined, requestVersion: 1, at: a.at };
}

function trv(s: TrvSpec): TravelRequest {
  const requester = P[s.requester]!;
  const wf = workflowForCategory(workflows, s.category)!;
  const nights = nightsBetween(s.depart, s.ret);
  const targets = [s.destinationId, ...(s.stops ?? [])].map((id) => LOC[id]!);
  const distanceKm = Math.max(...targets.map((t) => estimateRoadKm(LOC['loc-lusaka-hq']!, t)));
  const eligibility = computeEligibility({ distanceKm, departAt: s.depart, returnAt: s.ret, category: s.category, asOf: s.submittedAt ?? s.createdAt ?? cat(TODAY), policy });
  const perDiemRateDoc = effectiveRate(rates, s.category === 'INTERNATIONAL' ? 'PER_DIEM_INTERNATIONAL' : 'PER_DIEM_DOMESTIC', s.depart);
  const perDiemRate = s.perDiemRate ?? perDiemRateDoc?.value ?? 1200;
  const perDiemNights = eligibility.perDiemEligible ? nights : 0;
  const lines: CostLine[] = [];
  if (perDiemNights > 0) lines.push({ id: 'auto_per_diem', category: 'PER_DIEM', label: `Per diem · ${perDiemNights} night${perDiemNights === 1 ? '' : 's'}`, quantity: perDiemNights, unitCost: perDiemRate, amount: perDiemNights * perDiemRate, receiptRequired: false });
  if (s.accommodation) lines.push({ id: 'auto_accommodation', category: 'ACCOMMODATION', label: 'Accommodation', quantity: nights, unitCost: s.accommodation.ratePerNight, amount: nights * s.accommodation.ratePerNight, receiptRequired: true, paidDirectly: !!s.accommodation.paidDirectly });
  for (const l of s.extraLines ?? []) lines.push({ id: l.id ?? sid('line'), category: l.category, label: l.label, quantity: l.quantity, unitCost: l.unitCost, amount: l.quantity * l.unitCost, receiptRequired: l.receiptRequired ?? true, paidDirectly: l.paidDirectly, employeeContribution: l.employeeContribution });
  const costing = computeCosting(lines);
  const approvals = (s.approvals ?? []).map((a) => approvalRecord(wf.stages, a));
  const submitted = s.status !== 'DRAFT';
  const createdAt = s.createdAt ?? (s.submittedAt ? new Date(new Date(s.submittedAt).getTime() - 2 * 864e5).toISOString() : cat(TODAY, '07:30'));
  return {
    id: s.id,
    seq: seqOf(s.id),
    year: YEAR,
    requesterId: requester.uid,
    requesterName: requester.name,
    travellers: [{ userId: requester.uid, name: requester.name, initials: initialsOf(requester.name), departmentId: requester.departmentId, costCentreId: s.costCentreId, isLead: true }],
    isGroup: false,
    category: s.category,
    activityTitle: s.title,
    purpose: s.purpose,
    activityDescription: s.description ?? s.purpose,
    expectedOutcomes: s.outcomes ?? 'Activity report and agreed follow-up actions shared with the unit within 5 working days of return.',
    workPlanRef: s.workPlanRef ?? `WP-${YEAR}-${s.projectId ?? 'OH'}-${String(seqOf(s.id) % 40 + 1).padStart(2, '0')}`,
    justification: 'Activity cannot be delivered remotely; on-site presence required with district teams.',
    departmentId: requester.departmentId,
    unitId: requester.unitId,
    projectId: s.projectId,
    costCentreId: s.costCentreId,
    supervisorId: requester.supervisorId,
    dutyStationId: 'loc-lusaka-hq',
    itinerary: {
      originId: 'loc-lusaka-hq',
      originName: LOC['loc-lusaka-hq']!.name,
      destinationId: s.destinationId,
      destinationName: LOC[s.destinationId]!.name,
      stops: (s.stops ?? []).map((id) => ({ id, name: LOC[id]!.name })),
      departAt: s.depart,
      returnAt: s.ret,
      nights,
      distanceKm,
      distanceOverrideKm: null,
    },
    transport: { mode: s.transport, justification: s.transportJustification, driverRequired: s.transport === 'IHM_VEHICLE', vehicleBookingId: s.vehicleBookingId },
    accommodation: { required: !!s.accommodation, nights: s.accommodation ? nights : 0, preferredVendorId: s.accommodation?.vendorId, ratePerNight: s.accommodation?.ratePerNight ?? 0, fullBoardProvided: false },
    allowances: { perDiemNights, perDiemRate, perDiemRateId: perDiemRateDoc?.id, overheadFunded: s.costCentreId === 'CC-101', perDiemWaived: false },
    costing,
    international: s.international,
    attachments: s.attachments ?? [],
    eligibility,
    status: s.status,
    workflow: submitted ? { id: wf.id, version: wf.version, stages: wf.stages } : null,
    currentStageIndex: s.currentStageIndex ?? (submitted ? approvals.length : -1),
    approvals,
    version: 1,
    approvedVersion: s.approvedAt ? 1 : undefined,
    advance: s.advance ?? null,
    wizard: s.wizard ?? { completedSteps: ['travel_type', 'trip_details', 'itinerary', 'travellers', 'transport', 'accommodation', 'allowances', 'costing', 'attachments', 'review'], lastStep: 'review', savedAt: s.submittedAt ?? createdAt },
    submittedAt: s.submittedAt,
    approvedAt: s.approvedAt,
    closedAt: s.closedAt,
    createdAt,
    updatedAt: s.updatedAt ?? s.approvedAt ?? s.submittedAt ?? createdAt,
    travellerIds: [requester.uid],
    approverIds: [...new Set(approvals.map((a) => a.actorId))],
    resumeStageIndex: null,
  };
}

const releasedAdvance = (approvedAmount: number, amount: number, approvedAt: string, payDate: string, opts: { lead: number; refs?: [string, string] }): AdvanceRecord => {
  const at = (h: string) => cat(payDate, h);
  return {
    requested: true,
    percentage: 75,
    approvedAmount,
    amount,
    policyStatus: 'CLEAR',
    leadTimeWorkingDays: opts.lead,
    leadTimeRequiredWorkingDays: 5,
    blockedByRequestId: null,
    blockedReason: null,
    exception: null,
    milestones: {
      PREPARED: { by: 'u-lombe', byName: 'Lombe Musonda', at: at('10:05') },
      SUBMITTED: { by: 'u-lombe', byName: 'Lombe Musonda', at: at('10:40'), reference: opts.refs?.[0] ?? `ZANACO-${4400000 + seqOf(approvedAt.slice(0, 4) + '-' + payDate.replace(/-/g, '')) % 99999}` },
      AUTH_1: { by: 'u-ruth', byName: 'Ruth Sakala', at: at('12:15') },
      AUTH_2: { by: 'u-mwaba', byName: 'Mwaba Simukonda', at: at('14:02') },
      RELEASED: { by: 'u-lombe', byName: 'Lombe Musonda', at: at('16:30'), reference: opts.refs?.[1] ?? `PAY-${YEAR}-${payDate.slice(5).replace('-', '')}` },
    },
    paidAt: at('16:30'),
  };
};

const FULL_CHAIN = (d: string[]): ApprovalSpec[] => [
  { stageKey: 'supervisor', by: 'u-thandiwe', at: d[0]! },
  { stageKey: 'hod_cc', by: 'u-bwalya', at: d[1]! },
  { stageKey: 'finance', by: 'u-lombe', at: d[2]! },
  { stageKey: 'finance_director', by: 'u-ruth', at: d[3]! },
  { stageKey: 'final', by: 'u-mwaba', at: d[4]! },
];

// ---------- trips / liquidations builders ----------

function tripOf(req: TravelRequest, extra: Partial<Trip> = {}): Trip {
  return {
    id: req.id,
    requestId: req.id,
    title: req.activityTitle,
    travellerNames: req.travellers.map((t) => t.name),
    arrangements: [],
    documents: [],
    financials: {
      approvedBudget: req.costing.total,
      advancePercentage: req.advance?.percentage ?? 75,
      advanceAmount: req.advance?.requested ? req.advance.amount : 0,
      employeeContribution: req.costing.employeeContribution,
      expensesLogged: 0,
      liquidationDueDate: req.itinerary.returnAt ? liquidationDueDate(req.itinerary.returnAt, policy) : null,
    },
    liquidationId: null,
    createdAt: req.approvedAt ?? req.createdAt,
    updatedAt: req.updatedAt,
    ...extra,
  };
}

function expenseLines(req: TravelRequest, actuals?: Record<string, number>): ExpenseLine[] {
  return req.costing.lines.map((l) => ({
    id: sid('exp'),
    category: l.category,
    label: l.label,
    budgeted: l.amount,
    actual: actuals ? (actuals[l.id] ?? actuals[l.category] ?? 0) : l.category === 'PER_DIEM' ? l.amount : 0,
    receiptRequired: l.category !== 'PER_DIEM',
    receipts: [],
  }));
}

function liquidationOf(id: string, req: TravelRequest, o: { status: Liquidation['status']; lines: ExpenseLine[]; boardingPasses?: Attachment[]; tripReport?: Partial<Liquidation['tripReport']>; submittedAt?: string; reviewedAt?: string; createdAt: string }): Liquidation {
  const advanceReceived = req.advance?.milestones.RELEASED ? req.advance.amount : 0;
  return {
    id,
    requestId: req.id,
    tripTitle: req.activityTitle,
    travellerId: req.requesterId,
    travellerName: req.requesterName,
    returnDate: req.itinerary.returnAt!.slice(0, 10),
    dueDate: liquidationDueDate(req.itinerary.returnAt!, policy),
    status: o.status,
    lines: o.lines,
    boardingPassesRequired: req.transport.mode === 'AIR',
    boardingPasses: o.boardingPasses ?? [],
    tripReport: { objective: '', activities: '', locations: '', outcomes: '', challenges: '', followUps: '', recommendations: '', supervisorId: req.supervisorId, ...o.tripReport },
    reconciliation: reconcile(advanceReceived, o.lines),
    submittedAt: o.submittedAt,
    reviewedAt: o.reviewedAt,
    createdAt: o.createdAt,
    updatedAt: o.reviewedAt ?? o.submittedAt ?? o.createdAt,
    remindersSent: [],
  };
}

// ---------- the data set ----------

const requests: TravelRequest[] = [];
const trips: Trip[] = [];
const liquidations: Liquidation[] = [];
const bookings: VehicleBooking[] = [];
const claims: MileageClaim[] = [];
const externalPayments: ExternalPaymentRequest[] = [];
const externalParticipants: ExternalParticipant[] = [];
const notifications: Notification[] = [];
const auditEvents: AuditEvent[] = [];

function addNotification(userId: string, title: string, body: string, link: string, kind: string, createdAt: string, read = false) {
  notifications.push({ id: sid('ntf'), userId, title, body, link, kind, read, createdAt });
}
function addAudit(entityType: string, entityId: string, action: string, actorId: string, at: string, extra: Partial<AuditEvent> = {}) {
  const actorName = actorId === 'system' ? 'System' : P[actorId]!.name;
  auditEvents.push({ id: sid('aud'), entityType, entityId, action, actorId, actorName, at, ...extra });
}

// Closed history for Chanda (9 trips) + a few for others → yearStats ≈ 11 trips / 38 nights / ZMW 84k with 0389 + 0405.
interface ClosedSpec {
  id: string;
  requester: string;
  title: string;
  dest: string;
  depart: string;
  ret: string;
  total: number;
  projectId?: string;
  costCentreId?: string;
  transport?: TransportMode;
}
const CLOSED: ClosedSpec[] = [
  { id: 'TRV-2026-0012', requester: 'u-chanda', title: 'Ndola supervision visit', dest: 'loc-ndola', depart: '2026-01-12', ret: '2026-01-15', total: 7150, transport: 'AIR' },
  { id: 'TRV-2026-0031', requester: 'u-mercy', title: 'Kabwe DQA training', dest: 'loc-kabwe', depart: '2026-01-26', ret: '2026-01-29', total: 6420 },
  { id: 'TRV-2026-0047', requester: 'u-chanda', title: 'Kabwe data quality audit', dest: 'loc-kabwe', depart: '2026-02-03', ret: '2026-02-05', total: 4980 },
  { id: 'TRV-2026-0083', requester: 'u-chanda', title: 'Livingstone programme review', dest: 'loc-livingstone', depart: '2026-02-23', ret: '2026-02-27', total: 9860, transport: 'AIR' },
  { id: 'TRV-2026-0118', requester: 'u-chanda', title: 'Chipata DHIS2 mentorship', dest: 'loc-chipata', depart: '2026-03-16', ret: '2026-03-20', total: 8720 },
  { id: 'TRV-2026-0140', requester: 'u-joseph', title: 'Solwezi cold-chain audit', dest: 'loc-solwezi', depart: '2026-04-06', ret: '2026-04-09', total: 7310, projectId: 'MCH-Z', costCentreId: 'CC-108' },
  { id: 'TRV-2026-0156', requester: 'u-chanda', title: 'Solwezi facility assessment', dest: 'loc-solwezi', depart: '2026-04-13', ret: '2026-04-17', total: 9140 },
  { id: 'TRV-2026-0199', requester: 'u-chanda', title: 'Mongu supply-chain support', dest: 'loc-mongu', depart: '2026-05-11', ret: '2026-05-15', total: 9380 },
  { id: 'TRV-2026-0231', requester: 'u-chanda', title: 'Kasama data review', dest: 'loc-kasama', depart: '2026-06-08', ret: '2026-06-11', total: 7020 },
  { id: 'TRV-2026-0260', requester: 'u-mercy', title: 'Choma M&E field visit', dest: 'loc-choma', depart: '2026-06-22', ret: '2026-06-25', total: 6180 },
  { id: 'TRV-2026-0278', requester: 'u-chanda', title: 'Mansa outreach supervision', dest: 'loc-mansa', depart: '2026-07-06', ret: '2026-07-10', total: 8540 },
  { id: 'TRV-2026-0322', requester: 'u-chanda', title: 'Choma HIV testing workshop', dest: 'loc-choma', depart: '2026-08-03', ret: '2026-08-06', total: 5010 },
];
const shiftDay = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 864e5).toISOString().slice(0, 10);

for (const c of CLOSED) {
  const nights = nightsBetween(cat(c.depart, '06:00'), cat(c.ret, '17:30'));
  const perDiem = nights * 1200;
  const accommodationTotal = c.total - perDiem;
  const approvedDate = shiftDay(c.depart, -9);
  const approvedAt = cat(approvedDate, '15:10');
  const advance = releasedAdvance(c.total, Math.round(c.total * 75) / 100, approvedAt, shiftDay(c.depart, -7), { lead: 6 });
  const req = trv({
    id: c.id,
    requester: c.requester,
    title: c.title,
    purpose: `${c.title} — quarterly programme support with the provincial and district health teams.`,
    category: 'FIELD',
    projectId: c.projectId ?? 'GHSC-Z',
    costCentreId: c.costCentreId ?? 'CC-114',
    destinationId: c.dest,
    depart: cat(c.depart, '06:00'),
    ret: cat(c.ret, '17:30'),
    transport: c.transport ?? 'IHM_VEHICLE',
    transportJustification: c.transport === 'AIR' ? 'Road distance exceeds one day of driving; scheduled flight is the SOP-preferred option.' : undefined,
    accommodation: { ratePerNight: Math.round((accommodationTotal / nights) * 100) / 100 },
    status: 'CLOSED',
    submittedAt: cat(shiftDay(c.depart, -14), '09:00'),
    approvals: FULL_CHAIN([cat(shiftDay(c.depart, -13), '10:00'), cat(shiftDay(c.depart, -12), '11:30'), cat(shiftDay(c.depart, -11), '09:20'), cat(shiftDay(c.depart, -10), '16:00'), approvedAt]),
    approvedAt,
    advance,
    closedAt: cat(shiftDay(c.ret, 4), '11:00'),
    updatedAt: cat(shiftDay(c.ret, 4), '11:00'),
  });
  requests.push(req);
  const lines = expenseLines(req, { PER_DIEM: perDiem, ACCOMMODATION: accommodationTotal });
  for (const l of lines) if (l.receiptRequired) l.receipts.push(att(sid('att'), `${l.category.toLowerCase()}_${c.id.slice(-4)}.pdf`, 'RECEIPT', c.requester, cat(shiftDay(c.ret, 1), '10:00')));
  const liq = liquidationOf(`LIQ-${YEAR}-${String(liquidations.length + 1).padStart(4, '0')}`, req, {
    status: 'CLOSED',
    lines,
    boardingPasses: req.transport.mode === 'AIR' ? [att(sid('att'), `boarding_${c.id.slice(-4)}.pdf`, 'BOARDING_PASS', c.requester, cat(c.ret, '20:00'))] : [],
    tripReport: { objective: `Provide on-site support for ${c.title.toLowerCase()}.`, activities: 'Facility visits, data review sessions and mentorship with district teams.', locations: LOC[c.dest]!.name, outcomes: 'Action plan agreed with the provincial team.', challenges: 'Intermittent connectivity at district sites.', followUps: 'Share action tracker; schedule follow-up call in 4 weeks.', recommendations: 'Budget for a second mentorship round next quarter.', submittedAt: cat(shiftDay(c.ret, 1), '15:00'), supervisorApprovedAt: cat(shiftDay(c.ret, 2), '09:30') },
    submittedAt: cat(shiftDay(c.ret, 2), '10:00'),
    reviewedAt: cat(shiftDay(c.ret, 4), '11:00'),
    createdAt: cat(c.ret, '18:00'),
  });
  liquidations.push(liq);
  trips.push(tripOf(req, { liquidationId: liq.id, financials: { ...tripOf(req).financials, expensesLogged: liq.reconciliation.totalActual } }));
}

// --- TRV-2026-0389 Chipata field visit (overdue liquidation → blocks new advances)
{
  const approvedAt = cat('2026-08-13', '15:40');
  const req = trv({
    id: 'TRV-2026-0389',
    requester: 'u-chanda',
    title: 'Chipata field visit',
    purpose: 'Supportive supervision of GHSC-Z commodity management at Eastern Province facilities.',
    category: 'FIELD',
    projectId: 'GHSC-Z',
    costCentreId: 'CC-114',
    destinationId: 'loc-chipata',
    depart: cat('2026-08-20', '06:00'),
    ret: cat('2026-08-24', '17:30'),
    transport: 'IHM_VEHICLE',
    accommodation: { ratePerNight: 650 },
    status: 'AWAITING_LIQUIDATION',
    submittedAt: cat('2026-08-07', '09:12'),
    approvals: FULL_CHAIN([cat('2026-08-10', '10:00'), cat('2026-08-11', '14:20'), cat('2026-08-12', '09:05'), cat('2026-08-12', '16:30'), approvedAt]),
    approvedAt,
    advance: releasedAdvance(7400, 5550, approvedAt, '2026-08-17', { lead: 4 }),
    updatedAt: cat('2026-08-24', '18:00'),
  });
  requests.push(req);
  const liq = liquidationOf('LIQ-2026-0011', req, { status: 'OPEN', lines: expenseLines(req), createdAt: cat('2026-08-24', '18:00') });
  liquidations.push(liq);
  trips.push(tripOf(req, { liquidationId: liq.id, documents: [att('att-0389-auth', 'Travel authorisation.pdf', 'AUTHORISATION', 'u-chanda', approvedAt)] }));
  addNotification('u-chanda', 'Liquidation overdue by 5 days', 'TRV-2026-0389 · Chipata field visit — due 29 Aug (5 days after return). New advances are blocked until this trip is liquidated.', `/liquidations/${liq.id}`, 'LIQUIDATION_OVERDUE', cat(TODAY, '04:00'));
  addNotification('u-chanda', 'Liquidation due 29 Aug 2026', 'TRV-2026-0389 · Chipata field visit — submit receipts and your trip report within 5 days of return.', `/liquidations/${liq.id}`, 'LIQUIDATION_DUE', cat('2026-08-24', '18:00'), true);
  liq.remindersSent = ['before_2', 'due_today', 'overdue_2026-08-30'];
}

// --- TRV-2026-0405 Kasama supervision visit (liquidation in progress — mock 1e)
{
  const approvedAt = cat('2026-08-25', '11:20');
  const req = trv({
    id: 'TRV-2026-0405',
    requester: 'u-chanda',
    title: 'Kasama supervision visit',
    purpose: 'Quarterly supervision of Northern Province logistics management units.',
    category: 'FIELD',
    projectId: 'GHSC-Z',
    costCentreId: 'CC-114',
    destinationId: 'loc-kasama',
    depart: cat('2026-08-30', '06:00'),
    ret: cat('2026-09-02', '18:00'),
    transport: 'AIR',
    transportJustification: 'Lusaka–Kasama road trip exceeds 10 hours each way; Proflight schedule used, IHM vehicle for in-province movement.',
    accommodation: { ratePerNight: 800 },
    extraLines: [
      { id: 'line-0405-fuel', category: 'FUEL', label: 'Fuel — IHM vehicle', quantity: 1, unitCost: 760 },
      { id: 'line-0405-toll', category: 'PARKING_TOLLS', label: 'Toll fees', quantity: 1, unitCost: 120 },
      { id: 'line-0405-parking', category: 'PARKING_TOLLS', label: 'Parking', quantity: 1, unitCost: 80 },
    ],
    status: 'AWAITING_LIQUIDATION',
    submittedAt: cat('2026-08-19', '08:45'),
    approvals: FULL_CHAIN([cat('2026-08-20', '10:10'), cat('2026-08-21', '09:00'), cat('2026-08-24', '10:30'), cat('2026-08-24', '15:00'), approvedAt]),
    approvedAt,
    advance: releasedAdvance(6960, 5220, approvedAt, '2026-08-27', { lead: 3 }),
    updatedAt: cat('2026-09-02', '18:30'),
  });
  requests.push(req);
  const byLabel = (label: string) => req.costing.lines.find((l) => l.label === label)!.id;
  const lines = expenseLines(req, { [byLabel('Per diem · 3 nights')]: 3600, [byLabel('Accommodation')]: 2250, 'line-0405-fuel': 812.4, 'line-0405-toll': 100, 'line-0405-parking': 60 });
  const receiptAt = cat('2026-09-03', '08:15');
  lines.find((l) => l.label === 'Accommodation')!.receipts = [att('att-0405-inv', 'invoice_2250.pdf', 'RECEIPT', 'u-chanda', receiptAt)];
  lines.find((l) => l.label === 'Fuel — IHM vehicle')!.receipts = [att('att-0405-fuel1', 'fuel_kasama_01.jpg', 'RECEIPT', 'u-chanda', receiptAt), att('att-0405-fuel2', 'fuel_kasama_02.jpg', 'RECEIPT', 'u-chanda', receiptAt)];
  lines.find((l) => l.label === 'Parking')!.receipts = [att('att-0405-parking', 'parking.jpg', 'RECEIPT', 'u-chanda', receiptAt)];
  const liq = liquidationOf('LIQ-2026-0012', req, {
    status: 'OPEN',
    lines,
    boardingPasses: [att('att-0405-bp1', 'boarding_LUN-KAA.pdf', 'BOARDING_PASS', 'u-chanda', receiptAt), att('att-0405-bp2', 'boarding_KAA-LUN.pdf', 'BOARDING_PASS', 'u-chanda', receiptAt)],
    tripReport: {
      objective: 'Supervise Northern Province LMU performance and verify stock status at 6 facilities.',
      activities: 'Facility stock counts, LMIS data verification, mentorship of district pharmacy staff.',
      locations: 'Kasama General Hospital, Kasama Urban HC, Mungwi DHO, Chilubula RHC',
      outcomes: 'Stock-out rate for tracer commodities reduced to 4%; two facilities flagged for redistribution.',
      challenges: 'Late arrival of the district vehicle on day 2.',
      followUps: 'Redistribution plan to be shared with the PHO by 10 Sep.',
      recommendations: 'Schedule follow-up supervision in Q4.',
      submittedAt: cat('2026-09-02', '20:10'),
      supervisorApprovedAt: cat('2026-09-03', '08:40'),
      supervisorComment: 'Good report — approved.',
    },
    createdAt: cat('2026-09-02', '18:30'),
  });
  liquidations.push(liq);
  trips.push(tripOf(req, { liquidationId: liq.id, financials: { ...tripOf(req).financials, expensesLogged: liq.reconciliation.totalActual } }));
  addNotification('u-chanda', 'Liquidation due 07 Sep 2026', 'TRV-2026-0405 · Kasama supervision visit — submit receipts and your trip report within 5 days of return.', `/liquidations/${liq.id}`, 'LIQUIDATION_DUE', cat('2026-09-02', '18:30'), true);
}

// --- TRV-2026-0412 HIV programme review, Ndola (current trip — mocks 1a, 1d)
{
  const approvedAt = cat('2026-09-02', '09:45');
  const req = trv({
    id: 'TRV-2026-0412',
    requester: 'u-chanda',
    title: 'HIV programme review, Ndola',
    purpose: 'Joint HIV programme performance review with the Copperbelt Provincial Health Office and GHSC-Z district teams.',
    description: 'Three-day review of ART commodity availability, viral-load sample transport and data quality across Ndola, Kitwe and Luanshya districts.',
    outcomes: 'Signed-off Q3 performance review; redistribution plan for ARVs; agreed data-quality improvement actions.',
    workPlanRef: 'WP-2026-GHSC-Z-14',
    category: 'FIELD',
    projectId: 'GHSC-Z',
    costCentreId: 'CC-114',
    destinationId: 'loc-ndola',
    depart: cat('2026-09-08', '06:30'),
    ret: cat('2026-09-11', '18:00'),
    transport: 'AIR',
    transportJustification: 'Early-morning meetings on day 1 in Ndola; Proflight PFZ 312 is the SOP-preferred scheduled service.',
    vehicleBookingId: 'VEH-2026-0144',
    accommodation: { ratePerNight: 1450, vendorId: 'ven-protea-ndola', paidDirectly: true },
    extraLines: [{ id: 'line-0412-shuttle', category: 'GROUND_TRANSPORT', label: 'Airport shuttle, Ndola', quantity: 2, unitCost: 300 }],
    status: 'READY_FOR_TRAVEL',
    submittedAt: cat('2026-08-31', '08:20'),
    approvals: FULL_CHAIN([cat('2026-09-01', '09:10'), cat('2026-09-01', '14:35'), cat('2026-09-02', '08:15'), cat('2026-09-02', '09:05'), approvedAt]),
    approvedAt,
    advance: releasedAdvance(8550, 6412.5, approvedAt, '2026-09-02', { lead: 3, refs: ['ZANACO-4471821', 'PAY-2026-0912'] }),
    attachments: [att('att-0412-agenda', 'Review agenda.pdf', 'AGENDA', 'u-chanda', cat('2026-08-31', '08:00'))],
    updatedAt: cat('2026-09-03', '07:50'),
  });
  requests.push(req);
  const docs = [
    att('att-0412-auth', 'Travel authorisation.pdf', 'AUTHORISATION', 'u-chanda', approvedAt),
    att('att-0412-ticket', 'E-ticket PFZ312.pdf', 'TICKET', 'u-precious', cat('2026-09-02', '11:20')),
    att('att-0412-hotel', 'Hotel confirmation.pdf', 'BOOKING_CONFIRMATION', 'u-precious', cat('2026-09-02', '11:45')),
    att('att-0412-proof', 'Advance payment proof.pdf', 'PAYMENT_PROOF', 'u-lombe', cat('2026-09-02', '16:35')),
  ];
  trips.push(
    tripOf(req, {
      arrangements: [
        { id: 'arr-0412-flight', type: 'FLIGHT', title: 'Proflight PFZ 312 · LUN → NLA · 08 Sep 07:40', detail: 'Booked · Ref QX4T8M · Economy · Voyagers Travel', vendorId: 'ven-voyagers', vendorName: 'Voyagers Travel', bookingRef: 'QX4T8M', amount: 3980, currency: 'ZMW', status: 'CONFIRMED', officerId: 'u-precious', bookedAt: cat('2026-09-02', '11:20'), cancellationTerms: 'Changes permitted up to 24h before departure; ZMW 450 change fee.' },
        { id: 'arr-0412-hotel', type: 'HOTEL', title: 'Protea Hotel Ndola · 3 nights, B&B', detail: 'Booked · Ref 88213 · ZMW 1,450/night · Preferred vendor', vendorId: 'ven-protea-ndola', vendorName: 'Protea Hotel Ndola', bookingRef: '88213', amount: 4350, currency: 'ZMW', status: 'CONFIRMED', officerId: 'u-precious', bookedAt: cat('2026-09-02', '11:45'), cancellationTerms: 'Free cancellation until 06 Sep 18:00.' },
        { id: 'arr-0412-shuttle', type: 'SHUTTLE', title: 'Airport shuttle, Ndola', detail: 'With Procurement · quotation requested 03 Sep', vendorId: 'ven-ndola-shuttle', vendorName: 'Ndola Airport Shuttle', status: 'REQUESTED', officerId: 'u-precious' },
      ],
      documents: docs,
      financials: { approvedBudget: 8550, advancePercentage: 75, advanceAmount: 6412.5, employeeContribution: 0, expensesLogged: 2180, liquidationDueDate: '2026-09-16' },
    }),
  );
  bookings.push({
    id: 'VEH-2026-0144',
    vehicleId: 'veh-landcruiser',
    vehicleLabel: 'Toyota Land Cruiser · BAD 4721',
    requesterId: 'u-chanda',
    requesterName: 'Chanda Mwansa',
    requestId: 'TRV-2026-0412',
    purpose: 'HIV programme review, Ndola',
    destination: 'Ndola',
    passengers: 3,
    pickupAt: cat('2026-09-07', '06:00'),
    returnAt: cat('2026-09-11', '18:00'),
    mode: 'ASSIGNED_DRIVER',
    driverId: 'u-elias',
    driverName: 'Elias Chirwa',
    status: 'CONFIRMED',
    selfDrive: {},
    photos: [],
    notes: 'Driver positions the vehicle in Ndola on 07 Sep for district visits; traveller flies.',
    createdAt: cat('2026-09-02', '10:00'),
    updatedAt: cat('2026-09-02', '13:10'),
  });
  addNotification('u-chanda', 'Advance paid', 'TRV-2026-0412 · ZMW 6,412.50 (75%) released · ref PAY-2026-0912.', '/trips/TRV-2026-0412', 'ADVANCE_PAID', cat('2026-09-02', '16:31'));
  addNotification('u-chanda', 'Booking confirmed', 'TRV-2026-0412 · Proflight PFZ 312 · LUN → NLA · 08 Sep 07:40 and Protea Hotel Ndola confirmed.', '/trips/TRV-2026-0412', 'BOOKING_CONFIRMED', cat('2026-09-02', '11:46'));
  addNotification('u-chanda', 'Vehicle booking confirmed', 'VEH-2026-0144 · Toyota Land Cruiser · BAD 4721 · driver Elias Chirwa · Ndola', '/fleet/bookings/VEH-2026-0144', 'VEHICLE_CONFIRMED', cat('2026-09-02', '13:10'), true);
  addNotification('u-chanda', 'Travel approved', 'TRV-2026-0412 · HIV programme review, Ndola — approved. Advance of ZMW 6,412.50 (75%) is with Finance.', '/requests/TRV-2026-0412', 'DECISION_APPROVED', approvedAt, true);
  addNotification('u-elias', 'You have been assigned a trip', 'VEH-2026-0144 · Ndola · Chanda Mwansa · Mon 07 – Fri 11 Sep', '/fleet/bookings/VEH-2026-0144', 'DRIVER_ASSIGNED', cat('2026-09-02', '13:10'));
  addAudit('travelRequest', req.id, 'SUBMITTED', 'u-chanda', req.submittedAt!, { stage: 'supervisor', newValue: { status: 'SUPERVISOR_REVIEW' } });
  for (const a of req.approvals) addAudit('travelRequest', req.id, 'DECISION_APPROVED', a.actorId, a.at, { stage: a.stageKey });
  addAudit('travelRequest', req.id, 'FINAL_APPROVAL', 'u-mwaba', approvedAt, { newValue: { status: 'ADVANCE_PROCESSING', advance: { amount: 6412.5, policyStatus: 'CLEAR' } } });
  for (const m of ['PREPARED', 'SUBMITTED', 'AUTH_1', 'AUTH_2', 'RELEASED'] as const) addAudit('travelRequest', req.id, `ADVANCE_${m}`, req.advance!.milestones[m]!.by, req.advance!.milestones[m]!.at, { stage: 'advance' });
  addAudit('trip', req.id, 'ARRANGEMENT_UPDATED', 'u-precious', cat('2026-09-02', '11:20'), { newValue: { id: 'arr-0412-flight', status: 'CONFIRMED' } });
  addAudit('trip', req.id, 'ARRANGEMENT_UPDATED', 'u-precious', cat('2026-09-02', '11:45'), { newValue: { id: 'arr-0412-hotel', status: 'CONFIRMED' } });
  addAudit('travelRequest', req.id, 'STATUS_CHANGED', 'system', cat('2026-09-02', '16:31'), { oldValue: { status: 'TRAVEL_ARRANGEMENTS' }, newValue: { status: 'READY_FOR_TRAVEL' } });
}

// --- TRV-2026-0416 Kapaya, Mongu (lead time short — mock 1h)
{
  const approvedAt = cat('2026-09-02', '11:00');
  const req = trv({
    id: 'TRV-2026-0416',
    requester: 'u-bwalya',
    title: 'Mongu programme support',
    purpose: 'Executive programme support visit to Western Province partners (overhead-funded).',
    category: 'FIELD',
    costCentreId: 'CC-101',
    destinationId: 'loc-mongu',
    depart: cat('2026-09-05', '06:00'),
    ret: cat('2026-09-09', '17:00'),
    transport: 'IHM_VEHICLE',
    accommodation: { ratePerNight: 765 },
    status: 'ADVANCE_PROCESSING',
    submittedAt: cat('2026-08-31', '16:30'),
    approvals: [
      { stageKey: 'supervisor', by: 'u-mwaba', at: cat('2026-09-01', '08:30') },
      { stageKey: 'hod_cc', by: 'u-kunda', at: cat('2026-09-01', '10:05') },
      { stageKey: 'finance', by: 'u-lombe', at: cat('2026-09-01', '15:40') },
      { stageKey: 'finance_director', by: 'u-ruth', at: cat('2026-09-02', '09:20') },
      { stageKey: 'final', by: 'u-mwaba', at: approvedAt },
    ],
    approvedAt,
    advance: { requested: true, percentage: 75, approvedAmount: 7860, amount: 5895, policyStatus: 'LEAD_TIME_SHORT', leadTimeWorkingDays: 2, leadTimeRequiredWorkingDays: 5, blockedByRequestId: null, blockedReason: null, exception: null, milestones: {}, paidAt: null },
    updatedAt: approvedAt,
  });
  requests.push(req);
  trips.push(tripOf(req, { arrangements: [{ id: 'arr-0416-hotel', type: 'HOTEL', title: 'Accommodation · Mongu · 4 nights', detail: 'With Procurement · hotel to be confirmed', status: 'REQUESTED' }] }));
  addNotification('u-lombe', 'Advance ready for processing', 'TRV-2026-0416 · Bwalya Kapaya · ZMW 5,895.00 · lead time short', '/finance/advances', 'ADVANCE_READY', approvedAt);
}

// --- TRV-2026-0417 Chanda, Chipata MCH outreach (blocked by 0389 — mock 1h)
{
  const approvedAt = cat('2026-09-02', '09:30');
  const req = trv({
    id: 'TRV-2026-0417',
    requester: 'u-chanda',
    title: 'Chipata MCH outreach',
    purpose: 'Maternal and child health outreach support with Eastern Province district teams.',
    category: 'FIELD',
    projectId: 'MCH-Z',
    costCentreId: 'CC-108',
    destinationId: 'loc-chipata',
    depart: cat('2026-09-22', '06:00'),
    ret: cat('2026-09-26', '17:00'),
    transport: 'IHM_VEHICLE',
    accommodation: { ratePerNight: 880 },
    extraLines: [{ category: 'GROUND_TRANSPORT', label: 'District transfers', quantity: 1, unitCost: 800 }],
    status: 'ADVANCE_PROCESSING',
    submittedAt: cat('2026-08-28', '10:15'),
    approvals: FULL_CHAIN([cat('2026-08-28', '14:00'), cat('2026-08-31', '09:40'), cat('2026-09-01', '11:10'), cat('2026-09-01', '16:20'), approvedAt]),
    approvedAt,
    advance: { requested: true, percentage: 75, approvedAmount: 9120, amount: 6840, policyStatus: 'BLOCKED', leadTimeWorkingDays: 13, leadTimeRequiredWorkingDays: 5, blockedByRequestId: 'TRV-2026-0389', blockedReason: 'TRV-2026-0389 unliquidated', exception: null, milestones: {}, paidAt: null },
    updatedAt: approvedAt,
  });
  requests.push(req);
  trips.push(tripOf(req, { arrangements: [{ id: 'arr-0417-hotel', type: 'HOTEL', title: 'Accommodation · Chipata · 4 nights', detail: 'With Procurement · hotel to be confirmed', status: 'REQUESTED' }] }));
  addNotification('u-chanda', 'Advance blocked by an outstanding liquidation', 'TRV-2026-0417 — liquidate TRV-2026-0389 before this advance can be paid.', '/requests/TRV-2026-0389', 'ADVANCE_BLOCKED', approvedAt);
  addNotification('u-lombe', 'Advance ready for processing', 'TRV-2026-0417 · Chanda Mwansa · ZMW 6,840.00 · blocked', '/finance/advances', 'ADVANCE_READY', approvedAt);
}

// --- Requests awaiting Thandiwe's supervisor review (mock 1c)
{
  const submittedAt = cat('2026-09-02', '09:14');
  requests.push(
    trv({
      id: 'TRV-2026-0418',
      requester: 'u-mercy',
      title: 'Livingstone data-quality workshop',
      purpose: 'Facilitate a 4-day data-quality workshop for Southern Province M&E focal persons.',
      description: 'Workshop covering DHIS2 data validation rules, LMIS reconciliation and reporting timeliness; 24 participants from 6 districts.',
      category: 'FIELD',
      projectId: 'GHSC-Z',
      costCentreId: 'CC-114',
      destinationId: 'loc-livingstone',
      depart: cat('2026-09-15', '06:00'),
      ret: cat('2026-09-19', '17:00'),
      transport: 'PUBLIC',
      accommodation: { ratePerNight: 1085, vendorId: 'ven-avani' },
      extraLines: [
        { category: 'GROUND_TRANSPORT', label: 'Ground transport', quantity: 1, unitCost: 1600 },
        { category: 'STATIONERY', label: 'Workshop stationery', quantity: 1, unitCost: 500 },
      ],
      status: 'SUPERVISOR_REVIEW',
      submittedAt,
      currentStageIndex: 0,
    }),
    trv({
      id: 'TRV-2026-0419',
      requester: 'u-joseph',
      title: 'Kabwe cold-chain assessment',
      purpose: 'Assess cold-chain equipment functionality at Central Province EPI stores.',
      category: 'FIELD',
      projectId: 'MCH-Z',
      costCentreId: 'CC-108',
      destinationId: 'loc-kabwe',
      depart: cat('2026-09-16', '07:00'),
      ret: cat('2026-09-18', '16:00'),
      transport: 'IHM_VEHICLE',
      accommodation: { ratePerNight: 700 },
      status: 'SUPERVISOR_REVIEW',
      submittedAt: cat('2026-09-02', '12:40'),
      currentStageIndex: 0,
    }),
    trv({
      id: 'TRV-2026-0420',
      requester: 'u-natasha',
      title: 'Geneva partners summit',
      purpose: 'Represent IHM at the Global Health Supply Chain partners summit, WHO HQ.',
      category: 'INTERNATIONAL',
      projectId: 'GHSC-Z',
      costCentreId: 'CC-114',
      destinationId: 'loc-geneva',
      depart: cat('2026-09-12', '22:30'),
      ret: cat('2026-09-17', '21:00'),
      transport: 'AIR',
      transportJustification: 'International travel — no alternative to scheduled air service.',
      accommodation: { ratePerNight: 4200, paidDirectly: true },
      extraLines: [
        { category: 'FLIGHTS', label: 'Return economy airfare LUN–GVA', quantity: 1, unitCost: 28500, paidDirectly: true },
        { category: 'VISA', label: 'Schengen visa fee', quantity: 1, unitCost: 1800 },
      ],
      international: { countries: ['Switzerland'], cities: ['Geneva'], passportValid: true, visaRequired: true, visaStatus: 'TO_APPLY', airports: 'LUN → ADD → GVA', transit: 'Addis Ababa', insurance: true, currency: 'CHF', emergencyContact: 'Mulenga Zulu · +260 97 700 1122', cabinClass: 'ECONOMY' },
      status: 'SUPERVISOR_REVIEW',
      submittedAt: cat('2026-09-02', '14:05'),
      currentStageIndex: 0,
    }),
  );
  for (const id of ['TRV-2026-0418', 'TRV-2026-0419', 'TRV-2026-0420']) {
    const r = requests.find((x) => x.id === id)!;
    addNotification('u-thandiwe', 'Request awaiting your approval', `${r.requesterName} · ${r.id} · ${r.activityTitle}`, `/approvals/${r.id}`, 'APPROVAL_PENDING', r.submittedAt!);
    addAudit('travelRequest', r.id, 'SUBMITTED', r.requesterId, r.submittedAt!, { stage: 'supervisor', newValue: { status: 'SUPERVISOR_REVIEW' } });
  }
  addNotification('u-natasha', 'International request submitted late', 'TRV-2026-0420 gives 10 days’ notice; 14 required.', '/requests/TRV-2026-0420', 'INTERNATIONAL_LATE', cat('2026-09-02', '14:05'));
}

// --- TRV-2026-0421 Chanda draft (wizard at Itinerary — mocks 1a, 1b)
requests.push({
  ...trv({
    id: 'TRV-2026-0421',
    requester: 'u-chanda',
    title: 'Solwezi site visit',
    purpose: 'Site visit to North-Western Province facilities for GHSC-Z commodity availability spot checks.',
    category: 'FIELD',
    projectId: 'GHSC-Z',
    costCentreId: 'CC-114',
    destinationId: 'loc-solwezi',
    depart: cat('2026-09-28', '06:00'),
    ret: cat('2026-10-02', '17:00'),
    transport: 'IHM_VEHICLE',
    status: 'DRAFT',
    wizard: { completedSteps: ['travel_type', 'trip_details'], lastStep: 'itinerary', savedAt: cat(TODAY, '07:52') },
    createdAt: cat(TODAY, '07:31'),
    updatedAt: cat(TODAY, '07:52'),
  }),
  transport: { mode: null },
});

// --- Vehicle bookings (mock 1f)
bookings.push(
  {
    id: 'VEH-2026-0143',
    vehicleId: 'veh-hilux',
    vehicleLabel: 'Toyota Hilux · BAE 2287',
    requesterId: 'u-kelvin',
    requesterName: 'Kelvin Phiri',
    purpose: 'Chongwe outreach',
    destination: 'Chongwe',
    passengers: 2,
    pickupAt: cat('2026-09-09', '06:00'),
    returnAt: cat('2026-09-10', '17:00'),
    mode: 'SELF_DRIVE',
    status: 'IN_PROGRESS',
    selfDrive: {
      licenceValid: { ok: true, expiry: '2028-03-31', at: cat('2026-09-02', '11:20') },
      preDepartureInspection: { ok: true, notes: 'No visible damage; spare wheel and jack present.', at: cat(TODAY, '08:10'), by: 'u-grace' },
      keysAccepted: { odometerOut: 41_902, fuelLevel: '¾', at: cat(TODAY, '08:20'), by: 'u-grace' },
    },
    photos: [],
    createdAt: cat('2026-09-02', '11:20'),
    updatedAt: cat(TODAY, '08:20'),
  },
  {
    id: 'VEH-2026-0145',
    vehicleId: 'veh-corolla',
    vehicleLabel: 'Toyota Corolla Cross · BAF 0533',
    requesterId: 'u-mercy',
    requesterName: 'Mercy Tembo',
    purpose: 'Data collection, Chongwe & Kafue',
    destination: 'Kafue',
    passengers: 3,
    pickupAt: cat('2026-09-10', '07:00'),
    returnAt: cat('2026-09-11', '17:00'),
    mode: 'ASSIGNED_DRIVER',
    status: 'REQUESTED',
    selfDrive: {},
    photos: [],
    createdAt: cat(TODAY, '09:05'),
    updatedAt: cat(TODAY, '09:05'),
  },
);
addNotification('u-grace', 'Vehicle booking requested', 'Mercy Tembo · VEH-2026-0145 · Kafue · driver required', '/fleet/bookings/VEH-2026-0145', 'VEHICLE_REQUESTED', cat(TODAY, '09:05'));

// --- Mileage claims (mock 1g)
{
  const mileageRate = effectiveRate(rates, 'MILEAGE_RATE', '2026-09-02')!;
  claims.push(
    {
      id: 'MIL-2026-0094',
      claimantId: 'u-chanda',
      claimantName: 'Chanda Mwansa',
      purpose: 'DHIS2 mentorship — Kafue District Hospital',
      date: '2026-09-02',
      fromName: 'IHM HQ, Ibex Hill, Lusaka',
      toName: 'Kafue District Hospital',
      province: 'Lusaka',
      withinProvince: true,
      distanceKm: 96,
      rateId: mileageRate.id,
      ratePerKm: 5,
      rateEffectiveFrom: '2026-01-01',
      amount: 480,
      preApprovalRef: 'SUP-0311',
      preApprovalBy: 'T. Mulenga',
      preApprovalAttached: true,
      routeEvidence: [],
      businessEvidence: [att('att-0094-agenda', 'Mentorship agenda.pdf', 'AGENDA', 'u-chanda', cat('2026-09-02', '17:40')), att('att-0094-register', 'Attendance register.pdf', 'ATTENDANCE_REGISTER', 'u-chanda', cat('2026-09-02', '17:41'))],
      status: 'DRAFT',
      createdAt: cat('2026-09-02', '17:35'),
      updatedAt: cat('2026-09-02', '17:41'),
    },
    {
      id: 'MIL-2026-0092',
      claimantId: 'u-chanda',
      claimantName: 'Chanda Mwansa',
      purpose: 'Mileage, Kafue clinic',
      date: '2026-08-19',
      fromName: 'IHM HQ, Ibex Hill, Lusaka',
      toName: 'Kafue Urban Clinic',
      province: 'Lusaka',
      withinProvince: true,
      distanceKm: 92,
      rateId: mileageRate.id,
      ratePerKm: 5,
      rateEffectiveFrom: '2026-01-01',
      amount: 460,
      preApprovalRef: 'SUP-0298',
      preApprovalBy: 'T. Mulenga',
      preApprovalAttached: true,
      routeEvidence: [att('att-0092-route', 'maps_route_kafue.jpg', 'MAPS_ROUTE', 'u-chanda', cat('2026-08-19', '18:00'))],
      businessEvidence: [att('att-0092-minutes', 'Clinic meeting minutes.pdf', 'AGENDA', 'u-chanda', cat('2026-08-19', '18:02'))],
      status: 'APPROVED',
      reviewerComment: 'Approved — route and pre-approval verified.',
      createdAt: cat('2026-08-19', '17:50'),
      updatedAt: cat('2026-08-21', '10:15'),
    },
  );
  addNotification('u-chanda', 'Mileage claim approved', 'MIL-2026-0092 · ZMW 460.00 — Approved — route and pre-approval verified.', '/claims/MIL-2026-0092', 'MILEAGE_APPROVED', cat('2026-08-21', '10:15'), true);
}

// --- External payment EXT-2026-0057 (mock 1i)
{
  const extWf = workflowForCategory(workflows, 'EXTERNAL_PAYMENT')!;
  const dsa = effectiveRate(rates, 'EXTERNAL_DSA', '2026-09-16')!;
  const lunch = effectiveRate(rates, 'EXTERNAL_LUNCH', '2026-09-16')!;
  const transport = effectiveRate(rates, 'EXTERNAL_TRANSPORT_ALLOWANCE', '2026-09-16')!;
  const extRates = { dsaPerDay: dsa.value, lunchPerDay: lunch.value, transportFlat: transport.value };
  type PSpec = [name: string, org: string, station: string, district: string, payout: ExternalParticipant['payout'], host?: boolean];
  const airtel = (n: string): ExternalParticipant['payout'] => ({ type: 'MOBILE_MONEY', provider: 'AIRTEL', numberMasked: `···${n}` });
  const mtn = (n: string): ExternalParticipant['payout'] => ({ type: 'MOBILE_MONEY', provider: 'MTN', numberMasked: `···${n}` });
  const zanaco = (n: string): ExternalParticipant['payout'] => ({ type: 'BANK', bankName: 'Zanaco', accountMasked: `···${n}` });
  const fnb = (n: string): ExternalParticipant['payout'] => ({ type: 'BANK', bankName: 'FNB Zambia', accountMasked: `···${n}` });
  const specs: PSpec[] = [
    ['Agnes Mbewe', 'MoH Katete DHO', 'Katete', 'Katete', airtel('882')],
    ['Gift Sichone', 'MoH Petauke DHO', 'Petauke', 'Petauke', zanaco('4415')],
    ['Ruth Daka', 'Chipata DHO — host site', 'Chipata', 'Chipata', mtn('031'), true],
    ['Peter Lungu', 'Community volunteer', 'Chadiza', 'Chadiza', null],
    ['Mwaka Nyirenda', 'MoH Lundazi DHO', 'Lundazi', 'Lundazi', airtel('204')],
    ['Chileshe Zimba', 'MoH Nyimba DHO', 'Nyimba', 'Nyimba', mtn('517')],
    ['Bertha Phiri', 'MoH Mambwe DHO', 'Mfuwe', 'Mambwe', airtel('960')],
    ['Joseph Mvula', 'MoH Sinda DHO', 'Sinda', 'Sinda', zanaco('7702')],
    ['Esther Banda', 'MoH Vubwi DHO', 'Vubwi', 'Vubwi', airtel('118')],
    ['Lackson Tembo', 'MoH Chipangali DHO', 'Chipangali', 'Chipangali', mtn('645')],
    ['Naomi Sakala', 'MoH Kasenengwa DHO', 'Kasenengwa', 'Kasenengwa', airtel('377')],
    ['Patrick Njobvu', 'MoH Lumezi DHO', 'Lumezi', 'Lumezi', fnb('2290')],
    ['Grace Mwale', 'MoH Chasefu DHO', 'Chasefu', 'Chasefu', airtel('531')],
    ['Isaac Lungu', 'Chipata DHO — host site', 'Chipata', 'Chipata', zanaco('1186'), true],
    ['Doreen Miti', 'MoH Petauke DHO', 'Petauke', 'Petauke', mtn('829')],
    ['Kennedy Daka', 'MoH Katete DHO', 'Katete', 'Katete', airtel('064')],
    ['Ruth Chirwa', 'MoH Chadiza DHO', 'Chadiza', 'Chadiza', airtel('712')],
    ['Moses Zulu', 'Chipata General Hospital — host site', 'Chipata', 'Chipata', mtn('493'), true],
  ];
  const lines: ExternalParticipantLine[] = specs.map(([fullName, organisation, dutyStationName, district, payout, host], i) => {
    const participant: ExternalParticipant = { id: `xp-${String(i + 1).padStart(3, '0')}`, fullName, organisation, dutyStationName, district, payout, phone: payout?.type === 'MOBILE_MONEY' ? `+260 9x xxx ${payout.numberMasked.slice(-3)}` : undefined };
    externalParticipants.push(participant);
    const calc = computeExternalLine({ isHostSite: !!host, ihmProvidesTransport: false, payout }, { days: 3, endsBeforeNoon: false }, extRates);
    return { participantId: participant.id, fullName, organisation, dutyStationName, isHostSite: !!host, ihmProvidesTransport: false, payout, ...calc };
  });
  externalPayments.push({
    id: 'EXT-2026-0057',
    activityTitle: 'Community health worker training',
    activityLocation: 'loc-chipata',
    activityLocationName: 'Chipata — Eastern PHO',
    startDate: '2026-09-16',
    endDate: '2026-09-18',
    endsBeforeNoon: false,
    requesterId: 'u-lombe',
    requesterName: 'Lombe Musonda',
    costCentreId: 'CC-108',
    participants: lines,
    totals: summariseExternal(lines),
    rates: { dsaRateId: dsa.id, dsaPerDay: dsa.value, lunchPerDay: lunch.value, transportFlat: transport.value, dsaEffectiveFrom: dsa.effectiveFrom },
    status: 'CC_HEAD_REVIEW',
    workflow: { id: extWf.id, version: extWf.version, stages: extWf.stages },
    currentStageIndex: 0,
    approvals: [],
    acquittal: { acquittalSheets: [] },
    createdAt: cat('2026-09-01', '14:20'),
    updatedAt: cat('2026-09-02', '16:45'),
    approverIds: [],
  });
  addNotification('u-bwalya', 'External payment awaiting your approval', `Lombe Musonda · EXT-2026-0057 · Community health worker training, Chipata · ZMW ${summariseExternal(lines).total.toFixed(2)}`, '/finance/external-payments/EXT-2026-0057', 'APPROVAL_PENDING', cat('2026-09-02', '16:45'));
  addAudit('externalPayment', 'EXT-2026-0057', 'SUBMITTED', 'u-lombe', cat('2026-09-02', '16:45'), { stage: 'cc_head', newValue: { status: 'CC_HEAD_REVIEW' } });
}

// ---------- write everything ----------

async function clearCollection(name: string): Promise<void> {
  await db.recursiveDelete(db.collection(name));
}

async function clearAuthUsers(): Promise<number> {
  let removed = 0;
  let token: string | undefined;
  do {
    const page = await auth.listUsers(1000, token);
    if (page.users.length) {
      await auth.deleteUsers(page.users.map((u) => u.uid));
      removed += page.users.length;
    }
    token = page.pageToken;
  } while (token);
  return removed;
}

async function writeAll<T extends { id: string }>(col: string, docs: T[]): Promise<void> {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + 400)) batch.set(db.collection(col).doc(d.id), d);
    await batch.commit();
  }
}

async function uploadPlaceholders(): Promise<void> {
  const bucket = storage.bucket();
  for (const a of attachments) {
    if (!storageOk) return;
    try {
      await bucket.file(a.storagePath).save(a.contentType === 'application/pdf' ? PDF_BYTES : JPG_BYTES, { contentType: a.contentType, resumable: false });
    } catch (e) {
      storageOk = false;
      console.warn(`  ! storage emulator unavailable (${(e as Error).message.split('\n')[0]}) — attachment metadata kept, bytes skipped`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`Seeding IHM TMS demo data into emulators (project ${process.env.GCLOUD_PROJECT}, anchor date ${TODAY})`);

  const owned = Object.values(COL);
  await Promise.all(owned.map(clearCollection));
  console.log(`  cleared ${owned.length} collections`);
  const removed = await clearAuthUsers();
  console.log(`  removed ${removed} auth users`);

  for (const p of PEOPLE) {
    await auth.createUser({ uid: p.uid, email: emailOf(p), emailVerified: true, password: PASSWORD, displayName: p.name });
    await auth.setCustomUserClaims(p.uid, { roles: p.roles });
  }
  console.log(`  created ${PEOPLE.length} auth users`);

  await writeAll(COL.users, PEOPLE.map(profileOf));
  await writeAll(COL.departments, departments);
  await writeAll(COL.units, units);
  await writeAll(COL.projects, projects);
  await writeAll(COL.costCentres, costCentres);
  await writeAll(COL.locations, locations);
  await writeAll(COL.vendors, vendors);
  await writeAll(COL.vehicles, vehicles);
  await writeAll(COL.rates, rates);
  await writeAll(COL.workflows, workflows);
  await db.collection(COL.policies).doc('current').set(policy);
  await writeAll(COL.travelRequests, requests);
  await writeAll(COL.trips, trips);
  await writeAll(COL.liquidations, liquidations);
  await writeAll(COL.vehicleBookings, bookings);
  await writeAll(COL.mileageClaims, claims);
  await writeAll(COL.externalPayments, externalPayments);
  await writeAll(COL.externalParticipants, externalParticipants);
  await writeAll(COL.attachments, attachments);
  await writeAll(COL.notifications, notifications);
  await writeAll(COL.auditEvents, auditEvents);
  const counters = [
    { id: `TRV-${YEAR}`, prefix: 'TRV', year: YEAR, value: Math.max(...requests.map((r) => r.seq)) },
    { id: `VEH-${YEAR}`, prefix: 'VEH', year: YEAR, value: Math.max(...bookings.map((b) => seqOf(b.id))) },
    { id: `MIL-${YEAR}`, prefix: 'MIL', year: YEAR, value: Math.max(...claims.map((c) => seqOf(c.id))) },
    { id: `EXT-${YEAR}`, prefix: 'EXT', year: YEAR, value: Math.max(...externalPayments.map((e) => seqOf(e.id))) },
    { id: `LIQ-${YEAR}`, prefix: 'LIQ', year: YEAR, value: Math.max(...liquidations.map((l) => seqOf(l.id))) },
  ];
  await writeAll(COL.counters, counters);
  await uploadPlaceholders();

  console.log(`  ${requests.length} travel requests · ${trips.length} trips · ${liquidations.length} liquidations · ${bookings.length} bookings · ${claims.length} mileage claims · ${externalPayments.length} external payments`);
  console.log(`  ${attachments.length} attachments (${storageOk ? 'bytes uploaded to storage emulator' : 'metadata only'}) · ${notifications.length} notifications · ${auditEvents.length} audit events`);

  const chanda = requests.filter((r) => r.requesterId === 'u-chanda' && ['IN_PROGRESS', 'AWAITING_LIQUIDATION', 'LIQUIDATION_REVIEW', 'LIQUIDATED', 'CLOSED'].includes(r.status));
  console.log(`  Chanda year-to-date: ${chanda.length} trips · ${chanda.reduce((s, r) => s + r.itinerary.nights, 0)} nights · ZMW ${chanda.reduce((s, r) => s + r.costing.total, 0).toLocaleString('en-ZM')}`);

  console.log('\nDemo logins (password for all: Password123!)');
  console.log('  ' + 'Email'.padEnd(34) + 'Name'.padEnd(24) + 'Roles');
  for (const p of PEOPLE) console.log('  ' + emailOf(p).padEnd(34) + p.name.padEnd(24) + (p.roles.length > 6 ? 'ALL ROLES (demo)' : p.roles.join(', ')));
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
