'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isoDate } from '@tms/shared';
import { Banner, Button, Card, Icon, PageHeader, Switch, TextField, useToast } from '@/components/m3';
import { useMe } from '@/lib/auth-context';
import { useCreateMileageClaim } from '@/lib/queries';
import './claims.css';

export function NewClaimScreen() {
  const me = useMe();
  const router = useRouter();
  const toast = useToast();
  const create = useCreateMileageClaim();
  const [f, setF] = useState({
    purpose: '',
    date: isoDate(new Date()),
    fromName: me.dutyStation?.name ?? '',
    toName: '',
    distanceKm: '',
    preApprovalRef: '',
    province: me.user.province ?? me.dutyStation?.province ?? '',
    withinProvince: true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const problem = !f.purpose.trim() ? 'add a purpose' : !f.date ? 'pick the date' : !f.fromName.trim() || !f.toName.trim() ? 'add from and to' : !(Number(f.distanceKm) > 0) ? 'enter the return distance' : '';

  const submit = () =>
    create.mutate(
      {
        purpose: f.purpose.trim(),
        date: f.date,
        fromName: f.fromName.trim(),
        toName: f.toName.trim(),
        distanceKm: Number(f.distanceKm),
        province: f.province.trim() || undefined,
        withinProvince: f.withinProvince,
        preApprovalRef: f.preApprovalRef.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          toast.success(`Claim ${res.claim.id} created — attach your evidence`);
          router.push(`/claims/${res.claim.id}`);
        },
        onError: (e) => toast.error(e, 'Could not create claim'),
      },
    );

  return (
    <div className="page">
      <PageHeader
        back={
          <Link href="/claims" className="row g4 t-caption" style={{ marginBottom: 6 }}>
            <Icon name="arrow_back" size={16} /> Mileage claims
          </Link>
        }
        title="New mileage claim"
        subtitle="Private vehicle · reimbursed per km at the effective-dated rate · requires supervisor pre-approval and route evidence."
      />
      <Card className="mil-card claim-form mt20">
        <div className="mil-row">
          <TextField label="Trip purpose" placeholder="e.g. DHIS2 mentorship — Kafue District Hospital" className="grow" value={f.purpose} onChange={(e) => set('purpose', e.target.value)} />
          <TextField label="Date" type="date" style={{ width: 170 }} value={f.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="mil-row">
          <TextField label="From" placeholder="Start point" className="grow" value={f.fromName} onChange={(e) => set('fromName', e.target.value)} />
          <TextField label="To" placeholder="Destination" className="grow" value={f.toName} onChange={(e) => set('toName', e.target.value)} />
          <TextField label="Distance (return)" type="number" min={1} inputMode="decimal" className="mil-dist" style={{ width: 150 }} trailing={<span className="t-caption-sm">km</span>} value={f.distanceKm} onChange={(e) => set('distanceKm', e.target.value)} />
        </div>
        <div className="mil-row">
          <TextField label="Pre-approval reference (optional)" placeholder="e.g. SUP-0311" className="grow" value={f.preApprovalRef} onChange={(e) => set('preApprovalRef', e.target.value)} hint="Supervisor's written pre-approval — you can attach the evidence on the next screen." />
          <TextField label="Province" placeholder="e.g. Lusaka" style={{ width: 200 }} value={f.province} onChange={(e) => set('province', e.target.value)} />
        </div>
        <div className="row g12" style={{ marginTop: 18, fontSize: 13.5 }}>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>Trip is within my province</div>
            <div className="t-caption">Mileage claims are limited to travel within the staff member&apos;s province of duty station.</div>
          </div>
          <Switch checked={f.withinProvince} onChange={(v) => set('withinProvince', v)} label="Within province" />
        </div>
        {!f.withinProvince ? (
          <div className="mt14">
            <Banner tone="warning">Out-of-province travel is not eligible for mileage — submit a travel request instead.</Banner>
          </div>
        ) : null}
        <div className="row g10 mt22" style={{ justifyContent: 'flex-end' }}>
          <Button variant="text" href="/claims">
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!!problem} disabledLabel={`Create claim — ${problem}`}>
            Create claim
          </Button>
        </div>
      </Card>
    </div>
  );
}
