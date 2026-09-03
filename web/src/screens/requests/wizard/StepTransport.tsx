'use client';
import { TRANSPORT_LABELS, TRANSPORT_PRECEDENCE, transportNeedsJustification, type TransportMode } from '@tms/shared';
import { Chip, Icon, SelectField, Switch, TextArea } from '@/components/m3';
import type { StepProps } from './wizard-state';

const ICON: Record<TransportMode, string> = { IHM_VEHICLE: 'directions_car', PUBLIC: 'directions_bus', RENTAL: 'car_rental', AIR: 'flight', PRIVATE_VEHICLE: 'drive_eta', OTHER: 'more_horiz' };
const DESC: Record<TransportMode, string> = {
  IHM_VEHICLE: 'Pool or project vehicle with an IHM driver, booked through Office Management.',
  PUBLIC: 'Intercity bus or shuttle where safe and practical.',
  RENTAL: 'Approved rental vendors only. Explain why an IHM vehicle or public transport is not suitable.',
  AIR: 'Domestic or international flights, economy class, booked by Procurement.',
  PRIVATE_VEHICLE: 'Own vehicle reimbursed by mileage at the effective rate; needs supervisor pre-approval.',
  OTHER: 'Any other pre-approved arrangement — describe it in the justification.',
};

export function StepTransport({ view, set, md, mobile }: StepProps) {
  const t = view.transport;
  const setT = (p: Partial<typeof t>) => set({ transport: p });
  const rentals = (md?.vendors ?? []).filter((v) => v.category === 'CAR_RENTAL' && v.active);
  const needsJust = t.mode ? transportNeedsJustification(t.mode) : false;
  return (
    <div className="col g16">
      <div className="col g10" role="radiogroup" aria-label="Mode of transport">
        {TRANSPORT_PRECEDENCE.map((m, i) => {
          const selected = t.mode === m;
          return (
            <button key={m} type="button" role="radio" aria-checked={selected} className={`wiz-opt ${selected ? 'wiz-opt--selected' : ''}`} onClick={() => setT({ mode: m })}>
              <div className="wiz-opt__icon">
                <Icon name={ICON[m]} filled={selected} size={22} />
              </div>
              <div className="grow">
                <div className="row g8 wrap">
                  <span className="wiz-opt__title">{TRANSPORT_LABELS[m]}</span>
                  {i === 0 ? (
                    <Chip tone="approved" size="xs">
                      Preferred
                    </Chip>
                  ) : (
                    <Chip tone="neutral" size="xs">
                      Priority {i + 1}
                    </Chip>
                  )}
                </div>
                <div className="wiz-opt__desc">{DESC[m]}</div>
              </div>
              <span className="wiz-opt__radio" aria-hidden />
            </button>
          );
        })}
      </div>

      {t.mode === 'IHM_VEHICLE' ? (
        <div className="wiz-switch">
          <div className="grow">
            <div className="wiz-switch__label">IHM driver required</div>
            <div className="wiz-switch__hint">Turn off for a self-drive booking (licence and inspection steps apply).</div>
          </div>
          <Switch checked={!!t.driverRequired} onChange={(v) => setT({ driverRequired: v })} label="Driver required" />
        </div>
      ) : null}

      {t.mode === 'RENTAL' ? (
        <SelectField label="Preferred rental vendor" placeholder="Any approved vendor" value={t.preferredVendorId ?? ''} onChange={(e) => setT({ preferredVendorId: e.target.value || undefined })} options={rentals.map((v) => ({ value: v.id, label: `${v.name}${v.approvedRate ? ` · ${v.approvedRate}` : ''}` }))} onSurface={mobile} hint="Rentals are restricted to approved vendors with valid contracts." />
      ) : null}

      {t.mode === 'AIR' ? <div className="t-caption">Airfare is economy class only. Any upgrade difference is an employee contribution (captured under Allowances).</div> : null}

      {needsJust ? (
        <TextArea label={`Justification for ${TRANSPORT_LABELS[t.mode!].toLowerCase()}`} placeholder="Why the preferred options (IHM vehicle, then public transport) are not suitable for this trip." rows={3} value={t.justification ?? ''} onChange={(e) => setT({ justification: e.target.value })} onSurface={mobile} hint="Required by the SOP order of precedence." />
      ) : null}
    </div>
  );
}
