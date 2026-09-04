/**
 * Initialises the Admin SDK against a REAL project using the Firebase CLI's signed-in account
 * (~/.config/configstore/firebase-tools.json). Must be imported before anything that touches lib/firebase.
 * Refuses to run with emulator hosts set, so it can never be confused with the demo seed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';

const argv = process.argv.slice(2);
const argOf = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

export const PROJECT_ID = argOf('--project') ?? process.env.GCLOUD_PROJECT;
if (!PROJECT_ID) throw new Error('Usage: node lib/seedProd.js --project <projectId> --admin-email <email> --admin-name "<name>" --yes');
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('seedProd targets a real project; unset FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST.');
if (!argv.includes('--yes')) throw new Error(`Refusing to write to project ${PROJECT_ID} without --yes.`);

process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;

// Firebase CLI OAuth client (public constants from firebase-tools/lib/api.js) + the CLI's refresh token.
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const configstore = JSON.parse(readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8')) as { tokens?: { refresh_token?: string }; user?: { email?: string } };
const refresh = configstore.tokens?.refresh_token;
if (!refresh) throw new Error('No Firebase CLI login found. Run `firebase login` first.');
export const CLI_USER = configstore.user?.email ?? 'firebase-cli';

// Firestore requires application-default (or certificate) credentials, so expose the CLI login as an
// ADC "authorized_user" file — the same shape gcloud writes to application_default_credentials.json.
const adcPath = join(tmpdir(), `tms-bootstrap-adc-${process.pid}.json`);
writeFileSync(adcPath, JSON.stringify({ type: 'authorized_user', client_id: FIREBASE_CLI_CLIENT_ID, client_secret: FIREBASE_CLI_CLIENT_SECRET, refresh_token: refresh, quota_project_id: PROJECT_ID }), { mode: 0o600 });
process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
process.on('exit', () => {
  try {
    require('node:fs').unlinkSync(adcPath);
  } catch {
    /* ignore */
  }
});

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}

export const ADMIN_EMAIL = argOf('--admin-email');
export const ADMIN_NAME = argOf('--admin-name') ?? 'System Administrator';
export const WEB_API_KEY = argOf('--api-key') ?? process.env.FIREBASE_WEB_API_KEY;
