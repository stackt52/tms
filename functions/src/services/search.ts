import type { ExternalPaymentRequest, MileageClaim, SearchResponse, TravelRequest, VehicleBooking } from '@tms/shared';
import { STATUS_META } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db } from '../lib/firebase';
import { runQuery } from '../lib/query';
import { canViewAll, canViewRequest, isFleetAdmin } from './access';
import { canViewPayment } from './externalPayments';

const norm = (s: string | undefined | null) => (s ?? '').toLowerCase();

/** In-memory prefix/contains match over the most recent documents per collection (SRS §23.1). */
export async function search(actor: Actor, q: string): Promise<SearchResponse> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return { results: [] };
  const [reqs, claims, bookings, payments] = await Promise.all([
    runQuery<TravelRequest>(db.collection(COL.travelRequests).orderBy('updatedAt', 'desc'), 200),
    runQuery<MileageClaim>(db.collection(COL.mileageClaims).orderBy('updatedAt', 'desc'), 200),
    runQuery<VehicleBooking>(db.collection(COL.vehicleBookings).orderBy('pickupAt', 'desc'), 200),
    runQuery<ExternalPaymentRequest>(db.collection(COL.externalPayments).orderBy('updatedAt', 'desc'), 200),
  ]);
  const hit = (...fields: (string | undefined | null)[]) => fields.some((f) => norm(f).includes(needle));
  const results: SearchResponse['results'] = [];
  for (const r of reqs) {
    if (!canViewRequest(actor, r)) continue;
    if (hit(r.id, r.activityTitle, r.itinerary.destinationName, r.requesterName, r.projectId, r.costCentreId, ...r.travellers.map((t) => t.name))) {
      results.push({ kind: 'TRV', id: r.id, title: `${r.id} · ${r.activityTitle || 'Untitled'}`, subtitle: `${r.requesterName} · ${r.itinerary.destinationName ?? ''} · ${STATUS_META[r.status].label}`, href: `/requests/${r.id}` });
    }
  }
  for (const c of claims) {
    if (!(c.claimantId === actor.uid || canViewAll(actor))) continue;
    if (hit(c.id, c.purpose, c.toName, c.claimantName)) results.push({ kind: 'MIL', id: c.id, title: `${c.id} · ${c.purpose}`, subtitle: `${c.claimantName} · ${c.distanceKm} km · ${c.status}`, href: `/claims/${c.id}` });
  }
  for (const b of bookings) {
    if (!(b.requesterId === actor.uid || b.driverId === actor.uid || isFleetAdmin(actor) || canViewAll(actor))) continue;
    if (hit(b.id, b.vehicleLabel, b.destination, b.purpose, b.requesterName)) results.push({ kind: 'VEH', id: b.id, title: `${b.id} · ${b.purpose}`, subtitle: `${b.requesterName} · ${b.vehicleLabel ?? 'vehicle pending'} · ${b.status}`, href: `/fleet/bookings/${b.id}` });
  }
  for (const p of payments) {
    if (!canViewPayment(actor, p)) continue;
    if (hit(p.id, p.activityTitle, p.activityLocationName, p.requesterName, p.paymentReference)) results.push({ kind: 'EXT', id: p.id, title: `${p.id} · ${p.activityTitle}`, subtitle: `${p.requesterName} · ${p.participants.length} participants · ${p.status}`, href: `/finance/external-payments/${p.id}` });
  }
  return { results: results.slice(0, 30) };
}
