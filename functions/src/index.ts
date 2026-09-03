import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createApp } from './app';
import { runDailyJobs } from './services/jobs';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10, memory: '512MiB', timeoutSeconds: 60 });

const app = createApp();

/** REST API — https://<region>-<project>.cloudfunctions.net/api/api/v1/... (rewrite /api in front of it in prod). */
export const api = onRequest({ cors: false }, app);

/** Nightly SOP automation: open liquidations on return date, mark overdue, send reminders (SRS §19.1, §19.3). */
export const dailyJobs = onSchedule({ schedule: 'every day 04:00', timeZone: 'Africa/Lusaka' }, async () => {
  await runDailyJobs();
});
