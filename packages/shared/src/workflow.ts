import type { Role } from './roles';
import type { RequestStatus } from './status';
import type { TravelCategory, WorkflowDefinition, WorkflowStage } from './types';

/** SOP §9.2 supervisor checklist — keys are stable so approvals can persist tick state. */
export const SUPERVISOR_CHECKLIST: { key: string; label: string }[] = [
  { key: 'work_plan', label: 'Trip aligned to work plan and required for project objectives' },
  { key: 'prudent_days', label: 'Travel days prudent; limited to maximum nights required' },
  { key: 'no_weekends', label: 'Unnecessary weekends and public holidays excluded' },
  { key: 'dates_clear', label: 'Departure and arrival dates clearly stated' },
  { key: 'per_diem_justified', label: 'Hotel / per diem justified — location cannot be accessed daily' },
  { key: 'activity_described', label: 'Activity fully described; all locations listed' },
  { key: 'complete', label: 'Request complete with required evidence attached' },
];

const supervisor: WorkflowStage = {
  key: 'supervisor',
  label: 'Unit Supervisor',
  roles: ['UNIT_SUPERVISOR', 'PROJECT_MANAGER'],
  status: 'SUPERVISOR_REVIEW',
  checklist: true,
};
const hodCc: WorkflowStage = {
  key: 'hod_cc',
  label: 'HOD / Cost centre',
  roles: ['HEAD_OF_DEPARTMENT', 'COST_CENTRE_OWNER'],
  status: 'HOD_COST_CENTRE_REVIEW',
};
const finance: WorkflowStage = {
  key: 'finance',
  label: 'Finance Accountant',
  roles: ['FINANCE_ACCOUNTANT'],
  status: 'FINANCE_REVIEW',
};
const financeDirector: WorkflowStage = {
  key: 'finance_director',
  label: 'Finance Director',
  roles: ['FINANCE_DIRECTOR'],
  status: 'FINANCE_DIRECTOR_REVIEW',
};
const finalApproval: WorkflowStage = {
  key: 'final',
  label: 'Project Director / CEO',
  roles: ['PROJECT_DIRECTOR', 'CEO'],
  status: 'FINAL_APPROVAL',
};
const procurement: WorkflowStage = {
  key: 'procurement',
  label: 'Procurement',
  roles: ['PROCUREMENT_OFFICER'],
  status: 'PROCUREMENT_REVIEW',
};

/** Indicative chains from SRS §10.1–10.3 (configurable; seeded as version 1). */
export const DEFAULT_WORKFLOWS: Omit<WorkflowDefinition, 'createdAt'>[] = [
  {
    id: 'wf-local-v1',
    category: 'LOCAL',
    name: 'Local / domestic travel',
    version: 1,
    stages: [supervisor, hodCc, finance, financeDirector],
    active: true,
    effectiveFrom: '2026-01-01',
    note: 'SRS §10.1 — Traveller → Unit Supervisor / PM → HOD / Cost Centre → Finance → Finance Director',
  },
  {
    id: 'wf-field-v1',
    category: 'FIELD',
    name: 'Project / field travel',
    version: 1,
    stages: [supervisor, hodCc, finance, financeDirector, finalApproval],
    active: true,
    effectiveFrom: '2026-01-01',
    note: 'SRS §10.2 — adds Project Director / CEO final approval',
  },
  {
    id: 'wf-international-v1',
    category: 'INTERNATIONAL',
    name: 'International travel',
    version: 1,
    stages: [supervisor, hodCc, finance, financeDirector, finalApproval, procurement],
    active: true,
    effectiveFrom: '2026-01-01',
    note: 'SRS §10.3 — adds Procurement after executive approval',
  },
  {
    id: 'wf-external-v1',
    category: 'EXTERNAL_PAYMENT',
    name: 'External-party payment',
    version: 1,
    stages: [
      { key: 'cc_head', label: 'Cost Centre Head', roles: ['COST_CENTRE_OWNER', 'HEAD_OF_DEPARTMENT'], status: 'HOD_COST_CENTRE_REVIEW' },
      finance,
      financeDirector,
      finalApproval,
    ],
    active: true,
    effectiveFrom: '2026-01-01',
    note: 'SRS §14.5 — Cost Centre Staff → CC Head → Finance Accountant → Finance Director → CEO / Project Director → electronic payment',
  },
];

export function workflowForCategory(defs: WorkflowDefinition[], category: TravelCategory | 'EXTERNAL_PAYMENT'): WorkflowDefinition | undefined {
  return defs
    .filter((d) => d.category === category && d.active)
    .sort((a, b) => b.version - a.version)[0];
}

export function statusForStage(stages: WorkflowStage[], index: number): RequestStatus {
  if (index < 0) return 'SUBMITTED';
  if (index >= stages.length) return 'APPROVED';
  return stages[index]!.status;
}

export function userCanActOnStage(roles: readonly Role[], stage: WorkflowStage | undefined): boolean {
  if (!stage) return false;
  return stage.roles.some((r) => roles.includes(r));
}

/** Fields whose change after any approval is "material" and invalidates downstream approvals (SRS §10.4). */
export const MATERIAL_FIELDS = ['itinerary', 'travellers', 'category', 'costing', 'transport', 'accommodation', 'allowances', 'international', 'personal'] as const;
