'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { fmtDate, type AdminOverview, type Vehicle } from '@tms/shared';
import { Button, Card, Chip, Dialog, EmptyState, Icon, Segmented, SelectField, Switch, TextField, humanize, useToast } from '@/components/m3';
import { useUpsertMasterData, useUpsertVehicle } from '@/lib/queries';

type Kind = 'departments' | 'units' | 'projects' | 'cost-centres' | 'locations' | 'vehicles';
type Row = Record<string, unknown>;
type Field = { key: string; label: string; type?: 'text' | 'number' | 'date' | 'select' | 'switch'; options?: { value: string; label: string }[]; wide?: boolean; required?: boolean; readOnlyOnEdit?: boolean; hint?: string };
type Column = { key: string; label: string; flex: number; render?: (r: Row) => ReactNode };

const KIND_LABEL: Record<Kind, string> = { departments: 'Departments', units: 'Units', projects: 'Projects', 'cost-centres': 'Cost centres', locations: 'Locations', vehicles: 'Vehicles' };
const SINGULAR: Record<Kind, string> = { departments: 'department', units: 'unit', projects: 'project', 'cost-centres': 'cost centre', locations: 'location', vehicles: 'vehicle' };

const str = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v));
const yesNo = (v: unknown) => (
  <Chip tone={v ? 'approved' : 'neutral'} size="xs">
    {v ? 'Yes' : 'No'}
  </Chip>
);

export function MasterDataTab({ data }: { data: AdminOverview }) {
  const [kind, setKind] = useState<Kind>('departments');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const md = data.masterData;
  const userOpts = useMemo(() => data.users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.displayName })), [data.users]);
  const userName = useMemo(() => new Map(data.users.map((u) => [u.id, u.displayName])), [data.users]);
  const deptName = useMemo(() => new Map(md.departments.map((d) => [d.id, d.name])), [md.departments]);
  const projName = useMemo(() => new Map(md.projects.map((p) => [p.id, p.name])), [md.projects]);
  const byUser = (v: unknown) => (v ? (userName.get(String(v)) ?? String(v)) : '—');

  const spec: Record<Kind, { rows: Row[]; columns: Column[]; fields: Field[] }> = {
    departments: {
      rows: md.departments as unknown as Row[],
      columns: [
        { key: 'name', label: 'Department', flex: 2 },
        { key: 'hodId', label: 'Head of department', flex: 1.5, render: (r) => byUser(r.hodId) },
      ],
      fields: [
        { key: 'name', label: 'Name', wide: true, required: true },
        { key: 'hodId', label: 'Head of department', type: 'select', options: userOpts, wide: true },
      ],
    },
    units: {
      rows: md.units as unknown as Row[],
      columns: [
        { key: 'name', label: 'Unit', flex: 2 },
        { key: 'departmentId', label: 'Department', flex: 1.5, render: (r) => (deptName.get(String(r.departmentId)) ?? str(r.departmentId)) },
        { key: 'supervisorId', label: 'Supervisor', flex: 1.5, render: (r) => byUser(r.supervisorId) },
      ],
      fields: [
        { key: 'name', label: 'Name', wide: true, required: true },
        { key: 'departmentId', label: 'Department', type: 'select', options: md.departments.map((d) => ({ value: d.id, label: d.name })), required: true },
        { key: 'supervisorId', label: 'Unit supervisor', type: 'select', options: userOpts },
      ],
    },
    projects: {
      rows: md.projects as unknown as Row[],
      columns: [
        { key: 'id', label: 'Code', flex: 0.9 },
        { key: 'name', label: 'Project', flex: 2 },
        { key: 'managerId', label: 'Manager', flex: 1.3, render: (r) => byUser(r.managerId) },
        { key: 'directorId', label: 'Director', flex: 1.3, render: (r) => byUser(r.directorId) },
        { key: 'active', label: 'Active', flex: 0.7, render: (r) => yesNo(r.active) },
      ],
      fields: [
        { key: 'id', label: 'Project code', required: true, readOnlyOnEdit: true, hint: 'e.g. GHSC-Z' },
        { key: 'name', label: 'Name', required: true },
        { key: 'managerId', label: 'Project manager', type: 'select', options: userOpts },
        { key: 'directorId', label: 'Project director', type: 'select', options: userOpts },
        { key: 'active', label: 'Active', type: 'switch', wide: true },
      ],
    },
    'cost-centres': {
      rows: md.costCentres as unknown as Row[],
      columns: [
        { key: 'id', label: 'Code', flex: 0.9 },
        { key: 'name', label: 'Cost centre', flex: 2 },
        { key: 'ownerId', label: 'Owner', flex: 1.3, render: (r) => byUser(r.ownerId) },
        { key: 'projectId', label: 'Project', flex: 1.2, render: (r) => (r.projectId ? (projName.get(String(r.projectId)) ?? String(r.projectId)) : '—') },
        { key: 'fundingSource', label: 'Funding', flex: 0.9, render: (r) => (r.fundingSource ? humanize(String(r.fundingSource)) : '—') },
      ],
      fields: [
        { key: 'id', label: 'Cost centre code', required: true, readOnlyOnEdit: true, hint: 'e.g. CC-114' },
        { key: 'name', label: 'Name', required: true },
        { key: 'ownerId', label: 'Owner', type: 'select', options: userOpts },
        { key: 'projectId', label: 'Project', type: 'select', options: md.projects.map((p) => ({ value: p.id, label: `${p.id} · ${p.name}` })) },
        {
          key: 'fundingSource',
          label: 'Funding source',
          type: 'select',
          options: [
            { value: 'PROJECT', label: 'Project' },
            { value: 'OVERHEAD', label: 'Overhead' },
          ],
        },
        { key: 'budget', label: 'Budget (ZMW)', type: 'number' },
      ],
    },
    locations: {
      rows: md.locations as unknown as Row[],
      columns: [
        { key: 'name', label: 'Location', flex: 2 },
        { key: 'town', label: 'Town', flex: 1 },
        { key: 'province', label: 'Province', flex: 1 },
        { key: 'country', label: 'Country', flex: 0.6 },
        { key: 'isDutyStation', label: 'Duty station', flex: 0.9, render: (r) => yesNo(r.isDutyStation) },
      ],
      fields: [
        { key: 'name', label: 'Name', wide: true, required: true, hint: 'e.g. Ndola — Copperbelt PHO' },
        { key: 'town', label: 'Town', required: true },
        { key: 'province', label: 'Province', required: true },
        { key: 'country', label: 'Country (ISO)', hint: 'ZM' },
        { key: 'lat', label: 'Latitude', type: 'number' },
        { key: 'lng', label: 'Longitude', type: 'number' },
        { key: 'isDutyStation', label: 'Duty station', type: 'switch' },
      ],
    },
    vehicles: {
      rows: md.vehicles as unknown as Row[],
      columns: [
        { key: 'make', label: 'Vehicle', flex: 1.8, render: (r) => `${str(r.make)} ${str(r.model)}${r.year ? ` (${r.year})` : ''}` },
        { key: 'registration', label: 'Registration', flex: 1 },
        { key: 'odometerKm', label: 'Odometer', flex: 0.9, render: (r) => (typeof r.odometerKm === 'number' ? `${r.odometerKm.toLocaleString('en-ZM')} km` : '—') },
        {
          key: 'status',
          label: 'Status',
          flex: 1.3,
          render: (r) => (
            <span className="row g6 wrap">
              <Chip tone={r.status === 'AVAILABLE' ? 'approved' : r.status === 'IN_SERVICE' ? 'blocked' : 'neutral'} size="xs">
                {humanize(String(r.status ?? 'AVAILABLE'))}
              </Chip>
              {r.status === 'IN_SERVICE' && r.serviceDueBack ? <span className="t-caption-sm">back {fmtDate(String(r.serviceDueBack))}</span> : null}
            </span>
          ),
        },
        { key: 'assignedDriverName', label: 'Driver', flex: 1, render: (r) => str(r.assignedDriverName ?? (r.assignedDriverId ? userName.get(String(r.assignedDriverId)) : undefined)) },
      ],
      fields: [
        { key: 'make', label: 'Make', required: true },
        { key: 'model', label: 'Model', required: true },
        { key: 'year', label: 'Year', type: 'number' },
        { key: 'registration', label: 'Registration', required: true, hint: 'e.g. BAD 4721' },
        { key: 'odometerKm', label: 'Odometer (km)', type: 'number', required: true },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'AVAILABLE', label: 'Available' },
            { value: 'IN_SERVICE', label: 'In service' },
            { value: 'RETIRED', label: 'Retired' },
          ],
        },
        { key: 'serviceNote', label: 'Service note', hint: 'Shown on the fleet calendar while in service' },
        { key: 'serviceDueBack', label: 'Due back', type: 'date' },
        { key: 'assignedDriverId', label: 'Default driver', type: 'select', options: userOpts },
        { key: 'projectId', label: 'Project', type: 'select', options: md.projects.map((p) => ({ value: p.id, label: `${p.id} · ${p.name}` })) },
      ],
    },
  };
  const cur = spec[kind];

  return (
    <div className="split admin-split">
      <div className="main">
        <Card className="admin-card">
          <div className="admin-head">
            <div className="admin-title">Master data</div>
            <div className="spacer" />
            <Button variant="tonal" size="sm" icon="add" onClick={() => setEditing('new')}>
              Add {SINGULAR[kind]}
            </Button>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <Segmented<Kind>
              options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              value={kind}
              onChange={(k) => {
                setKind(k);
                setEditing(null);
              }}
            />
          </div>
          <div className="tbl-compact tbl-scroll">
            <div>
              <div className="tbl-head">
                {cur.columns.map((c) => (
                  <span key={c.key} style={{ flex: c.flex }}>
                    {c.label}
                  </span>
                ))}
                <span style={{ width: 30 }} />
              </div>
              {cur.rows.length === 0 ? <EmptyState icon="dataset" title={`No ${KIND_LABEL[kind].toLowerCase()} yet`} /> : null}
              {cur.rows.map((r) => (
                <div key={String(r.id)} className="tbl-row">
                  {cur.columns.map((c, i) => (
                    <span key={c.key} style={{ flex: c.flex, minWidth: 0, fontWeight: i === 0 ? 650 : undefined }} className="truncate">
                      {c.render ? c.render(r) : str(r[c.key])}
                    </span>
                  ))}
                  <button type="button" className="admin-edit" aria-label="Edit" onClick={() => setEditing(r)}>
                    <Icon name="edit" size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
      <div className="side">
        <Card className="admin-card">
          <div className="admin-title admin-title--sm">Reference data</div>
          <div className="col g6" style={{ fontSize: 12.5 }}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <div key={k} className="kv">
                <span>{KIND_LABEL[k]}</span>
                <span>{spec[k].rows.length}</span>
              </div>
            ))}
          </div>
          <div className="t-caption mt12">Locations drive the 55 km per-diem check (great-circle distance from the duty station); vehicles appear on the fleet calendar as soon as they are added.</div>
        </Card>
      </div>
      {editing ? <EntityDialog key={`${kind}-${editing === 'new' ? 'new' : String(editing.id)}`} kind={kind} fields={cur.fields} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EntityDialog({ kind, fields, row, onClose }: { kind: Kind; fields: Field[]; row: Row | null; onClose: () => void }) {
  const toast = useToast();
  const upsertMd = useUpsertMasterData();
  const upsertVehicle = useUpsertVehicle();
  const [f, setF] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    for (const fl of fields) {
      const v = row?.[fl.key];
      init[fl.key] = fl.type === 'switch' ? (row ? !!v : fl.key === 'active') : v === undefined || v === null ? '' : String(v);
    }
    return init;
  });
  const missing = fields.find((fl) => fl.required && fl.type !== 'switch' && !String(f[fl.key] ?? '').trim());
  const busy = upsertMd.isPending || upsertVehicle.isPending;
  const save = () => {
    const data: Record<string, unknown> = {};
    for (const fl of fields) {
      const v = f[fl.key];
      if (fl.type === 'switch') data[fl.key] = !!v;
      else if (fl.type === 'number') data[fl.key] = v === '' ? undefined : Number(v);
      else data[fl.key] = typeof v === 'string' && v.trim() ? v.trim() : undefined;
    }
    const done = () => {
      toast.success(`${humanize(SINGULAR[kind])} ${row ? 'updated' : 'added'}`);
      onClose();
    };
    const fail = (e: unknown) => toast.error(e, `Could not save ${SINGULAR[kind]}`);
    if (kind === 'vehicles') {
      upsertVehicle.mutate({ id: row ? String(row.id) : undefined, ...(data as Partial<Vehicle>) }, { onSuccess: done, onError: fail });
    } else {
      const id = row ? String(row.id) : undefined;
      if (id) delete data.id;
      upsertMd.mutate({ kind, id, data }, { onSuccess: done, onError: fail });
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? `Edit ${SINGULAR[kind]}` : `Add ${SINGULAR[kind]}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!!missing} disabledLabel={missing ? `Save — ${missing.label.toLowerCase()} required` : 'Save'} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="dlg-grid mt12">
        {fields.map((fl) => {
          const cls = fl.wide ? 'dlg-wide' : undefined;
          if (fl.type === 'switch') {
            return (
              <div key={fl.key} className={`pol-row ${cls ?? ''}`} style={{ padding: 0 }}>
                <span>{fl.label}</span>
                <Switch checked={!!f[fl.key]} onChange={(v) => setF((s) => ({ ...s, [fl.key]: v }))} label={fl.label} />
              </div>
            );
          }
          if (fl.type === 'select') {
            return <SelectField key={fl.key} label={fl.label} className={cls} placeholder="—" options={fl.options ?? []} value={String(f[fl.key] ?? '')} onChange={(e) => setF((s) => ({ ...s, [fl.key]: e.target.value }))} hint={fl.hint} />;
          }
          return (
            <TextField
              key={fl.key}
              label={fl.label}
              className={cls}
              type={fl.type === 'number' ? 'number' : fl.type === 'date' ? 'date' : 'text'}
              step={fl.type === 'number' ? 'any' : undefined}
              value={String(f[fl.key] ?? '')}
              readOnly={!!row && fl.readOnlyOnEdit}
              hint={fl.hint}
              onChange={(e) => setF((s) => ({ ...s, [fl.key]: e.target.value }))}
            />
          );
        })}
      </div>
    </Dialog>
  );
}
