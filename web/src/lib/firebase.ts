'use client';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'fake-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'ihm-tms-dev',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;

export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(config);
  return app;
}

export function firebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(firebaseApp());
    if (USE_EMULATORS && typeof window !== 'undefined') {
      const host = process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL ?? 'http://127.0.0.1:9099';
      // connectAuthEmulator throws if called twice; guard with a flag on the instance.
      const flagged = authInstance as Auth & { __emu?: boolean };
      if (!flagged.__emu) {
        connectAuthEmulator(authInstance, host, { disableWarnings: true });
        flagged.__emu = true;
      }
    }
  }
  return authInstance;
}

export const googleProvider = new GoogleAuthProvider();
