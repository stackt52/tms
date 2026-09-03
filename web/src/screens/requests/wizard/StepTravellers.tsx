'use client';
import { useState } from 'react';
import { initialsOf, type TravellerRef } from '@tms/shared';
import { Avatar, Button, Chip, IconButton, SelectField, Switch, TextField } from '@/components/m3';
import { newId, type StepProps } from './wizard-state';

const TONES = ['deep', 'secondary', 'tertiary', 'warning'] as const;

export function StepTravellers({ view, set, md, me, mobile }: StepProps) {
  const [pick, setPick] = useState('');
  const [ext, setExt] = useState('');
  const travellers = view.travellers;
  const users = (md?.users ?? []).filter((u) => !travellers.some((t) => t.userId === u.id));
  const update = (next: TravellerRef[]) => set({ travellers: next, isGroup: view.isGroup || next.length > 1 });

  const addUser = (id: string) => {
    const u = md?.users.find((x) => x.id === id);
    if (!u) return;
    update([...travellers, { userId: u.id, name: u.displayName, initials: u.initials, departmentId: u.departmentId, isLead: travellers.length === 0 }]);
    setPick('');
  };
  const addExternal = () => {
    const name = ext.trim();
    if (!name) return;
    update([...travellers, { externalId: newId('ext'), name, initials: initialsOf(name), isLead: travellers.length === 0 }]);
    setExt('');
  };
  const addMe = () => {
    if (travellers.some((t) => t.userId === me.user.id)) return;
    update([{ userId: me.user.id, name: me.user.displayName, initials: me.user.initials, departmentId: me.user.departmentId, isLead: travellers.length === 0 }, ...travellers]);
  };

  return (
    <div className="col g16">
      <div className="col g8">
        {travellers.length ? (
          travellers.map((t, i) => (
            <div key={t.userId ?? t.externalId ?? `${t.name}-${i}`} className="wiz-person">
              <Avatar initials={t.initials || initialsOf(t.name)} tone={md?.users.find((u) => u.id === t.userId)?.avatarTone ?? TONES[i % TONES.length]} size="sm" />
              <div className="grow">
                <div style={{ fontWeight: 650, fontSize: 13.5 }}>{t.name}</div>
                <div className="t-caption-sm">{t.userId === me.user.id ? 'You' : t.externalId ? 'External traveller' : 'IHM staff'}</div>
              </div>
              {t.isLead ? (
                <Chip tone="active" size="xs">
                  Lead
                </Chip>
              ) : (
                <Button variant="text" size="xs" onClick={() => update(travellers.map((x, j) => ({ ...x, isLead: j === i })))}>
                  Make lead
                </Button>
              )}
              <IconButton icon="close" label={`Remove ${t.name}`} onClick={() => update(travellers.filter((_, j) => j !== i))} />
            </div>
          ))
        ) : (
          <div className="t-caption">
            No travellers yet.{' '}
            <button type="button" className="t-primary" style={{ fontWeight: 650 }} onClick={addMe}>
              Add yourself
            </button>
          </div>
        )}
      </div>

      <div className="wiz-grid">
        <div className="row g10" style={{ alignItems: 'stretch' }}>
          <SelectField className="grow" label="Add IHM colleague" placeholder="Choose a colleague" value={pick} onChange={(e) => setPick(e.target.value)} options={users.map((u) => ({ value: u.id, label: u.displayName }))} onSurface={mobile} />
          <Button variant="tonal" size="sm" icon="person_add" disabled={!pick} onClick={() => addUser(pick)}>
            Add
          </Button>
        </div>
        <div className="row g10" style={{ alignItems: 'stretch' }}>
          <TextField className="grow" label="Add external traveller" placeholder="Full name" value={ext} onChange={(e) => setExt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExternal()} onSurface={mobile} />
          <Button variant="tonal" size="sm" icon="person_add" disabled={!ext.trim()} onClick={addExternal}>
            Add
          </Button>
        </div>
      </div>

      <div className="wiz-switch">
        <div className="grow">
          <div className="wiz-switch__label">Group travel</div>
          <div className="wiz-switch__hint">One request covers everyone listed; per diem and accommodation are costed per traveller.</div>
        </div>
        <Switch checked={view.isGroup} onChange={(v) => set({ isGroup: v })} label="Group travel" />
      </div>
      {!travellers.some((t) => t.userId === me.user.id) && travellers.length ? (
        <Button variant="text" size="sm" icon="person" onClick={addMe} style={{ alignSelf: 'flex-start' }}>
          Add yourself as a traveller
        </Button>
      ) : null}
    </div>
  );
}
