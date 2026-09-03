'use client';
import { formatZMW } from '@tms/shared';
import { SelectField, Switch, TextField } from '@/components/m3';
import type { StepProps } from './wizard-state';

export function StepAccommodation({ view, set, md, mobile }: StepProps) {
  const a = view.accommodation;
  const setA = (p: Partial<typeof a>) => set({ accommodation: p });
  const hotels = (md?.vendors ?? []).filter((v) => v.category === 'HOTEL' && v.active);
  const destTown = md?.locations.find((l) => l.id === view.itinerary.destinationId)?.town;
  const sorted = [...hotels].sort((x, y) => Number(!!y.locations?.some((l) => destTown && l.toLowerCase().includes(destTown.toLowerCase()))) - Number(!!x.locations?.some((l) => destTown && l.toLowerCase().includes(destTown.toLowerCase()))));
  return (
    <div className="col g16">
      <div className="wiz-switch">
        <div className="grow">
          <div className="wiz-switch__label">Accommodation required</div>
          <div className="wiz-switch__hint">{view.itinerary.nights > 0 ? `Your itinerary spans ${view.itinerary.nights} night${view.itinerary.nights === 1 ? '' : 's'}.` : 'Same-day trips normally need no accommodation.'}</div>
        </div>
        <Switch checked={a.required} onChange={(v) => setA({ required: v, nights: v && a.nights <= 0 ? view.itinerary.nights : a.nights })} label="Accommodation required" />
      </div>
      {a.required ? (
        <>
          <div className="wiz-grid">
            <TextField label="Nights" type="number" min={0} value={a.nights} onChange={(e) => setA({ nights: Math.max(0, Number(e.target.value) || 0) })} onSurface={mobile} hint={view.itinerary.nights ? `Itinerary: ${view.itinerary.nights} nights` : undefined} />
            <TextField label="Rate per night (ZMW)" type="number" min={0} step="0.01" value={a.ratePerNight || ''} onChange={(e) => setA({ ratePerNight: Number(e.target.value) || 0 })} onSurface={mobile} hint={a.nights && a.ratePerNight ? `Estimate ${formatZMW(a.nights * a.ratePerNight)}` : undefined} />
          </div>
          <SelectField
            label="Preferred hotel vendor"
            placeholder="Let Procurement choose"
            value={a.preferredVendorId ?? ''}
            onChange={(e) => {
              const v = hotels.find((h) => h.id === e.target.value);
              const rate = v?.approvedRate ? Number(String(v.approvedRate).replace(/[^\d.]/g, '')) : NaN;
              setA({ preferredVendorId: e.target.value || undefined, ...(Number.isFinite(rate) && rate > 0 && !a.ratePerNight ? { ratePerNight: rate } : {}) });
            }}
            options={sorted.map((v) => ({ value: v.id, label: `${v.name}${v.locations?.length ? ` · ${v.locations.join(', ')}` : ''}${v.approvedRate ? ` · ${v.approvedRate}` : ''}` }))}
            onSurface={mobile}
            hint="Preferred vendors carry negotiated rates and payment terms."
          />
          <div className="wiz-switch">
            <div className="grow">
              <div className="wiz-switch__label">Full board provided</div>
              <div className="wiz-switch__hint">When the host or hotel provides all meals, full board replaces per diem for those nights.</div>
            </div>
            <Switch checked={a.fullBoardProvided} onChange={(v) => setA({ fullBoardProvided: v })} label="Full board provided" />
          </div>
        </>
      ) : null}
    </div>
  );
}
