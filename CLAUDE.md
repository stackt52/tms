# IHM TMS — working notes for agents

Monorepo (npm workspaces):
- `packages/shared` — `@tms/shared`: domain types, status model, workflow defaults, **pure policy engine** (eligibility, advance, liquidation, mileage, external allowances, effective-dated rates) and the REST DTO contract (`api.ts`). Unit-tested with vitest. Both other packages import it; never duplicate business rules elsewhere.
- `functions` — Express REST API deployed as a Cloud Function (2nd gen, `us-east4`) plus a scheduled daily job. Bundled with esbuild (`lib/index.js`); `@tms/shared` is inlined. Firestore via Admin SDK only; all authorisation is server-side.
- `web` — Next.js 16 App Router app for Firebase App Hosting. Client-side Firebase Auth; every data call goes through `src/lib/api.ts` → REST API with a Bearer ID token. UI = custom Material 3 Expressive layer in `src/components/m3` built to the handoff tokens (seed `#00696D`).

Commands (from repo root): `npm install` · `npm run emulators` (Auth/Firestore/Functions/Storage) · `npm run seed` (demo data, emulator only) · `npm run dev -w web` · `npm run typecheck` · `npm test` · `npm run build`.

Conventions: ISO strings for all timestamps in Firestore docs; ZMW money as numbers rounded with `round2`; routes are thin, logic lives in `functions/src/services`; screens are `'use client'` under `web/src/screens/<area>` and mounted from thin `web/src/app/(app)/**/page.tsx` files; data hooks live in `web/src/lib/queries.ts`.

Design source of truth: `design_handoff_ihm_tms/README.md` + `TMS Mockups.dc.html` (12 screens 1a–1l); requirements: the SRS docx in the same folder.
