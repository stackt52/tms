'use client';
import { useMemo, useState } from 'react';
import { RATE_KEY_LABELS, fmtDate, formatAmount, formatZMW, isoDate, rateStatus, type AdminOverview, type Rate, type RateKey } from '@tms/shared';
import { Button, Card, Chip, Dialog, EmptyState, SelectField, TextField, useToast } from '@/components/m3';
import { useCreateRate } from '@/lib/queries';
import { WorkflowCard } from './WorkflowsTab';
import { PolicyTogglesCard } from './PolicyTab';

const UNIT_LABELS: Record<Rate['unit'], string> = {
  PERCENT: 'Percent (%)',
  ZMW_PER_KM: 'ZMW per km',
  ZMW_FLAT: 'ZMW flat',
  ZMW_PER_DAY: 'ZMW per day',
  ZMW_PER_NIGHT: 'ZMW per night',
  ZMW_CAP: 'ZMW cap',
  USD_PER_NIGHT: 'USD per night',
};
const DEFAULT_UNIT: Record<RateKey, Rate['unit']> = {
  ADVANCE_PERCENTAGE: 'PERCENT',
  MILEAGE_RATE: 'ZMW_PER_KM',
  EXTERNAL_TRANSPORT_ALLOWANCE: 'ZMW_FLAT',
  EXTERNAL_DSA: 'ZMW_PER_DAY',
  EXTERNAL_LUNCH: 'ZMW_PER_DAY',
  PER_DIEM_DOMESTIC: 'ZMW_PER_NIGHT',
  PER_DIEM_INTERNATIONAL: 'USD_PER_NIGHT',
  STATIONERY_CAP: 'ZMW_CAP',
};
const KEYS = Object.keys(RATE_KEY_LABELS) as RateKey[];

export function fmtRateValue(r: Pick<Rate, 'value' | 'unit'>): string {
  const whole = Number.isInteger(r.value) ? 0 : 2;
  switch (r.unit) {
    case 'PERCENT':
      return `${r.value}%`;
    case 'ZMW_PER_KM':
      return `${formatZMW(r.value)} / km`;
    case 'ZMW_FLAT':
      return `${formatZMW(r.value, { decimals: whole })} flat`;
    case 'ZMW_PER_DAY':
      return `${formatZMW(r.value, { decimals: whole })} / day`;
    case 'ZMW_PER_NIGHT':
      return `${formatZMW(r.value, { decimals: whole })} / night`;
    case 'ZMW_CAP':
      return formatZMW(r.value, { decimals: whole });
    case 'USD_PER_NIGHT':
      return `USD ${formatAmount(r.value, whole)} / night`;
    default:
      return String(r.value);
  }
}

const STATUS_TONE = { ACTIVE: 'approved', SCHEDULED: 'info', EXPIRED: 'neutral' } as const;
const STATUS_LABEL = { ACTIVE: 'Active', SCHEDULED: 'Scheduled', EXPIRED: 'Expired' } as const;

export function RatesTab({ data }: { data: AdminOverview }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const byKey = new Map<RateKey, Rate[]>();
    for (const r of data.rates) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
    return KEYS.filter((k) => byKey.has(k)).map((k) => ({ key: k, rates: byKey.get(k)!.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.version - a.version)) }));
  }, [data.rates]);
  const fieldWorkflow = data.workflows.filter((w) => w.active && w.category === 'FIELD').sort((a, b) => b.version - a.version)[0] ?? data.workflows.filter((w) => w.active)[0];

  return (
    <div className="split admin-split">
      <div className="main">
        <Card className="admin-card">
          <div className="admin-head">
            <div className="admin-title">Rate tables</div>
            <div className="spacer" />
            <Button variant="tonal" size="sm" icon="add" onClick={() => setOpen(true)}>
              New effective-dated rate
            </Button>
          </div>
          <div className="tbl-compact tbl-scroll">
            <div>
              <div className="tbl-head">
                <span style={{ flex: 2 }}>Rate</span>
                <span style={{ flex: 1.2 }}>Value</span>
                <span style={{ flex: 1.3 }}>Effective from</span>
                <span style={{ flex: 1.3 }}>Status</span>
              </div>
              {groups.length === 0 ? <EmptyState icon="price_change" title="No rates configured" body="Add the advance percentage, mileage rate and per-diem rates to activate policy calculations." /> : null}
              {groups.map((g) => (
                <div key={g.key} className="admin-rate-group">
                  {g.rates.map((r, i) => {
                    const st = rateStatus(r);
                    return (
                      <div key={r.id} className="tbl-row" title={r.note}>
                        <span style={{ flex: 2, fontWeight: 650, minWidth: 0 }} className="truncate">
                          {i === 0 ? r.label || RATE_KEY_LABELS[r.key] : <span className="t-faint">↳ v{r.version}</span>}
                        </span>
                        <span style={{ flex: 1.2, fontWeight: 700 }}>{fmtRateValue(r)}</span>
                        <span style={{ flex: 1.3 }}>
                          {fmtDate(r.effectiveFrom)}
                          {r.effectiveTo ? <span className="t-caption-sm"> → {fmtDate(r.effectiveTo)}</span> : null}
                        </span>
                        <span style={{ flex: 1.3 }}>
                          <Chip tone={STATUS_TONE[st]} size="xs">
                            {STATUS_LABEL[st]}
                          </Chip>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
      <div className="side">
        {fieldWorkflow ? <WorkflowCard wf={fieldWorkflow} /> : null}
        <PolicyTogglesCard policy={data.policy} />
      </div>
      {open ? <NewRateDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function NewRateDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const create = useCreateRate();
  const [f, setF] = useState({ key: 'MILEAGE_RATE' as RateKey, value: '', unit: 'ZMW_PER_KM' as Rate['unit'], effectiveFrom: isoDate(new Date()), effectiveTo: '', note: '' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const problem = f.value === '' || Number.isNaN(Number(f.value)) ? 'enter a value' : !f.effectiveFrom ? 'set the effective date' : f.effectiveTo && f.effectiveTo < f.effectiveFrom ? 'end before start' : '';
  return (
    <Dialog
      open
      onClose={onClose}
      title="New effective-dated rate"
      subtitle="Rates never overwrite history — a new version applies from its effective date; requests keep the rate in force when they were approved."
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={!!problem}
            disabledLabel={`Save — ${problem}`}
            onClick={() =>
              create.mutate(
                { key: f.key, value: Number(f.value), unit: f.unit, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || null, note: f.note.trim() || undefined },
                {
                  onSuccess: () => {
                    toast.success('Rate scheduled');
                    onClose();
                  },
                  onError: (e) => toast.error(e, 'Could not save rate'),
                },
              )
            }
          >
            Save rate
          </Button>
        </>
      }
    >
      <div className="dlg-grid mt12">
        <SelectField
          label="Rate"
          className="dlg-wide"
          options={KEYS.map((k) => ({ value: k, label: RATE_KEY_LABELS[k] }))}
          value={f.key}
          onChange={(e) => {
            const k = e.target.value as RateKey;
            setF((s) => ({ ...s, key: k, unit: DEFAULT_UNIT[k] }));
          }}
        />
        <TextField label="Value" type="number" step="0.01" min={0} value={f.value} onChange={(e) => set('value', e.target.value)} hint={f.value ? `Shown as ${fmtRateValue({ value: Number(f.value) || 0, unit: f.unit })}` : undefined} />
        <SelectField label="Unit" options={(Object.keys(UNIT_LABELS) as Rate['unit'][]).map((u) => ({ value: u, label: UNIT_LABELS[u] }))} value={f.unit} onChange={(e) => set('unit', e.target.value as Rate['unit'])} />
        <TextField label="Effective from" type="date" value={f.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />
        <TextField label="Effective to (optional)" type="date" value={f.effectiveTo} min={f.effectiveFrom} onChange={(e) => set('effectiveTo', e.target.value)} />
        <TextField label="Note (optional)" className="dlg-wide" placeholder="e.g. Board approval ref, GRZ circular" value={f.note} onChange={(e) => set('note', e.target.value)} />
      </div>
    </Dialog>
  );
}
