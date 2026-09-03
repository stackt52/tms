# IHM Southern Africa — Travel Management System (TMS)

A web-based Travel Management System that digitises IHM Southern Africa's Travel SOP: guided travel requests, configurable multi-level approvals with the SOP §9.2 supervisor checklist, 75% travel advances with lead-time and outstanding-liquidation gating, procurement/arrangements, fleet & self-drive vehicle booking, private-vehicle mileage claims, external-party allowance payments (no cash), five-day liquidation with reconciliation, and effective-dated policy administration.

Built from the design handoff in [`design_handoff_ihm_tms/`](design_handoff_ihm_tms/README.md) (12 Material 3 Expressive screens, seed `#00696D`) and the bundled SRS.

## Architecture

```
web/                Next.js 16 (App Router, TypeScript) — Firebase App Hosting
  └─ calls ──►  /api/v1/*  (same-origin proxy in prod, emulator URL in dev)
functions/          Express REST API on Cloud Functions (2nd gen) + scheduled daily SOP job
  └─ Admin SDK ─►  Firestore (documents) · Cloud Storage (receipts, photos) · Firebase Auth (ID tokens)
packages/shared/    @tms/shared — domain types, status model, workflow defaults, pure policy engine, REST DTO contract
```

- **Authentication**: Firebase Auth (email/password + Google Workspace). The web app sends the ID token as a Bearer header; the API verifies it and loads the user's roles from `users/{uid}`. All authorisation decisions are server-side (SRS §6, §24); Firestore/Storage rules deny all direct client access.
- **Policy as configuration** (SRS §23.3): rates (advance %, mileage ZMW/km, external DSA/lunch/transport, per diem, stationery cap) are effective-dated documents; approval workflows are versioned per travel category; thresholds and toggles live in `policies/config`. The pure policy engine in `packages/shared/src/policy.ts` is unit-tested and shared by API and UI.
- **Status model**: SRS Appendix B (`DRAFT → … → CLOSED`, plus `REJECTED / CANCELLED / RETURNED_FOR_CORRECTION / CLARIFICATION_REQUESTED / ON_HOLD`), rendered as status chips and a 6-stage process timeline.
- **Audit & notifications**: every significant action writes an immutable `auditEvents` record and in-app notifications (SRS §21.1, §23.2).
- **Daily job** (`dailyJobs`, 04:00 Africa/Lusaka): starts trips on departure, opens liquidations on the return date (Awaiting Liquidation), computes the 5-day deadline, sends reminders and flags blocked advances.

## Repository layout

| Path | What |
| --- | --- |
| `web/src/components/m3` | Material 3 Expressive component layer (buttons, chips, cards, outlined fields, switches, timelines, dialogs, toasts, upload tiles) |
| `web/src/components/shell` | Nav rail (desktop), bottom nav + FAB (mobile), top bar with search/notifications/account, auth gate |
| `web/src/screens/*` | The 12 handoff screens + supporting lists/forms |
| `web/src/lib` | Firebase client, API client, auth context, React Query hooks |
| `functions/src/routes`, `functions/src/services` | REST routes (thin) and domain services |
| `functions/src/seed.ts` | Demo data for the emulators (Zambian sample data matching the mockups) |
| `packages/shared/src` | `types.ts`, `status.ts`, `workflow.ts`, `policy.ts`, `api.ts`, `format.ts`, tests |
| `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json` | Firebase project config |
| `web/apphosting.yaml` | App Hosting runtime/env configuration |

## Running locally

Prerequisites: Node 22+, Java 17+ (Firestore emulator), Firebase CLI (`npm i -g firebase-tools`).

```bash
npm install
cp web/.env.example web/.env.local        # already points at the emulators
npm run emulators                        # Auth :9099 · Firestore :8080 · Functions :5001 · Storage :9199 · UI :4000
```

In a second terminal:

```bash
npm run seed                             # demo users + data (emulator only)
npm run dev -w web                       # http://localhost:3000
```

Sign in with a demo persona (password `Password123!`), e.g. `chanda.mwansa@ihm.org.zm` (traveller), `thandiwe.mulenga@ihm.org.zm` (supervisor), `lombe.musonda@ihm.org.zm` (finance), `grace.nkonde@ihm.org.zm` (office management / fleet), `admin@ihm.org.zm` (all roles). The login page lists them when emulators are enabled.

`npm run dev -w functions` rebuilds the API on change while the emulators run. Note that the seed script also creates Auth users, so start the emulators before seeding.

## Verification

```bash
npm run typecheck   # all workspaces
npm test            # shared policy engine + API unit tests
npm run build       # shared typecheck, API bundle, Next.js build
```

## Deploying to Firebase

1. Create a Firebase project (Blaze plan) and enable Authentication (Email/Password, Google), Firestore (native mode), Cloud Storage, Cloud Functions and App Hosting. Update `.firebaserc` and the project ids in `web/apphosting.yaml`.
2. Deploy rules, indexes and the API:
   ```bash
   firebase deploy --only firestore,storage,functions
   ```
   The API is served at `https://europe-west1-<project>.cloudfunctions.net/api/api/v1/...`.
3. Web app on App Hosting — connect the GitHub repo and set the backend's root directory to `web/`:
   ```bash
   firebase apphosting:backends:create --project <project>
   firebase apphosting:secrets:set tms-firebase-api-key
   firebase apphosting:secrets:set tms-firebase-app-id
   ```
   `web/apphosting.yaml` sets `API_PROXY_ORIGIN` so the browser calls `/api/v1/*` same-origin and Next.js proxies to the function. Pushes to `main` trigger rollouts.
4. Bootstrap production data: run the master-data/rates/workflow parts of the seed against production once (`GCLOUD_PROJECT=<project> node functions/lib/seed.js --production-config`) or enter them through **Admin → Rates / Workflows / Policy rules / Master data**, then grant `SYSTEM_ADMIN` to the first administrator's `users/{uid}` document.

## Policy points that stay configurable (SRS §28)

The exact approval chains, whether the 5-day lead time is calendar or working days (implemented as working days), the 75% advance scope, per-diem and external DSA rates, and whether Finance may override a liquidation block (implemented as a Finance Director-approved exception) are all configuration, not code.
