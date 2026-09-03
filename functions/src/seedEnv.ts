/**
 * Emulator defaults for the seed script. Imported FIRST by seed.ts so the environment is in place
 * before firebase-admin initialises (ESM import order is preserved by esbuild).
 */
process.env.GCLOUD_PROJECT ??= 'ihm-tms-dev';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
process.env.FIREBASE_CONFIG ??= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT, storageBucket: `${process.env.GCLOUD_PROJECT}.appspot.com` });

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|host\.docker\.internal)(:\d+)?$/.test(host)) {
  console.error(`Refusing to seed: FIRESTORE_EMULATOR_HOST must point at a local emulator (got "${host ?? 'unset'}").`);
  process.exit(2);
}
export {};
