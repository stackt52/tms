/* eslint-disable no-console */
/**
 * Organisation master data and policy configuration shared by the emulator demo seed (seed.ts)
 * and the production bootstrap (seedProd.ts). Person ids (u-*) only exist in the demo seed;
 * seedProd strips them.
 */
import { DEFAULT_POLICY, DEFAULT_WORKFLOWS } from '@tms/shared';
import type { CostCentre, Department, Location, PolicyConfig, Project, Rate, Unit, Vehicle, Vendor, WorkflowDefinition } from '@tms/shared';

/** Zambia local time (CAT, UTC+2) → ISO UTC. */
const cat = (date: string, time = '08:00') => new Date(`${date}T${time}:00+02:00`).toISOString();

// ---------- org + master data ----------

export const departments: Department[] = [
  { id: 'dept-programmes', name: 'Programmes', hodId: 'u-bwalya' },
  { id: 'dept-finops', name: 'Finance & Operations', hodId: 'u-ruth' },
];
export const units: Unit[] = [
  { id: 'unit-hsu', name: 'Health Systems Unit', departmentId: 'dept-programmes', supervisorId: 'u-thandiwe' },
  { id: 'unit-me', name: 'M&E Unit', departmentId: 'dept-programmes', supervisorId: 'u-thandiwe' },
  { id: 'unit-finance', name: 'Finance', departmentId: 'dept-finops', supervisorId: 'u-ruth' },
];
export const projects: Project[] = [
  { id: 'GHSC-Z', name: 'Global Health Supply Chain – Zambia', managerId: 'u-thandiwe', directorId: 'u-mwaba', active: true },
  { id: 'MCH-Z', name: 'Maternal & Child Health Zambia', managerId: 'u-thandiwe', directorId: 'u-mwaba', active: true },
];
export const costCentres: CostCentre[] = [
  { id: 'CC-114', name: 'GHSC-Z field operations', ownerId: 'u-bwalya', projectId: 'GHSC-Z', fundingSource: 'PROJECT', budget: 1_850_000 },
  { id: 'CC-108', name: 'MCH-Z community outreach', ownerId: 'u-bwalya', projectId: 'MCH-Z', fundingSource: 'PROJECT', budget: 1_200_000 },
  { id: 'CC-101', name: 'Overhead', ownerId: 'u-ruth', fundingSource: 'OVERHEAD', budget: 640_000 },
];
const loc = (id: string, name: string, town: string, province: string, lat: number, lng: number, extra: Partial<Location> = {}): Location => ({ id, name, town, province, country: 'ZM', lat, lng, isDutyStation: false, ...extra });
export const locations: Location[] = [
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
export const LOC = Object.fromEntries(locations.map((l) => [l.id, l])) as Record<string, Location>;
export const vendors: Vendor[] = [
  { id: 'ven-proflight', name: 'Proflight Zambia', category: 'AIRLINE', contact: 'reservations@proflight-zambia.com', locations: ['Lusaka', 'Ndola', 'Livingstone', 'Solwezi', 'Mansa'], contractValidTo: '2027-03-31', active: true },
  { id: 'ven-voyagers', name: 'Voyagers Travel', category: 'TRAVEL_AGENT', contact: 'ihm@voyagerszambia.com', locations: ['Lusaka'], contractValidTo: '2027-06-30', active: true },
  { id: 'ven-protea-ndola', name: 'Protea Hotel Ndola', category: 'HOTEL', contact: '+260 212 621 555', locations: ['Ndola'], contractValidTo: '2026-12-31', active: true, approvedRate: 'ZMW 1,450/night B&B' },
  { id: 'ven-avani', name: 'Avani Victoria Falls', category: 'HOTEL', contact: '+260 213 321 122', locations: ['Livingstone'], contractValidTo: '2026-12-31', active: true, approvedRate: 'ZMW 2,150/night B&B' },
  { id: 'ven-avis', name: 'Avis Zambia', category: 'CAR_RENTAL', contact: 'lusaka@avis.co.zm', locations: ['Lusaka', 'Ndola', 'Livingstone'], contractValidTo: '2027-01-31', active: true, approvedRate: 'ZMW 1,650/day 4×4 incl. super waiver' },
  { id: 'ven-europcar', name: 'Europcar Zambia', category: 'CAR_RENTAL', contact: 'bookings@europcar.co.zm', locations: ['Lusaka', 'Ndola'], contractValidTo: '2026-11-30', active: true },
  { id: 'ven-ndola-shuttle', name: 'Ndola Airport Shuttle', category: 'SHUTTLE', contact: '+260 97 555 0101', locations: ['Ndola'], active: true, approvedRate: 'ZMW 300/transfer' },
];
export const vehicles: Vehicle[] = [
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
export const rates: Rate[] = [
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
export const workflows: WorkflowDefinition[] = DEFAULT_WORKFLOWS.map((w) => ({ ...w, createdAt: cat('2025-12-15'), createdBy: 'u-admin' }));
export const policy: PolicyConfig = { ...DEFAULT_POLICY, updatedAt: cat('2026-01-01'), updatedBy: 'u-admin' };
