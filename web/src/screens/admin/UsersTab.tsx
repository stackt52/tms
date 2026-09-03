'use client';
import { useMemo, useState } from 'react';
import { ROLES, ROLE_LABELS, type AdminOverview, type Role, type UserProfile } from '@tms/shared';
import { Avatar, Button, Card, CheckRow, Chip, Dialog, EmptyState, Icon, SelectField, Switch, TextField, useToast } from '@/components/m3';
import { useUpdateUser } from '@/lib/queries';

export function UsersTab({ data }: { data: AdminOverview }) {
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [filter, setFilter] = useState('');
  const units = useMemo(() => new Map(data.masterData.units.map((u) => [u.id, u.name])), [data.masterData.units]);
  const users = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return [...data.users].filter((u) => !f || u.displayName.toLowerCase().includes(f) || u.email.toLowerCase().includes(f) || u.roles.some((r) => ROLE_LABELS[r].toLowerCase().includes(f))).sort((a, b) => Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName));
  }, [data.users, filter]);
  const roleCounts = useMemo(() => {
    const m = new Map<Role, number>();
    for (const u of data.users) if (u.active) for (const r of u.roles) m.set(r, (m.get(r) ?? 0) + 1);
    return ROLES.filter((r) => m.has(r)).map((r) => ({ role: r, n: m.get(r)! }));
  }, [data.users]);

  return (
    <div className="split admin-split">
      <div className="main">
        <Card className="admin-card">
          <div className="admin-head">
            <div className="admin-title">Users &amp; roles</div>
            <div className="spacer" />
            <TextField label="Filter" placeholder="name, email or role" icon="search" style={{ width: 240 }} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="tbl-compact tbl-scroll">
            <div>
              <div className="tbl-head">
                <span style={{ flex: 2.2 }}>User</span>
                <span style={{ flex: 2.2 }}>Roles</span>
                <span style={{ flex: 1 }}>Unit</span>
                <span style={{ flex: 0.8 }}>Status</span>
                <span style={{ width: 30 }} />
              </div>
              {users.length === 0 ? <EmptyState icon="group" title="No users match" /> : null}
              {users.map((u) => (
                <div key={u.id} className="tbl-row">
                  <span style={{ flex: 2.2, minWidth: 0 }} className="admin-user">
                    <Avatar initials={u.initials} tone={u.avatarTone} size="sm" />
                    <span style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 650 }} className="truncate">
                        {u.displayName}
                      </div>
                      <div className="t-caption-sm truncate">{u.email}</div>
                    </span>
                  </span>
                  <span style={{ flex: 2.2, minWidth: 0 }} className="row g4 wrap">
                    {u.roles.map((r) => (
                      <Chip key={r} tone={r === 'SYSTEM_ADMIN' ? 'active' : 'neutral'} size="xs">
                        {ROLE_LABELS[r]}
                      </Chip>
                    ))}
                  </span>
                  <span style={{ flex: 1 }} className="truncate">
                    {u.unitId ? (units.get(u.unitId) ?? u.unitId) : '—'}
                  </span>
                  <span style={{ flex: 0.8 }}>
                    <Chip tone={u.active ? 'approved' : 'neutral'} size="xs">
                      {u.active ? 'Active' : 'Inactive'}
                    </Chip>
                  </span>
                  <button type="button" className="admin-edit" aria-label={`Edit ${u.displayName}`} onClick={() => setEditing(u)}>
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
          <div className="admin-title admin-title--sm">Active role holders</div>
          <div className="col g6" style={{ fontSize: 12.5 }}>
            {roleCounts.map((r) => (
              <div key={r.role} className="kv">
                <span>{ROLE_LABELS[r.role]}</span>
                <span>{r.n}</span>
              </div>
            ))}
          </div>
          <div className="t-caption mt12">Approval rights derive from roles plus unit / department / cost-centre membership. All authorisation is enforced by the API.</div>
        </Card>
      </div>
      {editing ? <UserDialog user={editing} data={data} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function UserDialog({ user, data, onClose }: { user: UserProfile; data: AdminOverview; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateUser();
  const [f, setF] = useState({
    roles: [...user.roles] as Role[],
    departmentId: user.departmentId ?? '',
    unitId: user.unitId ?? '',
    supervisorId: user.supervisorId ?? '',
    dutyStationId: user.dutyStationId ?? '',
    costCentreIds: [...(user.costCentreIds ?? [])],
    active: user.active,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const md = data.masterData;
  const unitOptions = md.units.filter((u) => !f.departmentId || u.departmentId === f.departmentId);
  const save = () =>
    update.mutate(
      {
        id: user.id,
        roles: f.roles,
        departmentId: f.departmentId || undefined,
        unitId: f.unitId || undefined,
        supervisorId: f.supervisorId || undefined,
        dutyStationId: f.dutyStationId || undefined,
        costCentreIds: f.costCentreIds,
        active: f.active,
      },
      {
        onSuccess: () => {
          toast.success(`${user.displayName} updated`);
          onClose();
        },
        onError: (e) => toast.error(e, 'Could not update user'),
      },
    );
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={user.displayName}
      subtitle={`${user.email}${user.title ? ` · ${user.title}` : ''}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={update.isPending} disabled={f.roles.length === 0} disabledLabel="Save — pick at least one role" onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="col g18 mt12">
        <div>
          <div className="t-label mb8">Roles</div>
          <div className="role-grid">
            {ROLES.map((r) => (
              <CheckRow key={r} checked={f.roles.includes(r)} onChange={(v) => set('roles', v ? [...f.roles, r] : f.roles.filter((x) => x !== r))}>
                {ROLE_LABELS[r]}
              </CheckRow>
            ))}
          </div>
        </div>
        <div className="dlg-grid">
          <SelectField
            label="Department"
            placeholder="—"
            options={md.departments.map((d) => ({ value: d.id, label: d.name }))}
            value={f.departmentId}
            onChange={(e) => setF((s) => ({ ...s, departmentId: e.target.value, unitId: md.units.some((u) => u.id === s.unitId && u.departmentId === e.target.value) ? s.unitId : '' }))}
          />
          <SelectField label="Unit" placeholder="—" options={unitOptions.map((u) => ({ value: u.id, label: u.name }))} value={f.unitId} onChange={(e) => set('unitId', e.target.value)} />
          <SelectField label="Supervisor" placeholder="—" options={data.users.filter((u) => u.id !== user.id && u.active).map((u) => ({ value: u.id, label: u.displayName }))} value={f.supervisorId} onChange={(e) => set('supervisorId', e.target.value)} />
          <SelectField label="Duty station" placeholder="—" options={md.locations.filter((l) => l.isDutyStation).map((l) => ({ value: l.id, label: l.name }))} value={f.dutyStationId} onChange={(e) => set('dutyStationId', e.target.value)} />
        </div>
        <div>
          <div className="t-label mb8">Cost centres</div>
          <div className="role-chips">
            {md.costCentres.map((c) => {
              const on = f.costCentreIds.includes(c.id);
              return (
                <button key={c.id} type="button" className={`role-chip ${on ? 'role-chip--on' : ''}`} aria-pressed={on} onClick={() => set('costCentreIds', on ? f.costCentreIds.filter((x) => x !== c.id) : [...f.costCentreIds, c.id])}>
                  {c.id} · {c.name}
                </button>
              );
            })}
            {md.costCentres.length === 0 ? <span className="t-caption">No cost centres defined yet.</span> : null}
          </div>
        </div>
        <div className="pol-row" style={{ padding: 0 }}>
          <span>Active account — can sign in and submit requests</span>
          <Switch checked={f.active} onChange={(v) => set('active', v)} label="Active" />
        </div>
      </div>
    </Dialog>
  );
}
