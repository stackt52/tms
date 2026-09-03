'use client';
import { useEffect, useRef } from 'react';
import { SelectField, TextArea, TextField } from '@/components/m3';
import type { StepProps } from './wizard-state';

export function StepTripDetails({ view, set, md, me, mobile }: StepProps) {
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (!view.supervisorId && me.supervisor?.id) set({ supervisorId: me.supervisor.id });
  }, [view.supervisorId, me.supervisor?.id, set]);

  const supervisors = (md?.users ?? []).filter((u) => u.roles.includes('UNIT_SUPERVISOR') || u.roles.includes('PROJECT_MANAGER'));
  if (me.supervisor && !supervisors.some((u) => u.id === me.supervisor!.id)) supervisors.unshift({ ...me.supervisor, avatarTone: 'deep', roles: ['UNIT_SUPERVISOR'] });
  const projects = (md?.projects ?? []).filter((p) => p.active);
  const costCentres = (md?.costCentres ?? []).filter((c) => !view.projectId || !c.projectId || c.projectId === view.projectId);
  const os = mobile;

  return (
    <div className="col g16">
      <TextField label="Activity title" placeholder="HIV programme review, Ndola" value={view.activityTitle} onChange={(e) => set({ activityTitle: e.target.value })} onSurface={os} required />
      <div className="wiz-grid">
        <TextField label="Purpose of travel" placeholder="Quarterly programme review with the PHO" value={view.purpose} onChange={(e) => set({ purpose: e.target.value })} onSurface={os} required />
        <TextField label="Work plan reference" placeholder="WP-2026-Q3-14" value={view.workPlanRef} onChange={(e) => set({ workPlanRef: e.target.value })} onSurface={os} hint="Supervisors check the trip against the unit work plan." />
      </div>
      <TextArea label="Activity description" placeholder="What will happen, with whom, and where — list every location." rows={4} value={view.activityDescription} onChange={(e) => set({ activityDescription: e.target.value })} onSurface={os} />
      <TextArea label="Expected outcomes" placeholder="Deliverables and decisions expected from the trip." rows={3} value={view.expectedOutcomes} onChange={(e) => set({ expectedOutcomes: e.target.value })} onSurface={os} />
      <div className="wiz-grid wiz-grid--3">
        <SelectField label="Project" placeholder="Select project" value={view.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })} options={projects.map((p) => ({ value: p.id, label: `${p.id} · ${p.name}` }))} onSurface={os} />
        <SelectField label="Cost centre" placeholder="Select cost centre" value={view.costCentreId ?? ''} onChange={(e) => set({ costCentreId: e.target.value || undefined })} options={costCentres.map((c) => ({ value: c.id, label: `${c.id} · ${c.name}` }))} onSurface={os} />
        <SelectField label="Supervisor" placeholder="Select supervisor" value={view.supervisorId ?? ''} onChange={(e) => set({ supervisorId: e.target.value || undefined })} options={supervisors.map((u) => ({ value: u.id, label: u.displayName }))} onSurface={os} hint={me.supervisor ? `Your line supervisor is ${me.supervisor.displayName}.` : undefined} />
      </div>
      <TextArea label="Justification" placeholder="Why this trip is necessary now and cannot be done remotely." rows={3} value={view.justification} onChange={(e) => set({ justification: e.target.value })} onSurface={os} />
    </div>
  );
}
