#!/usr/bin/env node
/**
 * Smoke test against the local emulators (run after `node functions/lib/seed.js`).
 * Signs in demo users through the Auth emulator and exercises the main read endpoints,
 * plus a few mutations that must be rejected by policy (checklist gate, booking conflict).
 *
 *   node functions/scripts/smoke.mjs
 *   API_BASE=http://127.0.0.1:5001/ihm-tms-dev/europe-west1/api node functions/scripts/smoke.mjs
 */
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const PROJECT = process.env.GCLOUD_PROJECT ?? 'ihm-tms-dev';
const API = (process.env.API_BASE ?? `http://127.0.0.1:5001/${PROJECT}/europe-west1/api`).replace(/\/$/, '') + '/api/v1';
const PASSWORD = 'Password123!';

const tokens = new Map();
async function token(email) {
  if (tokens.has(email)) return tokens.get(email);
  const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  tokens.set(email, json.idToken);
  return json.idToken;
}

let failures = 0;
const results = [];
async function call(email, method, path, body, expectStatus = 200, summarise = (j) => '') {
  const t0 = Date.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token(email)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  } catch (e) {
    json = { error: { message: String(e) } };
  }
  const ok = status === expectStatus;
  if (!ok) failures++;
  let summary = '';
  try {
    summary = ok ? summarise(json) : JSON.stringify(json?.error ?? json).slice(0, 160);
  } catch (e) {
    summary = `summary failed: ${e.message}`;
    failures++;
  }
  const who = email.split('@')[0];
  results.push({ ok, status, method, path, who, ms: Date.now() - t0, summary });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${String(status).padEnd(3)} ${method.padEnd(5)} ${path.padEnd(58)} as ${who.padEnd(17)} ${summary}`);
  return json;
}

const CHANDA = 'chanda.mwansa@ihm.org.zm';
const THANDIWE = 'thandiwe.mulenga@ihm.org.zm';
const LOMBE = 'lombe.musonda@ihm.org.zm';
const GRACE = 'grace.nkonde@ihm.org.zm';
const ADMIN = 'admin@ihm.org.zm';
const MERCY = 'mercy.tembo@ihm.org.zm';

console.log(`Smoke test → ${API}\n`);

// Health (no auth)
{
  const res = await fetch(`${API}/health`).catch(() => null);
  console.log(`${res?.ok ? 'PASS' : 'FAIL'} ${res?.status ?? 0}   GET   /health`);
  if (!res?.ok) failures++;
}

await call(CHANDA, 'GET', '/me', null, 200, (j) => `${j.user.displayName} · unit ${j.unit?.name} · caps ${Object.entries(j.capabilities).filter(([, v]) => v).map(([k]) => k).join(',') || 'none'} · unread ${j.unreadNotifications}`);
await call(CHANDA, 'GET', '/dashboard', null, 200, (j) => `blockers ${j.blockers.length} (${j.blockers[0]?.requestId ?? '-'}) · current ${j.currentTrip?.id} ${j.currentTrip?.status} · year ${j.yearStats.trips}t/${j.yearStats.nights}n/ZMW ${j.yearStats.spend} · myRequests ${j.myRequests.length} · liqDue ${j.liquidationsDue.length}`);
await call(CHANDA, 'GET', '/master-data', null, 200, (j) => `${j.locations.length} locations · ${j.vendors.length} vendors · ${j.users.length} users`);
await call(CHANDA, 'GET', '/travel-requests?scope=mine', null, 200, (j) => `${j.items.length} items · first ${j.items[0]?.id} ${j.items[0]?.status}`);
await call(CHANDA, 'GET', '/travel-requests/TRV-2026-0412', null, 200, (j) => `${j.request.status} · total ${j.request.costing.total} · advance ${j.request.advance?.amount} ${j.request.advance?.policyStatus} · chain ${j.approvalChain.map((c) => c.state[0]).join('')} · trip arr ${j.trip?.arrangements.length} docs ${j.trip?.documents.length} · booking ${j.vehicleBooking?.id}`);
await call(CHANDA, 'GET', '/trips/TRV-2026-0412', null, 200, (j) => `${j.trip.title} · due ${j.trip.financials.liquidationDueDate}`);
await call(CHANDA, 'GET', '/trips?scope=mine', null, 200, (j) => `${j.items.length} trips`);
await call(CHANDA, 'GET', '/liquidations/by-request/TRV-2026-0405', null, 200, (j) => `${j.liquidation.id} ${j.liquidation.status} · days ${j.daysRemaining} · actual ${j.reconciliation?.totalActual ?? j.liquidation.reconciliation.totalActual} · ${j.liquidation.reconciliation.direction} ${j.liquidation.reconciliation.settlement} · ready ${j.readiness.ready} (${j.readiness.items.filter((i) => !i.ok).map((i) => i.label).join('; ') || 'all ok'}) · canSubmit ${j.canSubmit}`);
await call(CHANDA, 'POST', '/liquidations/LIQ-2026-0012/submit', null, 422, (j) => j.error?.code);
await call(CHANDA, 'GET', '/mileage-claims/MIL-2026-0094', null, 200, (j) => `${j.claim.amount} @ ${j.claim.ratePerKm}/km · policy ok ${j.policy.ok} (${j.policy.items.filter((i) => !i.ok).map((i) => i.key).join(',')}) · canSubmit ${j.canSubmit}`);
await call(CHANDA, 'POST', '/mileage-claims/MIL-2026-0094/submit', null, 422, (j) => j.error?.code);
await call(CHANDA, 'GET', '/vehicle-bookings/calendar?from=2026-09-07&to=2026-09-13', null, 200, (j) => `${j.vehicles.length} vehicles · ${j.bookings.length} bookings (${j.bookings.map((b) => `${b.id}:${b.status}`).join(' ')})`);
await call(CHANDA, 'GET', '/notifications', null, 200, (j) => `${j.items.length} items · unread ${j.unread} · latest "${j.items[0]?.title}"`);
await call(CHANDA, 'GET', '/search?q=ndola', null, 200, (j) => `${j.results.length} results · ${j.results.slice(0, 3).map((r) => r.id).join(', ')}`);
await call(CHANDA, 'GET', '/travel-requests/TRV-2026-0412/audit', null, 200, (j) => `${j.length} events`);
await call(CHANDA, 'GET', '/finance/advances', null, 403, (j) => j.error?.code);
await call(CHANDA, 'GET', '/admin/overview', null, 403, (j) => j.error?.code);
await call(CHANDA, 'GET', '/travel-requests/TRV-2026-0418', null, 403, (j) => j.error?.code);

await call(THANDIWE, 'GET', '/approvals/queue', null, 200, (j) => `pending ${j.counts.pending} (${j.pending.map((p) => `${p.shortRef}[${p.tags.map((t) => t.label).join('|')}]`).join(' ')}) · returned ${j.counts.returned} · done ${j.counts.done}`);
await call(THANDIWE, 'GET', '/approvals/TRV-2026-0418', null, 200, (j) => `stage ${j.stage?.key} · checklist ${j.checklist?.length} · canAct ${j.canAct} as ${j.actingRole} · chain ${j.approvalChain.map((c) => `${c.key}:${c.state}${c.actorName ? '(' + c.actorName + ')' : ''}`).join(' ')}`);
await call(THANDIWE, 'PUT', '/approvals/TRV-2026-0418/checklist', { checklist: { work_plan: true, prudent_days: true, no_weekends: true, dates_clear: true } }, 200, (j) => `${Object.values(j.checklist).filter(Boolean).length}/7 ticked`);
await call(THANDIWE, 'POST', '/approvals/TRV-2026-0418/decide', { decision: 'APPROVED' }, 422, (j) => `${j.error?.code} — ${j.error?.message}`);
await call(THANDIWE, 'POST', '/approvals/TRV-2026-0419/decide', { decision: 'CLARIFICATION_REQUESTED', comment: 'Please list the EPI stores you will visit.' }, 200, (j) => `${j.request.status} · resume at ${j.request.resumeStageIndex}`);
await call(THANDIWE, 'GET', '/approvals/queue', null, 200, (j) => `pending ${j.counts.pending} · returned ${j.counts.returned} (${j.returned.map((r) => r.shortRef).join(',')}) · done ${j.counts.done}`);

await call(LOMBE, 'GET', '/finance/advances', null, 200, (j) => `rows ${j.rows.length} · ready ${j.summary.readyCount}/ZMW ${j.summary.readyValue} · flagged ${j.summary.flagged} · blocked ${j.summary.blocked} · ${j.rows.map((r) => `${r.shortRef}:${r.advance.policyStatus}${r.blockingRequestId ? '←' + r.blockingRequestId.slice(-4) : ''}:${r.advance.leadTimeWorkingDays}wd`).join(' ')}`);
await call(LOMBE, 'POST', '/finance/advances/TRV-2026-0417/milestones', { milestone: 'PREPARED' }, 422, (j) => `${j.error?.code} — ${j.error?.message}`);
await call(LOMBE, 'POST', '/finance/advances/TRV-2026-0416/milestones', { milestone: 'PREPARED' }, 422, (j) => `${j.error?.code}`);
await call(LOMBE, 'POST', '/finance/advances/TRV-2026-0416/exception', { reason: 'Executive travel confirmed late by partner; departure fixed.' }, 200, (j) => `exception by ${j.advance.exception.requestedBy}`);
await call('ruth.sakala@ihm.org.zm', 'POST', '/finance/advances/TRV-2026-0416/exception/approve', null, 200, (j) => `policy now ${j.advance.policyStatus}`);
await call(LOMBE, 'POST', '/finance/advances/TRV-2026-0416/milestones', { milestone: 'PREPARED' }, 200, (j) => `milestones ${Object.keys(j.advance.milestones).join('>')}`);
await call(LOMBE, 'GET', '/dashboard/finance', null, 200, (j) => `awaitingAdvance ${j.awaitingAdvance} · outstanding ${j.outstandingAdvances.count}/ZMW ${j.outstandingAdvances.value} · liqPending ${j.liquidationsPending} · ext ${j.externalPayments}`);
await call(LOMBE, 'GET', '/external-payments/EXT-2026-0057', null, 200, (j) => `${j.payment.status} · ${j.payment.participants.length} participants · total ZMW ${j.payment.totals.total} (dsa ${j.payment.totals.dsa} lunch ${j.payment.totals.lunch} transport ${j.payment.totals.transport}) · payoutsMissing ${j.payoutsMissing} · rules ${j.policyRules.filter((r) => r.ok).length}/4 · canAct ${j.canAct}`);
await call('bwalya.kapaya@ihm.org.zm', 'POST', '/external-payments/EXT-2026-0057/decide', { decision: 'APPROVED' }, 422, (j) => `${j.error?.code}`);

await call(GRACE, 'POST', '/vehicle-bookings', { vehicleId: 'veh-landcruiser', purpose: 'Conflict probe', destination: 'Kabwe', passengers: 2, pickupAt: '2026-09-09T06:00:00.000Z', returnAt: '2026-09-10T16:00:00.000Z', mode: 'ASSIGNED_DRIVER' }, 409, (j) => `${j.error?.code} with ${j.error?.details?.conflicts?.map((c) => c.id).join(',')}`);
await call(GRACE, 'POST', '/vehicle-bookings', { vehicleId: 'veh-xtrail', purpose: 'In-service probe', destination: 'Kabwe', passengers: 2, pickupAt: '2026-09-09T06:00:00.000Z', returnAt: '2026-09-10T16:00:00.000Z', mode: 'ASSIGNED_DRIVER' }, 422, (j) => `${j.error?.code}`);
await call(GRACE, 'POST', '/vehicle-bookings/VEH-2026-0145/assign', { vehicleId: 'veh-corolla' }, 200, (j) => `${j.id} ${j.status} · ${j.vehicleLabel}`);
await call('kelvin.phiri@ihm.org.zm', 'POST', '/vehicle-bookings/VEH-2026-0143/steps', { step: 'key_return', party: 'TRAVELLER' }, 422, (j) => `${j.error?.code}`);
await call('kelvin.phiri@ihm.org.zm', 'POST', '/vehicle-bookings/VEH-2026-0143/steps', { step: 'return_inspection', odometerIn: 42118, fuelLevel: '½' }, 200, (j) => `${j.status} · odo in ${j.selfDrive.returnInspection.odometerIn}`);

// Files: multipart upload → attach to a draft via PATCH attachments → stream back
{
  const form = new FormData();
  form.append('kind', 'AGENDA');
  form.append('file', new Blob(['%PDF-1.4 smoke'], { type: 'application/pdf' }), 'smoke agenda.pdf');
  let uploaded = null;
  try {
    const res = await fetch(`${API}/files`, { method: 'POST', headers: { Authorization: `Bearer ${await token(CHANDA)}` }, body: form });
    uploaded = res.ok ? (await res.json()).attachment : null;
    const ok = res.status === 201 && uploaded?.id;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${res.status} POST  /files (multipart)                                     as chanda.mwansa     ${uploaded ? `${uploaded.id} ${uploaded.kind} ${uploaded.size}B ${uploaded.url}` : await res.text()}`);
  } catch (e) {
    failures++;
    console.log(`FAIL 0   POST  /files (multipart) ${e.message}`);
  }
  if (uploaded) {
    await call(CHANDA, 'PATCH', '/travel-requests/TRV-2026-0421', { attachments: [{ id: uploaded.id, kind: 'QUOTATION' }] }, 200, (j) => `attachments ${j.request.attachments.length} · kind ${j.request.attachments[0]?.kind} · uploadedBy ${j.request.attachments[0]?.uploadedBy} · version ${j.request.version}`);
    await call(CHANDA, 'PATCH', '/travel-requests/TRV-2026-0421', { attachments: [{ id: 'does-not-exist' }] }, 422, (j) => j.error?.code);
    await call(MERCY, 'GET', `/files/${uploaded.id}`, null, 403, (j) => j.error?.code);
    const res = await fetch(`${API}/files/${uploaded.id}`, { headers: { Authorization: `Bearer ${await token(CHANDA)}` } });
    const body = await res.text();
    const ok = res.status === 200 && res.headers.get('content-type')?.startsWith('application/pdf') && body.startsWith('%PDF');
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${res.status} GET   /files/:id (stream)                                       as chanda.mwansa     ${res.headers.get('content-type')} · ${body.length}B`);
  }
}

// External participants: server masks whatever the client typed
{
  const p = await call(LOMBE, 'POST', '/external-payments', { activityTitle: 'Smoke — masking', activityLocationName: 'Chipata', startDate: '2026-10-05', endDate: '2026-10-06', costCentreId: 'CC-108' }, 201, (j) => `${j.payment.id} days rates dsa ${j.payment.rates.dsaPerDay}`);
  if (p?.payment?.id) {
    await call(LOMBE, 'PUT', `/external-payments/${p.payment.id}/participants`, { participants: [
      { fullName: 'Test Airtel', organisation: 'MoH', dutyStationName: 'Katete', payout: { type: 'MOBILE_MONEY', provider: 'AIRTEL', numberMasked: '0977123882' } },
      { fullName: 'Test Bank', organisation: 'MoH', dutyStationName: 'Chipata', isHostSite: true, payout: { type: 'BANK', bankName: 'Zanaco', accountMasked: '5010 0044 1524 4415' } },
    ] }, 200, (j) => `${j.payment.participants.map((l) => `${l.fullName}:${l.payout.numberMasked ?? l.payout.accountMasked}:dsa${l.dsa}:lunch${l.lunch}:tr${l.transport}`).join(' ')} · total ${j.payment.totals.total}`);
  }
}

// Traveller wizard round-trip: create → patch itinerary → eligibility → submit
const created = await call(MERCY, 'POST', '/travel-requests', { category: 'FIELD' }, 201, (j) => `${j.request.id} ${j.request.status} · step ${j.request.wizard.lastStep}`);
const newId = created?.request?.id;
if (newId) {
  await call(MERCY, 'PATCH', `/travel-requests/${newId}`, { activityTitle: 'Smoke — Ndola DQA', purpose: 'Smoke test', itinerary: { originId: 'loc-lusaka-hq', destinationId: 'loc-ndola', departAt: '2026-09-21T04:30:00.000Z', returnAt: '2026-09-24T15:00:00.000Z' }, transport: { mode: 'IHM_VEHICLE' }, accommodation: { required: true, ratePerNight: 900 }, completeStep: 'itinerary', wizardStep: 'travellers' }, 200, (j) => `nights ${j.request.itinerary.nights} · ${j.request.itinerary.distanceKm} km · perDiem ${j.request.allowances.perDiemNights}×${j.request.allowances.perDiemRate} · total ${j.request.costing.total} · steps ${j.request.wizard.completedSteps.join(',')}`);
  await call(MERCY, 'POST', `/travel-requests/${newId}/eligibility-preview`, { destinationId: 'loc-chongwe', departAt: '2026-09-21T04:30:00.000Z', returnAt: '2026-09-21T12:00:00.000Z' }, 200, (j) => `${j.distanceKm} km · eligible ${j.eligibility.perDiemEligible} · ${j.eligibility.reasons.length} reasons`);
  await call(MERCY, 'POST', `/travel-requests/${newId}/submit`, null, 200, (j) => `${j.request.status} · stage ${j.request.currentStageIndex} · wf ${j.request.workflow.id}`);
  await call(MERCY, 'POST', `/travel-requests/${newId}/cancel`, { reason: 'smoke cleanup' }, 200, (j) => j.request.status);
}

await call(ADMIN, 'GET', '/admin/overview', null, 200, (j) => `${j.rates.length} rates · ${j.workflows.length} workflows · ${j.users.length} users · ${j.vendors.length} vendors · ${j.masterData.vehicles.length} vehicles · policy blockAdvance=${j.policy.toggles.blockAdvanceOnOutstandingLiquidation}`);
await call(ADMIN, 'POST', '/admin/rates', { key: 'STATIONERY_CAP', value: 600, unit: 'ZMW_CAP', effectiveFrom: '2027-01-01', note: 'smoke' }, 201, (j) => `${j.id} v${j.version}`);
await call(ADMIN, 'GET', '/admin/rates', null, 200, (j) => `${j.items.length} rates · stationery ${j.items.filter((r) => r.key === 'STATIONERY_CAP').map((r) => `${r.value}@${r.effectiveFrom}→${r.effectiveTo ?? 'open'}`).join(' ')}`);
await call(ADMIN, 'POST', '/jobs/run-daily', null, 200, (j) => `started ${j.started.length} · liq opened ${j.liquidationsOpened.length} · reminders ${j.remindersSent.length} · blocks ${j.advanceBlocksNotified.length} · errors ${j.errors.length}${j.errors.length ? ' ' + JSON.stringify(j.errors) : ''}`);

console.log(`\n${results.length + 1} checks · ${failures} failed`);
process.exit(failures ? 1 : 0);
