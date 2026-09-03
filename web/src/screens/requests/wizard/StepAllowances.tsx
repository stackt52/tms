'use client';
import { formatZMW, personalContribution, type InternationalDetails, type PersonalTravelDetails } from '@tms/shared';
import { Chip, Icon, ReadonlyField, SelectField, Switch, TextArea, TextField } from '@/components/m3';
import type { StepProps } from './wizard-state';

const INTL_DEFAULT: InternationalDetails = { countries: [], cities: [], passportValid: false, visaRequired: false, cabinClass: 'ECONOMY' };
const CABIN: { value: InternationalDetails['cabinClass']; label: string }[] = [
  { value: 'ECONOMY', label: 'Economy (policy default)' },
  { value: 'PREMIUM', label: 'Premium economy' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'FIRST', label: 'First' },
];
const VISA: { value: NonNullable<InternationalDetails['visaStatus']>; label: string }[] = [
  { value: 'TO_APPLY', label: 'To apply' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'GRANTED', label: 'Granted' },
  { value: 'NOT_REQUIRED', label: 'Not required' },
];

export function StepAllowances({ view, set, mobile }: StepProps) {
  const al = view.allowances;
  const setAl = (p: Partial<typeof al>) => set({ allowances: p });
  const elig = view.eligibility;
  const perDiemLine = view.costing.lines.find((l) => l.category === 'PER_DIEM');
  const rate = perDiemLine?.unitCost || al.perDiemRate;
  const fullBoard = view.accommodation.fullBoardProvided;

  const intl: InternationalDetails = view.international ?? INTL_DEFAULT;
  const setIntl = (p: Partial<InternationalDetails>) => set({ international: { ...intl, ...p } });
  const personal: PersonalTravelDetails = view.personal ?? { combined: false };
  const setPersonal = (p: Partial<PersonalTravelDetails>) => {
    const next = { ...personal, ...p };
    next.personalContribution = personalContribution(next.combinedQuote ?? 0, next.directOfficialQuote ?? 0);
    set({ personal: next });
  };

  return (
    <div className="col g16">
      <div className={`m3-card m3-card--md ${elig?.perDiemEligible ? 'm3-card--secondary' : 'm3-card--surface'}`} style={{ padding: '14px 18px' }}>
        <div className="row g10">
          <Icon name={elig?.perDiemEligible ? 'verified' : 'info'} filled={!!elig?.perDiemEligible} size={22} color={elig?.perDiemEligible ? 'var(--md-primary)' : 'var(--md-on-surface-variant)'} />
          <div className="grow">
            <div style={{ fontWeight: 750, fontSize: 14 }}>{elig ? (elig.perDiemEligible ? 'Per diem applies to this trip' : 'Per diem does not apply') : 'Enter an itinerary to check per diem eligibility'}</div>
            {elig ? (
              <div className="t-caption-sm mt4">
                ≈ {elig.distanceKm} km ({elig.distanceOk ? '✓' : '✗'} &gt;{elig.distanceThresholdKm} km) · {elig.hoursAway} h away ({elig.hoursOk ? '✓' : '✗'} &gt;{elig.hoursThreshold} h) · {elig.nights} nights
                {fullBoard ? ' · full board provided replaces per diem' : ''}
              </div>
            ) : null}
          </div>
          {elig ? <Chip tone={elig.perDiemEligible ? 'approved' : 'neutral'}>{elig.perDiemEligible ? 'Eligible' : 'Not eligible'}</Chip> : null}
        </div>
      </div>

      <div className="wiz-grid">
        <TextField label="Per diem nights" type="number" min={0} value={al.perDiemNights} onChange={(e) => setAl({ perDiemNights: Math.max(0, Number(e.target.value) || 0) })} onSurface={mobile} hint={view.itinerary.nights ? `Itinerary: ${view.itinerary.nights} nights` : undefined} disabled={al.perDiemWaived} />
        <ReadonlyField label="Per diem rate" onSurface={mobile}>
          {rate ? `${formatZMW(rate)} / night` : 'Set by Finance from the rate table'}
          {al.perDiemNights && rate ? <span style={{ fontWeight: 400, color: 'var(--md-on-surface-variant)' }}> · {formatZMW(al.perDiemNights * rate)}</span> : null}
        </ReadonlyField>
      </div>

      <div className="wiz-switch">
        <div className="grow">
          <div className="wiz-switch__label">Funded from overhead</div>
          <div className="wiz-switch__hint">Not charged to a project budget — the Finance Director reviews overhead-funded travel.</div>
        </div>
        <Switch checked={al.overheadFunded} onChange={(v) => setAl({ overheadFunded: v })} label="Overhead funded" />
      </div>
      <div className="wiz-switch">
        <div className="grow">
          <div className="wiz-switch__label">Waive per diem</div>
          <div className="wiz-switch__hint">For example when the host covers meals and incidentals.</div>
        </div>
        <Switch checked={al.perDiemWaived} onChange={(v) => setAl({ perDiemWaived: v })} label="Waive per diem" />
      </div>
      {al.perDiemWaived ? <TextArea label="Waiver reason" rows={2} value={al.waiverReason ?? ''} onChange={(e) => setAl({ waiverReason: e.target.value })} onSurface={mobile} /> : null}

      {view.category === 'INTERNATIONAL' ? (
        <div className="wiz-section">
          <div className="wiz-section__title">International travel</div>
          <div className="col g14">
            <div className="wiz-grid">
              <SelectField label="Cabin class" value={intl.cabinClass} onChange={(e) => setIntl({ cabinClass: e.target.value as InternationalDetails['cabinClass'], ...(e.target.value === 'ECONOMY' ? { upgradeDifference: undefined } : {}) })} options={CABIN} onSurface={mobile} />
              {intl.cabinClass !== 'ECONOMY' ? (
                <TextField label="Upgrade fare difference (ZMW)" type="number" min={0} step="0.01" value={intl.upgradeDifference ?? ''} onChange={(e) => setIntl({ upgradeDifference: Number(e.target.value) || 0 })} onSurface={mobile} hint="Policy is economy only — the difference is an employee contribution." />
              ) : null}
            </div>
            <div className="wiz-grid">
              <TextField label="Countries" placeholder="South Africa, Kenya" value={intl.countries.join(', ')} onChange={(e) => setIntl({ countries: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} onSurface={mobile} />
              <TextField label="Cities" placeholder="Johannesburg" value={intl.cities.join(', ')} onChange={(e) => setIntl({ cities: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} onSurface={mobile} />
            </div>
            <div className="wiz-grid">
              <div className="wiz-switch">
                <div className="grow">
                  <div className="wiz-switch__label">Passport valid</div>
                  <div className="wiz-switch__hint">At least 6 months beyond return.</div>
                </div>
                <Switch checked={intl.passportValid} onChange={(v) => setIntl({ passportValid: v })} label="Passport valid" />
              </div>
              <div className="wiz-switch">
                <div className="grow">
                  <div className="wiz-switch__label">Visa required</div>
                  <div className="wiz-switch__hint">Visa costs go under Costing.</div>
                </div>
                <Switch checked={intl.visaRequired} onChange={(v) => setIntl({ visaRequired: v, visaStatus: v ? (intl.visaStatus ?? 'TO_APPLY') : 'NOT_REQUIRED' })} label="Visa required" />
              </div>
            </div>
            {intl.visaRequired ? <SelectField label="Visa status" value={intl.visaStatus ?? 'TO_APPLY'} onChange={(e) => setIntl({ visaStatus: e.target.value as InternationalDetails['visaStatus'] })} options={VISA} onSurface={mobile} /> : null}
            <div className="wiz-grid">
              <TextField label="Airports / transit" placeholder="LUN → JNB via none" value={intl.airports ?? ''} onChange={(e) => setIntl({ airports: e.target.value })} onSurface={mobile} />
              <TextField label="Emergency contact" placeholder="Name · phone" value={intl.emergencyContact ?? ''} onChange={(e) => setIntl({ emergencyContact: e.target.value })} onSurface={mobile} />
            </div>
            <div className="wiz-switch">
              <div className="grow">
                <div className="wiz-switch__label">Travel insurance arranged</div>
              </div>
              <Switch checked={!!intl.insurance} onChange={(v) => setIntl({ insurance: v })} label="Travel insurance" />
            </div>
          </div>
        </div>
      ) : null}

      <div className="wiz-section">
        <div className="wiz-section__title">Personal travel</div>
        <div className="col g14">
          <div className="wiz-switch">
            <div className="grow">
              <div className="wiz-switch__label">Combine with personal travel</div>
              <div className="wiz-switch__hint">IHM pays the direct official fare; you contribute the difference and take leave for personal days.</div>
            </div>
            <Switch checked={personal.combined} onChange={(v) => setPersonal({ combined: v })} label="Personal travel" />
          </div>
          {personal.combined ? (
            <>
              <TextField label="Personal destinations / dates" placeholder="Cape Town, 14–17 Sep" value={personal.personalDestinations ?? ''} onChange={(e) => setPersonal({ personalDestinations: e.target.value })} onSurface={mobile} />
              <div className="wiz-grid wiz-grid--3">
                <TextField label="Direct official quote (ZMW)" type="number" min={0} step="0.01" value={personal.directOfficialQuote ?? ''} onChange={(e) => setPersonal({ directOfficialQuote: Number(e.target.value) || 0 })} onSurface={mobile} />
                <TextField label="Combined itinerary quote (ZMW)" type="number" min={0} step="0.01" value={personal.combinedQuote ?? ''} onChange={(e) => setPersonal({ combinedQuote: Number(e.target.value) || 0 })} onSurface={mobile} />
                <ReadonlyField label="Your contribution" onSurface={mobile}>
                  {formatZMW(personal.personalContribution ?? 0)}
                </ReadonlyField>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
