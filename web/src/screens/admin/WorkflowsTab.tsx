'use client';
import { useMemo, useState } from 'react';
import { REQUEST_STATUSES, ROLES, ROLE_LABELS, STATUS_META, fmtDate, type AdminOverview, type Role, type WorkflowDefinition, type WorkflowStage } from '@tms/shared';
import { Button, Card, Chip, Dialog, EmptyState, Icon, IconButton, SelectField, Switch, TextField, useToast } from '@/components/m3';
import { useCreateWorkflow } from '@/lib/queries';

const CATEGORY_TITLES: Record<WorkflowDefinition['category'], string> = {
  LOCAL: 'Local travel',
  FIELD: 'Project / Field travel',
  INTERNATIONAL: 'International travel',
  EXTERNAL_PAYMENT: 'External-party payment',
  MILEAGE: 'Mileage claim',
  VEHICLE_BOOKING: 'Vehicle booking',
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'stage';

export function WorkflowCard({ wf, onEdit }: { wf: WorkflowDefinition; onEdit?: () => void }) {
  const [open, setOpen] = useState(false);
  const edit = onEdit ?? (() => setOpen(true));
  return (
    <Card className="admin-card">
      <div className="admin-title admin-title--sm">Workflow — {CATEGORY_TITLES[wf.category] ?? wf.name}</div>
      <div className="wf-chain">
        <span className="wf-pill">{wf.category === 'EXTERNAL_PAYMENT' ? 'Cost centre staff' : 'Traveller'}</span>
        {wf.stages.map((s, i) => (
          <span key={s.key} style={{ display: 'contents' }}>
            <Icon name="arrow_forward" size={16} color="var(--md-outline)" />
            <span className={`wf-pill ${i === wf.stages.length - 1 ? 'wf-pill--last' : ''}`} title={s.roles.map((r) => ROLE_LABELS[r]).join(', ')}>
              {s.label}
            </span>
          </span>
        ))}
      </div>
      <button type="button" className="wf-edit" onClick={edit}>
        <Icon name="edit" size={17} />
        Edit steps · versioned, applies to new requests only
      </button>
      <div className="t-caption-sm mt8">
        v{wf.version} · effective {fmtDate(wf.effectiveFrom)}
        {wf.note ? ` · ${wf.note}` : ''}
      </div>
      {open && !onEdit ? <WorkflowEditDialog wf={wf} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

export function WorkflowsTab({ data }: { data: AdminOverview }) {
  const latest = useMemo(() => {
    const m = new Map<WorkflowDefinition['category'], WorkflowDefinition>();
    for (const w of [...data.workflows].sort((a, b) => b.version - a.version)) if (w.active && !m.has(w.category)) m.set(w.category, w);
    return [...m.values()];
  }, [data.workflows]);
  const history = useMemo(() => [...data.workflows].sort((a, b) => (a.category === b.category ? b.version - a.version : a.category.localeCompare(b.category))), [data.workflows]);
  return (
    <div className="split admin-split">
      <div className="main col g14">
        {latest.length === 0 ? (
          <Card>
            <EmptyState icon="account_tree" title="No workflows defined" body="Seed the default SOP §10 chains from the API, then refine them here." />
          </Card>
        ) : null}
        {latest.map((w) => (
          <WorkflowCard key={w.id} wf={w} />
        ))}
      </div>
      <div className="side">
        <Card className="admin-card">
          <div className="admin-title admin-title--sm">Version history</div>
          <div className="col g8" style={{ fontSize: 12.5 }}>
            {history.map((w) => (
              <div key={w.id} className="row g8">
                <span className="grow truncate">
                  <b>{CATEGORY_TITLES[w.category] ?? w.name}</b> · v{w.version}
                </span>
                <span className="t-caption-sm">{fmtDate(w.effectiveFrom)}</span>
                <Chip tone={w.active ? 'approved' : 'neutral'} size="xs">
                  {w.active ? 'Active' : 'Superseded'}
                </Chip>
              </div>
            ))}
          </div>
          <div className="t-caption mt12">Editing a chain creates version N+1. In-flight requests keep the version they were submitted under; only new requests use the latest.</div>
        </Card>
      </div>
    </div>
  );
}

export function WorkflowEditDialog({ wf, onClose }: { wf: WorkflowDefinition; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateWorkflow();
  const [stages, setStages] = useState<WorkflowStage[]>(() => wf.stages.map((s) => ({ ...s, roles: [...s.roles] })));
  const [note, setNote] = useState('');
  const patch = (i: number, p: Partial<WorkflowStage>) => setStages((xs) => xs.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) =>
    setStages((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const remove = (i: number) => setStages((xs) => xs.filter((_, j) => j !== i));
  const add = () => setStages((xs) => [...xs, { key: `stage_${xs.length + 1}`, label: 'New stage', roles: [], status: 'SUBMITTED', checklist: false }]);
  const problem = stages.length === 0 ? 'add at least one stage' : stages.some((s) => !s.label.trim()) ? 'every stage needs a label' : stages.some((s) => s.roles.length === 0) ? 'every stage needs a role' : '';
  const save = () =>
    create.mutate(
      { category: wf.category, name: wf.name, stages: stages.map((s, i) => ({ ...s, key: s.key || `${slug(s.label)}_${i + 1}`, label: s.label.trim() })), note: note.trim() || undefined },
      {
        onSuccess: (w) => {
          toast.success(`Workflow v${w.version} published — applies to new requests`);
          onClose();
        },
        onError: (e) => toast.error(e, 'Could not publish workflow'),
      },
    );
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`Edit steps — ${CATEGORY_TITLES[wf.category] ?? wf.name}`}
      subtitle={`Currently v${wf.version}. Saving publishes v${wf.version + 1}; requests already in flight are not affected.`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={!!problem} disabledLabel={`Publish v${wf.version + 1} — ${problem}`} onClick={save}>
            Publish v{wf.version + 1}
          </Button>
        </>
      }
    >
      <div className="col g12 mt12">
        {stages.map((s, i) => (
          <div key={i} className="wf-stage">
            <div className="wf-stage__head">
              <span className="wf-stage__num">{i + 1}</span>
              <span className="t-caption-sm">{s.key}</span>
              <div className="spacer" />
              <IconButton icon="arrow_upward" label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon="arrow_downward" label="Move down" disabled={i === stages.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon="delete" label="Remove stage" onClick={() => remove(i)} />
            </div>
            <div className="dlg-grid">
              <TextField label="Stage label" value={s.label} onChange={(e) => patch(i, { label: e.target.value, key: wf.stages[i]?.key === s.key && wf.stages[i] ? s.key : slug(e.target.value) })} />
              <SelectField label="Status while at this stage" options={REQUEST_STATUSES.map((st) => ({ value: st, label: STATUS_META[st].label }))} value={s.status} onChange={(e) => patch(i, { status: e.target.value as WorkflowStage['status'] })} />
              <div className="dlg-wide">
                <div className="t-caption-sm mb8">Roles that can act</div>
                <div className="role-chips">
                  {ROLES.map((r) => {
                    const on = s.roles.includes(r);
                    return (
                      <button key={r} type="button" className={`role-chip ${on ? 'role-chip--on' : ''}`} aria-pressed={on} onClick={() => patch(i, { roles: on ? s.roles.filter((x) => x !== r) : [...s.roles, r as Role] })}>
                        {ROLE_LABELS[r]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="pol-row dlg-wide" style={{ padding: 0 }}>
                <span>Show SOP §9.2 checklist and gate Approve on it</span>
                <Switch checked={!!s.checklist} onChange={(v) => patch(i, { checklist: v })} label="Checklist" />
              </div>
            </div>
          </div>
        ))}
        <Button variant="text" icon="add_circle" onClick={add} style={{ alignSelf: 'flex-start' }}>
          Add stage
        </Button>
        <TextField label="Change note (optional)" placeholder="Why this version exists" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  );
}
