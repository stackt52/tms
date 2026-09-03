import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// Initialise once at module scope (ADC in Cloud Functions; emulator env vars locally).
if (getApps().length === 0) initializeApp();

export const db: Firestore = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth();
export const storage = getStorage();

export const COL = {
  users: 'users',
  departments: 'departments',
  units: 'units',
  projects: 'projects',
  costCentres: 'costCentres',
  locations: 'locations',
  vendors: 'vendors',
  vehicles: 'vehicles',
  externalParticipants: 'externalParticipants',
  travelRequests: 'travelRequests',
  trips: 'trips',
  liquidations: 'liquidations',
  vehicleBookings: 'vehicleBookings',
  mileageClaims: 'mileageClaims',
  externalPayments: 'externalPayments',
  rates: 'rates',
  workflows: 'workflows',
  policies: 'policies',
  counters: 'counters',
  notifications: 'notifications',
  auditEvents: 'auditEvents',
  attachments: 'attachments',
  delegations: 'delegations',
  approvalDrafts: 'approvalDrafts',
} as const;

/** Actor used by scheduled jobs and system automation in the audit trail. */
export const SYSTEM_ACTOR = { uid: 'system', name: 'System' } as const;

export const nowIso = () => new Date().toISOString();
