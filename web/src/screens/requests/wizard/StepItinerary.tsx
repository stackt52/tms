'use client';
import { useEffect, useMemo, useRef } from 'react';
import { computeEligibility, type EligibilityResult, type TravelRequest } from '@tms/shared';
import { Button, Icon, IconButton, ReadonlyField, SelectField, StatTile, TextField } from '@/components/m3';
import { isoToLocalInput, localInputToIso, previewDistanceKm, type StepProps } from './wizard-state';

export function useEligibilityPreview(view: TravelRequest, md: StepProps['md'], dirty: boolean): { elig: EligibilityResult; distanceKm: number; fromServer: boolean } {
  const it = view.itinerary;
  const distanceKm = previewDistanceKm(md, it);
  const local = useMemo(() => computeEligibility({ distanceKm, departAt: it.departAt, returnAt: it.returnAt, category: view.category }), [distanceKm, it.departAt, it.returnAt, view.category]);
  const useServer = !dirty && !!view.eligibility;
  return { elig: useServer ? view.eligibility! : local, distanceKm: useServer ? view.eligibility!.distanceKm : distanceKm, fromServer: useServer };
}

export function EligibilityPanel({ elig, mobile, nights }: { elig: EligibilityResult; mobile?: boolean; nights: number }) {
  const ok = elig.perDiemEligible;
  const headline = ok ? (mobile ? 'Eligible for per diem & advance' : 'Eligible for per diem and travel advance') : `Not eligible for per diem — ${elig.reasons.filter((r) => !r.startsWith('Only')).join(' ') || 'check distance and time away'}`;
  const dist = `${elig.distanceOk ? 'over' : 'under'} ${elig.distanceThresholdKm} km ${elig.distanceOk ? '✓' : '✗'}`;
  const hrs = `${elig.hoursOk ? 'over' : 'under'} ${elig.hoursThreshold} h ${elig.hoursOk ? '✓' : '✗'}`;
  const lead = elig.leadTimeOk ? 'OK ✓' : 'short ✗';
  if (mobile) {
    return (
      <div className={`wiz-elig wiz-elig--mobile ${ok ? '' : 'wiz-elig--bad'}`}>
        <div className="wiz-elig__head">
          <Icon name={ok ? 'verified' : 'error'} filled size={20} color={ok ? 'var(--md-primary)' : 'var(--md-error)'} />
          <span>{headline}</span>
        </div>
        <div className="wiz-elig__line">
          ≈ {elig.distanceKm} km from duty station (&gt;{elig.distanceThresholdKm} km {elig.distanceOk ? '✓' : '✗'}) · {elig.hoursAway} h away (&gt;{elig.hoursThreshold} h {elig.hoursOk ? '✓' : '✗'}) · {nights} {nights === 1 ? 'night' : 'nights'} · lead time {elig.leadTimeOk ? 'OK' : `short (${elig.leadTimeWorkingDays} working days)`}
          {elig.internationalNoticeOk === false ? ` · international notice short (${elig.internationalNoticeDays} days)` : ''}
        </div>
      </div>
    );
  }
  return (
    <div className={`wiz-elig ${ok ? '' : 'wiz-elig--bad'}`}>
      <div className="wiz-elig__head">
        <Icon name={ok ? 'verified' : 'error'} filled size={22} color={ok ? 'var(--md-primary)' : 'var(--md-error)'} />
        <span>{headline}</span>
      </div>
      <div className="wiz-elig__tiles">
        <StatTile label="Distance from duty station" value={`≈ ${elig.distanceKm} km`} verdict={dist} ok={elig.distanceOk} />
        <StatTile label="Time away" value={`${elig.hoursAway} hours`} verdict={hrs} ok={elig.hoursOk} />
        <StatTile label="Advance lead time" value={`${elig.leadTimeWorkingDays} working ${elig.leadTimeWorkingDays === 1 ? 'day' : 'days'}`} verdict={lead} ok={elig.leadTimeOk} />
        {elig.internationalNoticeOk !== null ? <StatTile label="International notice" value={`${elig.internationalNoticeDays} days`} verdict={elig.internationalNoticeOk ? '14 days ✓' : 'under 14 ✗'} ok={elig.internationalNoticeOk} /> : null}
      </div>
    </div>
  );
}

export function StepItinerary({ view, set, md, me, mobile, dirty }: StepProps) {
  const it = view.itinerary;
  const setItin = (p: Partial<TravelRequest['itinerary']>) => set({ itinerary: p });
  const locations = md?.locations ?? [];
  const locOptions = locations.map((l) => ({ value: l.id, label: l.name }));
  const os = mobile;

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const ds = me.dutyStation;
    if (!it.originId && ds) set({ itinerary: { originId: ds.id, originName: ds.name } });
  }, [it.originId, me.dutyStation, set]);

  const { elig } = useEligibilityPreview(view, md, dirty);
  const pickName = (id: string) => locations.find((l) => l.id === id)?.name ?? '';

  return (
    <div>
      {mobile ? (
        <div className="col g14">
          <SelectField label="Origin" icon="location_on" placeholder="Select origin" value={it.originId ?? ''} onChange={(e) => setItin({ originId: e.target.value || undefined, originName: pickName(e.target.value) })} options={locOptions} onSurface={os} />
          <SelectField label="Destination" icon="location_on" placeholder="Select destination" value={it.destinationId ?? ''} onChange={(e) => setItin({ destinationId: e.target.value || undefined, destinationName: pickName(e.target.value) })} options={locOptions} onSurface={os} />
          <div className="row g12" style={{ alignItems: 'stretch' }}>
            <TextField className="grow" label="Departure" type="datetime-local" value={isoToLocalInput(it.departAt)} onChange={(e) => setItin({ departAt: localInputToIso(e.target.value) })} onSurface={os} />
            <TextField className="grow" label="Return" type="datetime-local" value={isoToLocalInput(it.returnAt)} onChange={(e) => setItin({ returnAt: localInputToIso(e.target.value) })} onSurface={os} />
          </div>
        </div>
      ) : (
        <>
          <div className="row g14" style={{ alignItems: 'stretch' }}>
            <SelectField style={{ flex: 1.2 }} label="Origin" icon="location_on" placeholder="Select origin" value={it.originId ?? ''} onChange={(e) => setItin({ originId: e.target.value || undefined, originName: pickName(e.target.value) })} options={locOptions} />
            <SelectField style={{ flex: 1.2 }} label="Destination" icon="location_on" placeholder="Select destination" value={it.destinationId ?? ''} onChange={(e) => setItin({ destinationId: e.target.value || undefined, destinationName: pickName(e.target.value) })} options={locOptions} />
          </div>
          <div className="row g14 mt18" style={{ alignItems: 'stretch' }}>
            <TextField style={{ flex: 1 }} label="Departure" icon="calendar_today" type="datetime-local" value={isoToLocalInput(it.departAt)} onChange={(e) => setItin({ departAt: localInputToIso(e.target.value) })} />
            <TextField style={{ flex: 1 }} label="Return" icon="event" type="datetime-local" value={isoToLocalInput(it.returnAt)} onChange={(e) => setItin({ returnAt: localInputToIso(e.target.value) })} />
            <ReadonlyField label="Nights" style={{ width: 150 }}>
              {it.nights} <span style={{ fontWeight: 400, color: 'var(--md-on-surface-variant)' }}>(auto)</span>
            </ReadonlyField>
          </div>
        </>
      )}

      {it.stops.length ? (
        <div className="col g12 mt16">
          {it.stops.map((s, i) => (
            <div key={i} className="row g10" style={{ alignItems: 'stretch' }}>
              <SelectField
                className="grow"
                label={`Intermediate stop ${i + 1}`}
                icon="place"
                placeholder="Select location"
                value={s.id ?? ''}
                onChange={(e) => {
                  const stops = it.stops.map((x, j) => (j === i ? { id: e.target.value || undefined, name: pickName(e.target.value) } : x));
                  setItin({ stops });
                }}
                options={locOptions}
                onSurface={os}
              />
              <IconButton icon="close" label="Remove stop" onClick={() => setItin({ stops: it.stops.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt16">
        <Button variant="text" size="sm" icon="add_circle" onClick={() => setItin({ stops: [...it.stops, { name: '' }] })} style={{ paddingLeft: 0, fontSize: 13.5 }}>
          Add intermediate stop
        </Button>
      </div>

      <EligibilityPanel elig={elig} mobile={mobile} nights={it.nights} />

      <div className="row g14 mt18 wrap" style={{ alignItems: 'stretch' }}>
        <TextField
          label="Distance override (km)"
          type="number"
          min={0}
          style={{ width: mobile ? '100%' : 220 }}
          value={it.distanceOverrideKm ?? ''}
          onChange={(e) => setItin({ distanceOverrideKm: e.target.value === '' ? null : Number(e.target.value) })}
          hint="Leave blank to use the road estimate."
          onSurface={os}
        />
      </div>
    </div>
  );
}
