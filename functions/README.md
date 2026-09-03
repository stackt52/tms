# IHM TMS — REST API (`functions/`)

Express API for the IHM Southern Africa Travel Management System, deployed as a single 2nd-gen Cloud Function (`api`) plus a scheduled function (`dailyJobs`). Firestore is the datastore (Admin SDK only — clients never read Firestore directly), Cloud Storage holds uploaded files, Firebase Auth issues the ID tokens.

All routes live under `/api/v1` and require `Authorization: Bearer <Firebase ID token>`. Responses use the DTOs in `packages/shared/src/api.ts`; errors are `{ error: { code, message, details? } }`. All timestamps are ISO-8601 strings; money is ZMW rounded to 2 dp. Every business calculation (eligibility, costing, advance, gate, liquidation reconciliation, mileage, external allowances, effective-dated rates) comes from the shared policy engine in `packages/shared/src/policy.ts` — nothing is re-implemented here.

## Layout

```
src/
  index.ts            Cloud Functions entry: `api` (onRequest) + `dailyJobs` (onSchedule 04:00 Africa/Lusaka)
  app.ts              Express app, CORS, JSON, auth middleware, error handler
  lib/                firebase (db/auth/storage/COL), auth, context (actor/roles), errors, http (wrap/parseBody),
                      ids (nextRef counters), audit (audit + notify), query (getMany/queryIn/paged), mask
  routes/             thin routers, zod validation → services
  services/           domain logic (one file per bounded context)
  seed.ts, seedEnv.ts emulator-only demo data
scripts/smoke.mjs     end-to-end smoke test against the emulators
```

Authorisation is entirely server-side (SRS §6/§24): every route checks roles and/or ownership via `services/access.ts` (`canViewRequest`, `canViewAll`, stage-role checks, supervisor unit scoping) and per-service guards.

## Route table

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | liveness |
| GET / PATCH | `/me` | any | `MeResponse`; PATCH phone / bank / mobileMoney / driverLicenceExpiry (account numbers are masked on write) |
| GET | `/master-data` | any | departments, units, projects, costCentres, locations, vendors, users (picker subset) |
| GET | `/dashboard` | any | `DashboardResponse` (blockers, current trip, year stats, my requests, liquidations due, approvals pending) |
| GET | `/dashboard/finance` | finance viewers | `FinanceDashboardResponse` |
| GET | `/travel-requests?scope=mine\|team\|all&status=A,B&limit=` | any (scope-gated) | `Paged<TravelRequest>` |
| POST | `/travel-requests` | any | new DRAFT (`TRV-YYYY-####`), defaults from profile |
| GET | `/travel-requests/:id[?audit=1]` | owner / chain / view-all | `TravelRequestDetail` incl. approval chain |
| PATCH | `/travel-requests/:id` | requester / admin, editable statuses | deep-merge; recomputes nights, distance, eligibility, per-diem + accommodation auto lines, costing; `attachments` replaced (re-hydrated from `attachments` collection); material edits after return bump `version` and invalidate approvals |
| POST | `/travel-requests/:id/eligibility-preview` | any | stateless `EligibilityPreviewResponse` |
| POST | `/travel-requests/:id/submit` | requester / admin | validation (422 `VALIDATION`), workflow snapshot, notifies first-stage approvers; clarification resumes at `resumeStageIndex` |
| POST | `/travel-requests/:id/cancel` | requester before approval / admin | → CANCELLED |
| GET | `/travel-requests/:id/audit` | viewers | `AuditEvent[]` |
| GET | `/approvals/queue` | any | `ApprovalQueueResponse` (TRV at actor's stage, EXT, MIL for supervisor/finance, VEH for fleet) |
| GET | `/approvals/:requestId` | viewers | `ApprovalDetailResponse` (stage, SOP §9.2 checklist, saved tick state, canAct, actingRole) |
| PUT | `/approvals/:requestId/checklist` | actor who can act | saves draft ticks (`approvalDrafts/{requestId}_{uid}`) |
| POST | `/approvals/:requestId/decide` | actor who can act (incl. delegation) | APPROVED on checklist stage needs all 7 ticks (422 `CHECKLIST_INCOMPLETE`); final approval creates trip, advance record + gate, arrangements queue |
| GET | `/trips?scope=` | any | active + closed trips with `trip` |
| GET | `/trips/:id` | viewers | `TripDetailResponse` (404 until approved) |
| POST / PATCH | `/trips/:id/arrangements[/:aid]` | Procurement / Office Mgmt / admin | all CONFIRMED + advance released → READY_FOR_TRAVEL, "Booking confirmed" |
| POST / DELETE | `/trips/:id/documents[/:docId]` | traveller / procurement / finance | link uploaded attachment |
| POST | `/trips/:id/start` | traveller / admin | → IN_PROGRESS (daily job also does this) |
| POST | `/files` (multipart `file`, `kind`) | any | ≤10 MB image/PDF → `uploads/{uid}/{id}-{name}`; returns `UploadResponse` |
| GET | `/files/:id` | uploader or finance/approver/fleet/procurement/admin/auditor | streams the file |
| GET | `/liquidations?scope=mine\|review\|all` | any / finance | `Paged<Liquidation>` |
| GET | `/liquidations/:id`, `/liquidations/by-request/:requestId` | traveller / supervisor / view-all | `LiquidationDetailResponse` (readiness, daysRemaining, can*) |
| POST | `/liquidations/open/:requestId` | traveller | open early (READY/IN_PROGRESS) |
| PATCH | `/liquidations/:id` | traveller (OPEN/RETURNED) | lines / partial tripReport merge / refundReference; reconciliation recomputed |
| POST / DELETE | `/liquidations/:id/lines[/:lineId]` | traveller | add / remove expense line |
| POST | `/liquidations/:id/lines/:lineId/receipts`, `/liquidations/:id/boarding-passes` | traveller | attach uploaded file |
| POST | `/liquidations/:id/trip-report/submit` · `/approve` | traveller · supervisor | |
| POST | `/liquidations/:id/submit` | traveller | 422 `LIQUIDATION_NOT_READY` unless ready; request → LIQUIDATION_REVIEW |
| POST | `/liquidations/:id/review` | Finance Accountant / Director | APPROVED → CLOSED (request CLOSED) · RETURNED |
| GET | `/vehicles` · POST/PATCH `/vehicles[/:id]` | any · fleet/admin | fleet master data |
| GET | `/vehicle-bookings/calendar?from&to` | any | `FleetCalendarResponse` |
| GET / POST | `/vehicle-bookings` | any | create → 409 `BOOKING_CONFLICT` (`details.conflicts`), 422 `VEHICLE_UNAVAILABLE` |
| GET | `/vehicle-bookings/:id` | requester / driver / fleet / view-all | |
| POST | `/vehicle-bookings/:id/assign` · `/reject` · `/cancel` | fleet · fleet · requester/fleet | |
| POST | `/vehicle-bookings/:id/steps` | requester / fleet | licence → pre_inspection → keys_out → return_inspection → key_return (dual sign-off); 422 `STEP_ORDER` |
| POST | `/vehicle-bookings/:id/photos` | requester / fleet | max 6 |
| GET / POST | `/mileage-claims` | any | create prices with effective `MILEAGE_RATE` |
| GET / PATCH | `/mileage-claims/:id` | claimant / supervisor / view-all | `MileageDetailResponse` |
| POST | `/mileage-claims/:id/evidence` · `/submit` · `/decide` · `/pay` | claimant · claimant · supervisor/finance · finance | 422 `EVIDENCE_MISSING` |
| GET | `/finance/advances` | finance viewers | `AdvanceQueueResponse`, gate re-evaluated at read time |
| POST | `/finance/advances/:requestId/milestones` | per milestone role | ordered PREPARED→SUBMITTED→AUTH_1→AUTH_2→RELEASED; 422 `ADVANCE_NOT_CLEAR` |
| POST | `/finance/advances/:requestId/exception` · `/exception/approve` | Finance Accountant · Finance Director | lead-time exception |
| GET | `/finance/liquidations` | finance viewers | SUBMITTED liquidations |
| GET / POST | `/external-payments` | any | create snapshots EXTERNAL_DSA / LUNCH / TRANSPORT rates on start date |
| GET | `/external-payments/:id` | requester / CC owner / chain / view-all | `ExternalPaymentDetailResponse` |
| PUT | `/external-payments/:id/participants` | requester (DRAFT/RETURNED) | replaces list, upserts `externalParticipants`, masks payout numbers, recomputes lines |
| POST | `/external-payments/:id/submit` · `/decide` · `/pay` · `/acquittal` | requester · stage role · finance · requester/finance | APPROVED with a missing payout → 422 `PAYOUT_MISSING` |
| GET | `/admin/overview` · `/rates` · `/workflows` · `/policy` · `/vendors` · `/users` | SYSTEM_ADMIN, AUDITOR | |
| POST / PATCH | `/admin/rates[/:id]`, `/admin/workflows`, `/admin/policy`, `/admin/vendors[/:id]`, `/admin/users/:id`, `/admin/{departments\|units\|projects\|cost-centres\|locations}[/:id]` | SYSTEM_ADMIN | new rate closes the open one the day before; new workflow version deactivates the previous; roles mirrored to custom claims |
| GET | `/notifications` · POST `/notifications/:id/read` · `/read-all` | any | latest 30 + unread count |
| GET | `/search?q=` | any | in-memory match over recent requests, claims, bookings, external payments (visibility-filtered) |
| POST | `/jobs/run-daily` | SYSTEM_ADMIN | runs `runDailyJobs()` and returns the summary |

### Daily job (`services/jobs.ts`, scheduled 04:00 Africa/Lusaka)
1. READY_FOR_TRAVEL / TRAVEL_ARRANGEMENTS with departure reached → IN_PROGRESS.
2. IN_PROGRESS with return reached → `ensureLiquidation` → AWAITING_LIQUIDATION + "Liquidation due …" notification.
3. Reminders 2 days before, on the due date and when overdue (weekly), deduped via `remindersSent[]`.
4. Re-evaluates pending advances and tells travellers when a new advance is blocked by an outstanding liquidation.

## Environment

| Variable | Purpose |
| --- | --- |
| `GCLOUD_PROJECT` / `FIREBASE_CONFIG` | set by Cloud Functions; the seed defaults them to `demo-ihm-tms` |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST` | set automatically by the functions emulator; the seed defaults them to `127.0.0.1:8080 / 9099 / 9199` and refuses non-local Firestore hosts |
| `STORAGE_BUCKET` | optional override for the upload bucket (defaults to the project's default bucket) |
| `API_BASE` | smoke script only — API origin (default `http://127.0.0.1:5001/demo-ihm-tms/us-east4/api`) |

Firestore indexes live in `../firestore.indexes.json` (already covers the list queries used here; deploy with `firebase deploy --only firestore:indexes`).

## Build, test, run

```bash
npm run typecheck -w functions       # tsc --noEmit (includes packages/shared)
npm run build -w functions           # esbuild → lib/index.js (bundles @tms/shared, externalises runtime deps)
npm test -w functions                # vitest unit tests (recompute, approval chain, queue tags, conflicts, masking)

# emulators (Java required) — Auth 9099, Firestore 8080, Functions 5001, Storage 9199, UI 4000
npm run dev -w functions             # build --watch + emulators with import/export of ../.emulator-data
npm run seed -w functions            # in another terminal: reset + seed demo data into the running emulators

# one-shot: start emulators, seed, run the smoke test, shut down
npm run emulate:smoke -w functions
```

The API is reachable in the emulator at `http://127.0.0.1:5001/demo-ihm-tms/us-east4/api/api/v1/...`. Point the web app at it with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5001/demo-ihm-tms/us-east4/api`.

## Demo logins (seed) — password `Password123!`

| Email | Name | Roles |
| --- | --- | --- |
| chanda.mwansa@ihm.org.zm | Chanda Mwansa | TRAVELLER (dashboard / liquidation / mileage mock persona) |
| mercy.tembo@ihm.org.zm | Mercy Tembo | TRAVELLER |
| joseph.banda@ihm.org.zm | Joseph Banda | TRAVELLER |
| natasha.zulu@ihm.org.zm | Natasha Zulu | TRAVELLER |
| kelvin.phiri@ihm.org.zm | Kelvin Phiri | TRAVELLER (self-drive booking VEH-2026-0143) |
| thandiwe.mulenga@ihm.org.zm | Thandiwe Mulenga | UNIT_SUPERVISOR, TRAVELLER (approval queue persona) |
| bwalya.kapaya@ihm.org.zm | Bwalya Kapaya | HEAD_OF_DEPARTMENT, COST_CENTRE_OWNER, TRAVELLER |
| lombe.musonda@ihm.org.zm | Lombe Musonda | FINANCE_ACCOUNTANT, TRAVELLER (finance queue / external payments) |
| ruth.sakala@ihm.org.zm | Ruth Sakala | FINANCE_DIRECTOR |
| mwaba.simukonda@ihm.org.zm | Mwaba Simukonda | PROJECT_DIRECTOR |
| kunda.mwale@ihm.org.zm | Kunda Mwale | CEO |
| precious.lungu@ihm.org.zm | Precious Lungu | PROCUREMENT_OFFICER |
| grace.nkonde@ihm.org.zm | Grace Nkonde | OFFICE_MANAGEMENT, FLEET_ADMIN |
| elias.chirwa@ihm.org.zm | Elias Chirwa | TRAVELLER (driver) |
| admin@ihm.org.zm | System Administrator | every role (demo) |

Seeded anchor date is **2026-09-03**: TRV-2026-0412 (Ndola, READY_FOR_TRAVEL, advance released), TRV-2026-0405 (liquidation due 07 Sep with the mock's expense lines), TRV-2026-0389 (overdue liquidation blocking TRV-2026-0417's advance), TRV-2026-0416 (lead time short), TRV-2026-0418/0419/0420 awaiting Thandiwe, TRV-2026-0421 draft, VEH-2026-0143/0144/0145, MIL-2026-0092/0094, EXT-2026-0057.

## Firestore collections

`users, departments, units, projects, costCentres, locations, vendors, vehicles, externalParticipants, travelRequests, trips, liquidations, vehicleBookings, mileageClaims, externalPayments, rates, workflows, policies (doc: current), counters, notifications, auditEvents, attachments, delegations, approvalDrafts`. Documents are plain JSON mirroring the shared types (no Firestore Timestamps). Denormalised query helpers on travel requests: `travellerIds[]`, `approverIds[]`, `resumeStageIndex`.
