import type { Liquidation, TravelRequest } from '@tms/shared';
import { fmtDate, isoDate, liquidationDaysRemaining } from '@tms/shared';
import { COL, db, nowIso, SYSTEM_ACTOR } from '../lib/firebase';
import { audit, notify } from '../lib/audit';
import { queryIn, runQuery } from '../lib/query';
import { loadConfig } from './config';
import { ensureLiquidation } from './liquidations';
import { startTrip } from './trips';
import { reevaluateAdvance } from './advance';

export interface DailyJobSummary {
  ranAt: string;
  started: string[];
  liquidationsOpened: string[];
  remindersSent: { liquidationId: string; key: string }[];
  advanceBlocksNotified: string[];
  errors: { step: string; id?: string; message: string }[];
}

/** SOP automation (SRS §19.1, §19.3, §10.7). Idempotent — safe to run more than once a day. */
export async function runDailyJobs(now: Date = new Date()): Promise<DailyJobSummary> {
  const summary: DailyJobSummary = { ranAt: now.toISOString(), started: [], liquidationsOpened: [], remindersSent: [], advanceBlocksNotified: [], errors: [] };
  const nowIsoStr = now.toISOString();
  const cfg = await loadConfig(true);

  // (1) Departure reached → trip in progress.
  const departing = await queryIn<TravelRequest>(COL.travelRequests, 'status', ['READY_FOR_TRAVEL', 'TRAVEL_ARRANGEMENTS'], 300);
  for (const r of departing) {
    if (!r.itinerary.departAt || r.itinerary.departAt > nowIsoStr) continue;
    try {
      await startTrip(SYSTEM_ACTOR, r, true);
      summary.started.push(r.id);
    } catch (e) {
      summary.errors.push({ step: 'start', id: r.id, message: (e as Error).message });
    }
  }

  // (2) Return reached → awaiting liquidation (opens the liquidation record and notifies the traveller).
  const inProgress = await runQuery<TravelRequest>(db.collection(COL.travelRequests).where('status', '==', 'IN_PROGRESS'), 300);
  for (const r of inProgress) {
    if (!r.itinerary.returnAt || r.itinerary.returnAt > nowIsoStr) continue;
    try {
      const liq = await ensureLiquidation(r.id, SYSTEM_ACTOR);
      summary.liquidationsOpened.push(liq.id);
    } catch (e) {
      summary.errors.push({ step: 'liquidation', id: r.id, message: (e as Error).message });
    }
  }

  // (3) Reminders: 2 days before, on the due date, and after it (deduped per liquidation).
  const open = await runQuery<Liquidation>(db.collection(COL.liquidations).where('status', 'in', ['OPEN', 'RETURNED']), 500);
  for (const l of open) {
    const remaining = liquidationDaysRemaining(l.dueDate, now);
    let key: string | null = null;
    let title = '';
    if (remaining === 2) {
      key = 'before_2';
      title = `Liquidation due in 2 days (${fmtDate(l.dueDate)})`;
    } else if (remaining === 0) {
      key = 'due_today';
      title = 'Liquidation due today';
    } else if (remaining < 0) {
      key = `overdue_${isoDate(now)}`;
      title = `Liquidation overdue by ${-remaining} day${remaining === -1 ? '' : 's'}`;
    }
    if (!key || (l.remindersSent ?? []).includes(key)) continue;
    // Overdue: remind on the first overdue day, then weekly, to avoid daily nagging.
    if (key.startsWith('overdue_')) {
      const sentOverdue = (l.remindersSent ?? []).filter((k) => k.startsWith('overdue_')).sort();
      const last = sentOverdue[sentOverdue.length - 1]?.slice('overdue_'.length);
      if (last && liquidationDaysRemaining(last, now) > -7) continue;
    }
    try {
      await notify(l.travellerId, { title, body: `${l.requestId} · ${l.tripTitle}${remaining < 0 ? ' — new advances are blocked until this trip is liquidated.' : ''}`, link: `/liquidations/${l.id}`, kind: remaining < 0 ? 'LIQUIDATION_OVERDUE' : 'LIQUIDATION_DUE' });
      await db.collection(COL.liquidations).doc(l.id).set({ remindersSent: [...(l.remindersSent ?? []), key], updatedAt: nowIso() }, { merge: true });
      summary.remindersSent.push({ liquidationId: l.id, key });
    } catch (e) {
      summary.errors.push({ step: 'reminder', id: l.id, message: (e as Error).message });
    }
  }

  // (4) Advances that are (or have become) blocked by an outstanding liquidation — tell the traveller once per blocking trip.
  const pendingAdvance = await queryIn<TravelRequest>(COL.travelRequests, 'status', ['ADVANCE_PROCESSING', 'TRAVEL_ARRANGEMENTS', 'READY_FOR_TRAVEL'], 300);
  for (const r of pendingAdvance) {
    if (!r.advance?.requested || r.advance.milestones.RELEASED) continue;
    try {
      const adv = await reevaluateAdvance(r, cfg.policy, cfg.rates);
      if (!adv) continue;
      const changed = adv.policyStatus !== r.advance.policyStatus || adv.blockedByRequestId !== r.advance.blockedByRequestId;
      if (changed) {
        await db.collection(COL.travelRequests).doc(r.id).set({ advance: adv, updatedAt: nowIso() }, { merge: true });
        await audit(SYSTEM_ACTOR, { entityType: 'travelRequest', entityId: r.id, action: 'ADVANCE_REEVALUATED', oldValue: { policyStatus: r.advance.policyStatus }, newValue: { policyStatus: adv.policyStatus, blockedByRequestId: adv.blockedByRequestId } });
      }
      if (adv.policyStatus === 'BLOCKED' && (changed || r.advance.policyStatus !== 'BLOCKED')) {
        await notify(r.requesterId, { title: 'Advance blocked by an outstanding liquidation', body: `${r.id} — liquidate ${adv.blockedByRequestId} before this advance can be paid.`, link: `/requests/${adv.blockedByRequestId}`, kind: 'ADVANCE_BLOCKED' });
        summary.advanceBlocksNotified.push(r.id);
      }
    } catch (e) {
      summary.errors.push({ step: 'advance', id: r.id, message: (e as Error).message });
    }
  }

  await audit(SYSTEM_ACTOR, { entityType: 'job', entityId: 'daily', action: 'RAN', newValue: { started: summary.started.length, liquidationsOpened: summary.liquidationsOpened.length, reminders: summary.remindersSent.length, blocks: summary.advanceBlocksNotified.length, errors: summary.errors.length } });
  return summary;
}
