'use client';
import { useState } from 'react';
import { fmtStamp, type AdminOverview, type PolicyConfig } from '@tms/shared';
import { Button, Card, Switch, TextField, humanize, useToast } from '@/components/m3';
import { useRunDailyJobs, useUpdatePolicy } from '@/lib/queries';

type Toggles = PolicyConfig['toggles'];
const TOGGLES: { key: keyof Toggles; label: string }[] = [
  { key: 'blockAdvanceOnOutstandingLiquidation', label: 'Block advances on outstanding liquidation' },
  { key: 'requireInternationalNotice', label: 'Require 2-week notice — international' },
  { key: 'economyOnlyInternational', label: 'Economy-only international airfare' },
  { key: 'approvalDelegation', label: 'Approval delegation' },
  { key: 'restrictRentalToApprovedVendors', label: 'Restrict rentals to approved vendors' },
];

type ThresholdKey = Exclude<keyof PolicyConfig, 'toggles' | 'publicHolidaysMMDD' | 'updatedAt' | 'updatedBy'>;
const THRESHOLDS: { key: ThresholdKey; label: string; unit: string }[] = [
  { key: 'distanceThresholdKm', label: 'Per-diem distance threshold', unit: 'km' },
  { key: 'hoursThreshold', label: 'Per-diem time-away threshold', unit: 'hours' },
  { key: 'liquidationDeadlineDays', label: 'Liquidation deadline', unit: 'days' },
  { key: 'advanceLeadTimeWorkingDays', label: 'Advance lead time', unit: 'working days' },
  { key: 'procurementLeadTimeWorkingDays', label: 'Procurement lead time', unit: 'working days' },
  { key: 'internationalNoticeDays', label: 'International notice', unit: 'days' },
  { key: 'meetingNoticeWorkingDays', label: 'Meeting notice', unit: 'working days' },
  { key: 'eventNoticeWorkingDays', label: 'Event notice', unit: 'working days' },
  { key: 'lateInternationalClaimDays', label: 'Late international claim window', unit: 'days' },
];

export function PolicyTogglesCard({ policy }: { policy: PolicyConfig }) {
  const toast = useToast();
  const update = useUpdatePolicy();
  const [opt, setOpt] = useState<Partial<Toggles>>({});
  const value = (k: keyof Toggles) => opt[k] ?? policy.toggles[k];
  const onToggle = (k: keyof Toggles, v: boolean) => {
    setOpt((o) => ({ ...o, [k]: v }));
    const toggles: Toggles = { ...policy.toggles, ...opt, [k]: v };
    update.mutate(
      { toggles },
      {
        onSuccess: () => toast.success(`${TOGGLES.find((t) => t.key === k)?.label} ${v ? 'enabled' : 'disabled'}`),
        onError: (e) => toast.error(e, 'Could not update policy'),
        onSettled: () =>
          setOpt((o) => {
            const n = { ...o };
            delete n[k];
            return n;
          }),
      },
    );
  };
  return (
    <Card className="admin-card" style={{ fontSize: 13 }}>
      <div className="admin-title admin-title--sm" style={{ marginBottom: 10 }}>
        Policy toggles
      </div>
      {TOGGLES.map((t) => (
        <div key={t.key} className="pol-row">
          <span>{t.label}</span>
          <Switch checked={value(t.key)} onChange={(v) => onToggle(t.key, v)} label={t.label} disabled={update.isPending && opt[t.key] === undefined} />
        </div>
      ))}
    </Card>
  );
}

function summarise(res: unknown): string {
  if (!res || typeof res !== 'object') return '';
  const parts = Object.entries(res as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${humanize(k.replace(/([a-z])([A-Z])/g, '$1_$2'))} ${v as number}`);
  return parts.join(' · ');
}

export function PolicyTab({ data }: { data: AdminOverview }) {
  const toast = useToast();
  const update = useUpdatePolicy();
  const run = useRunDailyJobs();
  const policy = data.policy;
  const [draft, setDraft] = useState<Partial<Record<ThresholdKey, string>>>({});
  const dirty = Object.keys(draft).length > 0;
  const val = (k: ThresholdKey) => draft[k] ?? String(policy[k]);
  const save = () => {
    const body: Partial<PolicyConfig> = {};
    for (const [k, v] of Object.entries(draft) as [ThresholdKey, string][]) body[k] = Math.max(0, Number(v) || 0);
    update.mutate(body, {
      onSuccess: () => {
        toast.success('Thresholds saved');
        setDraft({});
      },
      onError: (e) => toast.error(e, 'Could not save thresholds'),
    });
  };
  return (
    <div className="split admin-split">
      <div className="main col g14">
        <PolicyTogglesCard policy={policy} />
        <Card className="admin-card">
          <div className="admin-head">
            <div className="admin-title admin-title--sm" style={{ margin: 0 }}>
              Thresholds
            </div>
            <div className="spacer" />
            <Button size="sm" loading={update.isPending} disabled={!dirty} disabledLabel="Saved" onClick={save}>
              Save changes
            </Button>
          </div>
          <div className="thr-grid">
            {THRESHOLDS.map((t) => (
              <TextField key={t.key} label={t.label} type="number" min={0} value={val(t.key)} onChange={(e) => setDraft((d) => ({ ...d, [t.key]: e.target.value }))} trailing={<span className="t-caption-sm">{t.unit}</span>} />
            ))}
          </div>
          <div className="t-caption mt14">
            Last updated {fmtStamp(policy.updatedAt)}
            {policy.updatedBy ? ` by ${policy.updatedBy}` : ''} · Public holidays: {policy.publicHolidaysMMDD.join(', ')}
          </div>
        </Card>
      </div>
      <div className="side">
        <Card className="admin-card">
          <div className="admin-title admin-title--sm">Daily SOP jobs</div>
          <div className="t-caption">Moves returned trips to Awaiting liquidation, sends 5-day deadline reminders, flags overdue liquidations (blocking new advances) and expires stale drafts. Runs nightly; trigger it now after changing thresholds.</div>
          <Button
            variant="tonal"
            icon="play_arrow"
            style={{ marginTop: 14 }}
            loading={run.isPending}
            onClick={() =>
              run.mutate(
                {},
                {
                  onSuccess: (res) => {
                    const s = summarise(res);
                    toast.success(s ? `Daily jobs run · ${s}` : 'Daily jobs run');
                  },
                  onError: (e) => toast.error(e, 'Daily jobs failed'),
                },
              )
            }
          >
            Run daily SOP jobs now
          </Button>
        </Card>
      </div>
    </div>
  );
}
