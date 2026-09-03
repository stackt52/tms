'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Icon, SelectField, Switch, TextField, useToast } from '@/components/m3';
import { useCreateExternalPayment, useMasterData } from '@/lib/queries';
import { FinanceNav } from './FinanceNav';
import './finance.css';

/** /finance/external-payments/new — minimal create form; participants are added on the detail screen. */
export function NewExternalPaymentScreen() {
  const router = useRouter();
  const toast = useToast();
  const md = useMasterData();
  const create = useCreateExternalPayment();
  const [form, setForm] = useState({ activityTitle: '', activityLocationName: '', startDate: '', endDate: '', endsBeforeNoon: false, costCentreId: '' });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const missing: string[] = [];
  if (!form.activityTitle.trim()) missing.push('activity title');
  if (!form.activityLocationName.trim()) missing.push('location');
  if (!form.startDate) missing.push('start date');
  if (!form.endDate) missing.push('end date');
  if (!form.costCentreId) missing.push('cost centre');
  const dateError = form.startDate && form.endDate && form.endDate < form.startDate ? 'End date is before the start date' : undefined;
  const blocked = missing.length > 0 || !!dateError;

  const submit = () => {
    create.mutate(
      {
        activityTitle: form.activityTitle.trim(),
        activityLocationName: form.activityLocationName.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        endsBeforeNoon: form.endsBeforeNoon,
        costCentreId: form.costCentreId,
      },
      {
        onSuccess: (res) => {
          toast.success(`${res.payment.id} created — add participants next`);
          router.replace(`/finance/external-payments/${res.payment.id}`);
        },
        onError: (e) => toast.error(e, 'Could not create the request'),
      },
    );
  };

  const ccOptions = (md.data?.costCentres ?? []).map((c) => ({ value: c.id, label: `${c.id} · ${c.name}` }));

  return (
    <div className="page">
      <div className="fin-header">
        <div>
          <div className="t-title">New external payment request</div>
          <div className="t-body-sm t-muted mt4">Workshop, training or meeting where non-IHM participants receive allowances. Payment is by bank transfer or mobile money only — cash is not offered.</div>
        </div>
      </div>
      <FinanceNav />
      <Card className="mt18" style={{ maxWidth: 720 }}>
        <div className="t-card-title mb14">Activity</div>
        <div className="col g18">
          <TextField label="Activity title" placeholder="Community health worker training" value={form.activityTitle} onChange={(e) => set('activityTitle', e.target.value)} autoFocus />
          <TextField label="Location" icon="location_on" placeholder="Chipata" value={form.activityLocationName} onChange={(e) => set('activityLocationName', e.target.value)} hint="Participants whose duty station is here are host-site: lunch instead of DSA, no transport allowance." />
          <div className="ext-form-grid">
            <TextField label="Start date" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            <TextField label="End date" type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} error={dateError} />
          </div>
          <div className="row g12">
            <Switch checked={form.endsBeforeNoon} onChange={(v) => set('endsBeforeNoon', v)} label="Activity ends before noon" />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Activity ends before noon on the last day</div>
              <div className="t-caption">No lunch allowance is paid for a half day ending before 12:00.</div>
            </div>
          </div>
          <SelectField label="Cost centre" icon="account_tree" options={ccOptions} placeholder={md.isLoading ? 'Loading cost centres…' : 'Select a cost centre'} value={form.costCentreId} onChange={(e) => set('costCentreId', e.target.value)} disabled={md.isLoading} />
        </div>
        <div className="row g10 mt22 wrap">
          <Button icon="add" disabled={blocked || create.isPending} loading={create.isPending} disabledLabel={dateError ? 'Fix the dates to continue' : `Create — ${missing.length === 1 ? missing[0] : `${missing.length} fields`} missing`} onClick={submit}>
            Create request
          </Button>
          <Button variant="text" href="/finance/external-payments">
            Cancel
          </Button>
          <div className="spacer" />
          <div className="row g6 t-caption">
            <Icon name="info" size={16} />
            Participants and payout details are captured on the next screen.
          </div>
        </div>
      </Card>
    </div>
  );
}
