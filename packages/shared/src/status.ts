/** Status model per SRS §5.4 / Appendix B. */
export const REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'SUPERVISOR_REVIEW',
  'HOD_COST_CENTRE_REVIEW',
  'FINANCE_REVIEW',
  'FINANCE_DIRECTOR_REVIEW',
  'FINAL_APPROVAL',
  'PROCUREMENT_REVIEW',
  'APPROVED',
  'ADVANCE_PROCESSING',
  'TRAVEL_ARRANGEMENTS',
  'READY_FOR_TRAVEL',
  'IN_PROGRESS',
  'AWAITING_LIQUIDATION',
  'LIQUIDATION_REVIEW',
  'LIQUIDATED',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
  'RETURNED_FOR_CORRECTION',
  'CLARIFICATION_REQUESTED',
  'ON_HOLD',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Chip tone maps to the M3 status colour mapping in the handoff README. */
export type Tone = 'neutral' | 'pending' | 'approved' | 'active' | 'info' | 'blocked';

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Which of the 6 traveller-facing process stages this status belongs to (for timelines). */
  stage: ProcessStage | null;
}

export const PROCESS_STAGES = ['APPROVED', 'ADVANCE', 'ARRANGEMENTS', 'READY', 'IN_PROGRESS', 'LIQUIDATION'] as const;
export type ProcessStage = (typeof PROCESS_STAGES)[number];
export const PROCESS_STAGE_LABELS: Record<ProcessStage, string> = {
  APPROVED: 'Approved',
  ADVANCE: 'Advance',
  ARRANGEMENTS: 'Arrangements',
  READY: 'Ready',
  IN_PROGRESS: 'In progress',
  LIQUIDATION: 'Liquidation',
};

export const STATUS_META: Record<RequestStatus, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral', stage: null },
  SUBMITTED: { label: 'Submitted', tone: 'pending', stage: null },
  SUPERVISOR_REVIEW: { label: 'Supervisor review', tone: 'pending', stage: null },
  HOD_COST_CENTRE_REVIEW: { label: 'HOD / Cost centre review', tone: 'pending', stage: null },
  FINANCE_REVIEW: { label: 'Finance review', tone: 'pending', stage: null },
  FINANCE_DIRECTOR_REVIEW: { label: 'Finance Director review', tone: 'pending', stage: null },
  FINAL_APPROVAL: { label: 'Final approval', tone: 'pending', stage: null },
  PROCUREMENT_REVIEW: { label: 'Procurement review', tone: 'pending', stage: null },
  APPROVED: { label: 'Approved', tone: 'approved', stage: 'APPROVED' },
  ADVANCE_PROCESSING: { label: 'Advance processing', tone: 'pending', stage: 'ADVANCE' },
  TRAVEL_ARRANGEMENTS: { label: 'Travel arrangements', tone: 'pending', stage: 'ARRANGEMENTS' },
  READY_FOR_TRAVEL: { label: 'Ready for travel', tone: 'active', stage: 'READY' },
  IN_PROGRESS: { label: 'Trip in progress', tone: 'active', stage: 'IN_PROGRESS' },
  AWAITING_LIQUIDATION: { label: 'Awaiting liquidation', tone: 'pending', stage: 'LIQUIDATION' },
  LIQUIDATION_REVIEW: { label: 'Liquidation review', tone: 'pending', stage: 'LIQUIDATION' },
  LIQUIDATED: { label: 'Liquidated', tone: 'approved', stage: 'LIQUIDATION' },
  CLOSED: { label: 'Closed', tone: 'neutral', stage: 'LIQUIDATION' },
  REJECTED: { label: 'Rejected', tone: 'blocked', stage: null },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', stage: null },
  RETURNED_FOR_CORRECTION: { label: 'Returned for correction', tone: 'blocked', stage: null },
  CLARIFICATION_REQUESTED: { label: 'Clarification requested', tone: 'pending', stage: null },
  ON_HOLD: { label: 'On hold', tone: 'neutral', stage: null },
};

export const REVIEW_STATUSES: RequestStatus[] = [
  'SUBMITTED',
  'SUPERVISOR_REVIEW',
  'HOD_COST_CENTRE_REVIEW',
  'FINANCE_REVIEW',
  'FINANCE_DIRECTOR_REVIEW',
  'FINAL_APPROVAL',
  'PROCUREMENT_REVIEW',
  'CLARIFICATION_REQUESTED',
];

export const ACTIVE_TRIP_STATUSES: RequestStatus[] = [
  'APPROVED',
  'ADVANCE_PROCESSING',
  'TRAVEL_ARRANGEMENTS',
  'READY_FOR_TRAVEL',
  'IN_PROGRESS',
  'AWAITING_LIQUIDATION',
  'LIQUIDATION_REVIEW',
];

export const EDITABLE_STATUSES: RequestStatus[] = ['DRAFT', 'RETURNED_FOR_CORRECTION', 'CLARIFICATION_REQUESTED'];

export function isTerminal(status: RequestStatus): boolean {
  return status === 'CLOSED' || status === 'REJECTED' || status === 'CANCELLED';
}

/** Index of the process stage the trip is currently at; done = stages before it. */
export function processStageIndex(status: RequestStatus): number {
  const stage = STATUS_META[status].stage;
  if (!stage) return -1;
  return PROCESS_STAGES.indexOf(stage);
}

export function timelineFor(status: RequestStatus): { key: ProcessStage; label: string; state: 'done' | 'current' | 'upcoming' }[] {
  const idx = processStageIndex(status);
  const finished = status === 'LIQUIDATED' || status === 'CLOSED';
  return PROCESS_STAGES.map((key, i) => ({
    key,
    label: PROCESS_STAGE_LABELS[key],
    state: finished || i < idx ? 'done' : i === idx ? 'current' : 'upcoming',
  }));
}
