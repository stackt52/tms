'use client';
import { computeCosting, estimateRoadKm, nightsBetween, type Attachment, type CostLine, type Location, type MeResponse, type TravelRequest, type UpdateTravelRequestBody, type WizardStep } from '@tms/shared';
import type { MasterData } from '@/lib/queries';

export type Patch = UpdateTravelRequestBody;

/** Props every wizard step receives. `view` = server request + unsaved edits; `set` queues an autosaved patch. */
export interface StepProps {
  view: TravelRequest;
  server: TravelRequest;
  /** True while there are unsaved or in-flight edits (server-derived values may be stale). */
  dirty: boolean;
  set: (p: Patch) => void;
  md?: MasterData;
  me: MeResponse;
  mobile: boolean;
  goTo: (step: WizardStep) => void;
}

export function validateStep(step: WizardStep, v: TravelRequest): string | null {
  switch (step) {
    case 'travel_type':
      return v.category ? null : 'Choose a travel type to continue.';
    case 'trip_details':
      if (!v.activityTitle.trim()) return 'Give the activity a title.';
      if (!v.purpose.trim()) return 'Describe the purpose of the trip.';
      return null;
    case 'itinerary': {
      const it = v.itinerary;
      if (!it.originId || !it.destinationId) return 'Choose an origin and a destination.';
      if (!it.departAt || !it.returnAt) return 'Enter departure and return date-times.';
      if (new Date(it.returnAt).getTime() <= new Date(it.departAt).getTime()) return 'Return must be after departure.';
      return null;
    }
    case 'travellers':
      return v.travellers.length ? null : 'Add at least one traveller.';
    case 'transport':
      if (!v.transport.mode) return 'Choose a mode of transport.';
      return null;
    case 'accommodation':
      if (v.accommodation.required && v.accommodation.nights <= 0) return 'Enter the number of nights of accommodation.';
      return null;
    case 'allowances':
      if (v.allowances.perDiemWaived && !v.allowances.waiverReason?.trim()) return 'Give a reason for waiving per diem.';
      return null;
    case 'costing':
      return v.costing.lines.length ? null : 'Add at least one cost line.';
    default:
      return null;
  }
}

/** Zambia is UTC+2 with no DST: ISO (UTC) → value for <input type="datetime-local"> in CAT. */
export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 16);
}
/** datetime-local value (CAT) → ISO UTC string. */
export function localInputToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(d.getTime() - 2 * 3600 * 1000).toISOString();
}

export function newId(prefix = 'cl'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

/** Apply a partial PATCH body onto a request the way the server will (one-level merge for nested groups). */
export function applyPatch(req: TravelRequest, p: Patch): TravelRequest {
  const out: TravelRequest = { ...req };
  for (const [k, v] of Object.entries(p) as [keyof Patch, unknown][]) {
    if (v === undefined) continue;
    switch (k) {
      case 'itinerary':
        out.itinerary = { ...out.itinerary, ...(v as Partial<TravelRequest['itinerary']>) };
        break;
      case 'transport':
        out.transport = { ...out.transport, ...(v as Partial<TravelRequest['transport']>) };
        break;
      case 'accommodation':
        out.accommodation = { ...out.accommodation, ...(v as Partial<TravelRequest['accommodation']>) };
        break;
      case 'allowances':
        out.allowances = { ...out.allowances, ...(v as Partial<TravelRequest['allowances']>) };
        break;
      case 'international':
        out.international = (v as TravelRequest['international']) ?? undefined;
        break;
      case 'personal':
        out.personal = (v as TravelRequest['personal']) ?? undefined;
        break;
      case 'costingLines':
        out.costing = computeCosting(v as CostLine[]);
        break;
      case 'attachments':
        out.attachments = v as Attachment[];
        break;
      case 'wizardStep':
      case 'completeStep':
        break;
      default:
        (out as unknown as Record<string, unknown>)[k] = v;
    }
  }
  // Derived values the server recomputes — mirror them for instant feedback.
  const it = out.itinerary;
  if (it.departAt && it.returnAt) out.itinerary = { ...it, nights: nightsBetween(it.departAt, it.returnAt) };
  return out;
}

export function mergePatch(a: Patch, b: Patch): Patch {
  const out: Patch = { ...a };
  for (const [k, v] of Object.entries(b) as [keyof Patch, unknown][]) {
    if (v === undefined) continue;
    if ((k === 'itinerary' || k === 'transport' || k === 'accommodation' || k === 'allowances') && typeof v === 'object' && v !== null) {
      (out as Record<string, unknown>)[k] = { ...((a[k] as object | undefined) ?? {}), ...(v as object) };
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export function locationById(md: MasterData | undefined, id?: string | null): Location | undefined {
  if (!md || !id) return undefined;
  return md.locations.find((l) => l.id === id);
}

/** One-way road distance estimate: origin → farthest of destination + stops (km). */
export function previewDistanceKm(md: MasterData | undefined, it: TravelRequest['itinerary']): number {
  if (it.distanceOverrideKm != null && it.distanceOverrideKm > 0) return it.distanceOverrideKm;
  const origin = locationById(md, it.originId);
  if (!origin) return it.distanceKm ?? 0;
  const targets = [locationById(md, it.destinationId), ...it.stops.map((s) => locationById(md, s.id))].filter((x): x is Location => !!x);
  if (!targets.length) return it.distanceKm ?? 0;
  return Math.max(...targets.map((t) => estimateRoadKm(origin, t)));
}

export const CATEGORY_SHORT: Record<NonNullable<TravelRequest['category']>, string> = { LOCAL: 'Local', FIELD: 'Field', INTERNATIONAL: 'Intl' };

export const STEP_COPY: Record<WizardStep, { title: string; sub: string }> = {
  travel_type: { title: 'What kind of travel is this?', sub: 'The travel type sets the approval chain and the notice period.' },
  trip_details: { title: 'Tell us about the activity', sub: 'Your supervisor checks this against the unit work plan (SOP §9.2).' },
  itinerary: { title: 'Where and when are you travelling?', sub: 'Add each leg of the journey. Eligibility is calculated as you type.' },
  travellers: { title: 'Who is travelling?', sub: 'Add colleagues for a group request and mark the lead traveller.' },
  transport: { title: 'How will you get there?', sub: 'IHM vehicles come first in the SOP order of precedence. Lower-priority modes need a justification.' },
  accommodation: { title: 'Where will you stay?', sub: 'Preferred hotel vendors carry negotiated rates. Full board provided replaces per diem.' },
  allowances: { title: 'Allowances', sub: 'Per diem applies when the destination is over 55 km away and you are away for more than 12 hours.' },
  costing: { title: 'Estimate the cost', sub: 'Finance advances 75% of the approved amount. Items paid directly by IHM are not advanced.' },
  attachments: { title: 'Attach supporting documents', sub: 'Quotations, agendas and any prior approvals help reviewers decide quickly.' },
  review: { title: 'Review and submit', sub: 'Check everything before it goes to your supervisor for approval.' },
};

/** Render 400/422 error details from the API as flat strings. */
export function detailLines(details: unknown): string[] {
  if (!details) return [];
  if (typeof details === 'string') return [details];
  if (Array.isArray(details)) {
    return details.map((d) => {
      if (typeof d === 'string') return d;
      if (d && typeof d === 'object') {
        const o = d as Record<string, unknown>;
        const field = (o.field ?? o.path ?? o.param) as string | string[] | undefined;
        const msg = (o.message ?? o.msg ?? o.reason) as string | undefined;
        const f = Array.isArray(field) ? field.join('.') : field;
        return f && msg ? `${f}: ${msg}` : (msg ?? JSON.stringify(d));
      }
      return String(d);
    });
  }
  if (typeof details === 'object') {
    return Object.entries(details as Record<string, unknown>).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  return [String(details)];
}
