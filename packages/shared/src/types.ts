import type { Role } from './roles';
import type { RequestStatus } from './status';

export type ISODateTime = string; // 2026-09-08T06:30:00.000Z
export type ISODate = string; // 2026-09-08
export type Money = number; // ZMW, 2dp

export type TravelCategory = 'LOCAL' | 'FIELD' | 'INTERNATIONAL';
export const TRAVEL_CATEGORY_LABELS: Record<TravelCategory, string> = {
  LOCAL: 'Local travel',
  FIELD: 'Field travel',
  INTERNATIONAL: 'International',
};

export type TransportMode = 'IHM_VEHICLE' | 'RENTAL' | 'PRIVATE_VEHICLE' | 'AIR' | 'PUBLIC' | 'OTHER';
/** SOP transportation order of precedence (index = priority; lower is preferred). */
export const TRANSPORT_PRECEDENCE: TransportMode[] = ['IHM_VEHICLE', 'PUBLIC', 'RENTAL', 'AIR', 'PRIVATE_VEHICLE', 'OTHER'];
export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  IHM_VEHICLE: 'IHM vehicle',
  RENTAL: 'Rental vehicle',
  PRIVATE_VEHICLE: 'Private vehicle (mileage)',
  AIR: 'Air travel',
  PUBLIC: 'Public transport / shuttle',
  OTHER: 'Other approved transport',
};

// ---------- Master data ----------

export interface Department {
  id: string;
  name: string;
  hodId?: string;
}
export interface Unit {
  id: string;
  name: string;
  departmentId: string;
  supervisorId?: string;
}
export interface Project {
  id: string; // e.g. GHSC-Z
  name: string;
  managerId?: string;
  directorId?: string;
  active: boolean;
}
export interface CostCentre {
  id: string; // e.g. CC-114
  name: string;
  ownerId?: string;
  projectId?: string;
  fundingSource?: 'PROJECT' | 'OVERHEAD';
  budget?: Money;
}
export interface Location {
  id: string;
  name: string; // Ndola — Copperbelt PHO
  town: string;
  province: string;
  country: string; // ZM
  lat: number;
  lng: number;
  isDutyStation: boolean;
}
export interface Vendor {
  id: string;
  name: string;
  category: 'AIRLINE' | 'HOTEL' | 'CAR_RENTAL' | 'TRAVEL_AGENT' | 'SHUTTLE' | 'CATERING' | 'VENUE' | 'OTHER';
  contact?: string;
  locations?: string[];
  contractValidTo?: ISODate;
  active: boolean;
  approvedRate?: string;
}

export interface UserProfile {
  id: string; // Firebase uid
  email: string;
  displayName: string;
  initials: string;
  avatarTone: 'deep' | 'secondary' | 'tertiary' | 'warning';
  roles: Role[];
  title?: string;
  departmentId?: string;
  unitId?: string;
  projectIds?: string[];
  costCentreIds?: string[];
  dutyStationId?: string;
  province?: string;
  supervisorId?: string;
  phone?: string;
  driverLicenceExpiry?: ISODate;
  bank?: { bankName: string; accountMasked: string };
  mobileMoney?: { provider: 'AIRTEL' | 'MTN' | 'ZAMTEL'; numberMasked: string };
  active: boolean;
  createdAt: ISODateTime;
}

// ---------- Travel request ----------

export interface ItineraryLeg {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  departAt: ISODateTime;
  arriveAt?: ISODateTime;
  distanceKm: number;
}

export interface Itinerary {
  originId?: string;
  originName?: string;
  destinationId?: string;
  destinationName?: string;
  stops: { id?: string; name: string }[];
  departAt?: ISODateTime;
  returnAt?: ISODateTime;
  nights: number;
  /** Estimated one-way distance from duty station to farthest destination (km). */
  distanceKm: number;
  distanceOverrideKm?: number | null;
}

export interface TravellerRef {
  userId?: string;
  externalId?: string;
  name: string;
  initials: string;
  departmentId?: string;
  costCentreId?: string;
  isLead?: boolean;
}

export type CostCategory =
  | 'PER_DIEM'
  | 'ACCOMMODATION'
  | 'FLIGHTS'
  | 'GROUND_TRANSPORT'
  | 'CAR_RENTAL'
  | 'FUEL'
  | 'MILEAGE'
  | 'VISA'
  | 'BAGGAGE'
  | 'PARKING_TOLLS'
  | 'STATIONERY'
  | 'OTHER';
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  PER_DIEM: 'Per diem',
  ACCOMMODATION: 'Accommodation',
  FLIGHTS: 'Flights',
  GROUND_TRANSPORT: 'Ground transport',
  CAR_RENTAL: 'Car rental',
  FUEL: 'Fuel',
  MILEAGE: 'Mileage reimbursement',
  VISA: 'Visa costs',
  BAGGAGE: 'Additional baggage',
  PARKING_TOLLS: 'Parking & toll fees',
  STATIONERY: 'Workshop stationery',
  OTHER: 'Other pre-approved expense',
};

export interface CostLine {
  id: string;
  category: CostCategory;
  label: string;
  quantity: number;
  unitCost: Money;
  amount: Money;
  /** Employee-paid (e.g. personal upgrade difference) */
  employeeContribution?: Money;
  /** Paid directly by IHM / procurement (not advanced to traveller) */
  paidDirectly?: boolean;
  receiptRequired: boolean;
  note?: string;
}

export interface Costing {
  lines: CostLine[];
  total: Money;
  advanceEligibleTotal: Money;
  employeeContribution: Money;
  paidDirectly: Money;
  organisationCost: Money;
}

export interface EligibilityResult {
  distanceKm: number;
  distanceThresholdKm: number;
  distanceOk: boolean;
  hoursAway: number;
  hoursThreshold: number;
  hoursOk: boolean;
  nights: number;
  perDiemEligible: boolean;
  /** Working days between now (or final approval) and departure. */
  leadTimeWorkingDays: number;
  leadTimeRequiredWorkingDays: number;
  leadTimeOk: boolean;
  internationalNoticeOk: boolean | null;
  internationalNoticeDays: number | null;
  reasons: string[];
}

export type ApprovalDecision = 'APPROVED' | 'REJECTED' | 'RETURNED' | 'CLARIFICATION_REQUESTED';

export interface ApprovalRecord {
  id: string;
  stageKey: string;
  stageLabel: string;
  role: Role;
  actorId: string;
  actorName: string;
  delegatedFromId?: string;
  decision: ApprovalDecision;
  comment?: string;
  checklist?: Record<string, boolean>;
  requestVersion: number;
  at: ISODateTime;
  /** Set true when a material edit after this approval invalidated it. */
  invalidated?: boolean;
}

export interface WorkflowStage {
  key: string; // supervisor, hod_cc, finance, finance_director, final, procurement
  label: string;
  roles: Role[];
  status: RequestStatus;
  /** Show the SOP §9.2 supervisor checklist and gate Approve on it. */
  checklist?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  category: TravelCategory | 'EXTERNAL_PAYMENT' | 'MILEAGE' | 'VEHICLE_BOOKING';
  name: string;
  version: number;
  stages: WorkflowStage[];
  active: boolean;
  effectiveFrom: ISODate;
  createdAt: ISODateTime;
  createdBy?: string;
  note?: string;
}

export type BankingMilestone = 'PREPARED' | 'SUBMITTED' | 'AUTH_1' | 'AUTH_2' | 'RELEASED';
export const BANKING_MILESTONES: BankingMilestone[] = ['PREPARED', 'SUBMITTED', 'AUTH_1', 'AUTH_2', 'RELEASED'];
export const BANKING_MILESTONE_LABELS: Record<BankingMilestone, string> = {
  PREPARED: 'Prepared',
  SUBMITTED: 'Submitted',
  AUTH_1: 'Auth 1',
  AUTH_2: 'Auth 2',
  RELEASED: 'Released',
};

export interface MilestoneRecord {
  by: string;
  byName: string;
  at: ISODateTime;
  reference?: string;
}

export type AdvancePolicyStatus = 'CLEAR' | 'LEAD_TIME_SHORT' | 'BLOCKED' | 'AWAITING_APPROVAL' | 'NOT_REQUESTED';

export interface AdvanceRecord {
  requested: boolean;
  percentage: number;
  approvedAmount: Money;
  amount: Money;
  policyStatus: AdvancePolicyStatus;
  leadTimeWorkingDays: number | null;
  leadTimeRequiredWorkingDays: number;
  blockedByRequestId?: string | null;
  blockedReason?: string | null;
  exception?: { requestedBy: string; reason: string; approvedBy?: string; approvedAt?: ISODateTime; at: ISODateTime } | null;
  milestones: Partial<Record<BankingMilestone, MilestoneRecord>>;
  paidAt?: ISODateTime | null;
}

export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  storagePath: string;
  url?: string;
  kind:
    | 'QUOTATION'
    | 'BOARDING_PASS'
    | 'RECEIPT'
    | 'MAPS_ROUTE'
    | 'TICKET'
    | 'BOOKING_CONFIRMATION'
    | 'RENTAL_AGREEMENT'
    | 'APPROVAL_EVIDENCE'
    | 'VISA'
    | 'ATTENDANCE_REGISTER'
    | 'ACQUITTAL'
    | 'TRIP_REPORT'
    | 'AUTHORISATION'
    | 'PAYMENT_PROOF'
    | 'PHOTO'
    | 'AGENDA'
    | 'OTHER';
  uploadedBy: string;
  uploadedAt: ISODateTime;
}

export const WIZARD_STEPS = [
  'travel_type',
  'trip_details',
  'itinerary',
  'travellers',
  'transport',
  'accommodation',
  'allowances',
  'costing',
  'attachments',
  'review',
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  travel_type: 'Travel type',
  trip_details: 'Trip details',
  itinerary: 'Itinerary',
  travellers: 'Travellers',
  transport: 'Transport',
  accommodation: 'Accommodation',
  allowances: 'Allowances',
  costing: 'Costing',
  attachments: 'Attachments',
  review: 'Review & submit',
};

export interface InternationalDetails {
  countries: string[];
  cities: string[];
  passportValid: boolean;
  visaRequired: boolean;
  visaStatus?: 'NOT_REQUIRED' | 'TO_APPLY' | 'APPLIED' | 'GRANTED';
  airports?: string;
  transit?: string;
  insurance?: boolean;
  currency?: string;
  emergencyContact?: string;
  cabinClass: 'ECONOMY' | 'PREMIUM' | 'BUSINESS' | 'FIRST';
  upgradeDifference?: Money;
}

export interface PersonalTravelDetails {
  combined: boolean;
  personalDates?: { from: ISODate; to: ISODate };
  personalDestinations?: string;
  directOfficialQuote?: Money;
  combinedQuote?: Money;
  personalContribution?: Money;
  contributionSettled?: boolean;
  leaveWeekdays?: number;
}

export interface TravelRequest {
  id: string; // TRV-2026-0412
  seq: number;
  year: number;
  requesterId: string;
  requesterName: string;
  travellers: TravellerRef[];
  isGroup: boolean;
  category: TravelCategory | null;
  activityTitle: string;
  purpose: string;
  activityDescription: string;
  expectedOutcomes: string;
  workPlanRef: string;
  justification: string;
  departmentId?: string;
  unitId?: string;
  projectId?: string;
  costCentreId?: string;
  supervisorId?: string;
  dutyStationId?: string;
  itinerary: Itinerary;
  transport: {
    mode: TransportMode | null;
    justification?: string;
    driverRequired?: boolean;
    vehicleBookingId?: string;
    preferredVendorId?: string;
  };
  accommodation: {
    required: boolean;
    nights: number;
    preferredVendorId?: string;
    ratePerNight: Money;
    fullBoardProvided: boolean;
  };
  allowances: {
    perDiemNights: number;
    perDiemRate: Money;
    perDiemRateId?: string;
    overheadFunded: boolean;
    perDiemWaived: boolean;
    waiverReason?: string;
  };
  costing: Costing;
  international?: InternationalDetails;
  personal?: PersonalTravelDetails;
  attachments: Attachment[];
  eligibility: EligibilityResult | null;
  status: RequestStatus;
  workflow: { id: string; version: number; stages: WorkflowStage[] } | null;
  currentStageIndex: number;
  approvals: ApprovalRecord[];
  version: number;
  approvedVersion?: number;
  advance: AdvanceRecord | null;
  wizard: { completedSteps: WizardStep[]; lastStep: WizardStep; savedAt: ISODateTime };
  submittedAt?: ISODateTime;
  approvedAt?: ISODateTime;
  closedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Denormalised for array-contains queries: requester + every traveller with a userId. */
  travellerIds?: string[];
  /** Denormalised: every user who recorded a decision on this request. */
  approverIds?: string[];
  /** Stage to resume at after a clarification request is answered (SRS §10.4). */
  resumeStageIndex?: number | null;
}

// ---------- Trip workspace ----------

export type ArrangementType = 'FLIGHT' | 'HOTEL' | 'SHUTTLE' | 'IHM_VEHICLE' | 'RENTAL' | 'OTHER';
export interface Arrangement {
  id: string;
  type: ArrangementType;
  title: string; // Proflight PFZ 312 · LUN → NLA · 08 Sep 07:40
  detail: string; // Booked · Ref QX4T8M · Economy · Voyagers Travel
  vendorId?: string;
  vendorName?: string;
  bookingRef?: string;
  amount?: Money;
  currency?: string;
  status: 'REQUESTED' | 'QUOTED' | 'CONFIRMED' | 'CANCELLED';
  officerId?: string;
  bookedAt?: ISODateTime;
  cancellationTerms?: string;
}

export interface Trip {
  id: string; // same as request id
  requestId: string;
  title: string;
  travellerNames: string[];
  arrangements: Arrangement[];
  documents: Attachment[];
  financials: {
    approvedBudget: Money;
    advancePercentage: number;
    advanceAmount: Money;
    employeeContribution: Money;
    expensesLogged: Money;
    liquidationDueDate: ISODate | null;
  };
  liquidationId?: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------- Liquidation ----------

export type LiquidationStatus = 'OPEN' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' | 'CLOSED';

export interface ExpenseLine {
  id: string;
  category: CostCategory;
  label: string;
  budgeted: Money;
  actual: Money;
  receiptRequired: boolean;
  receipts: Attachment[];
  note?: string;
}

export interface TripReport {
  objective: string;
  activities: string;
  locations: string;
  outcomes: string;
  challenges: string;
  followUps: string;
  recommendations: string;
  submittedAt?: ISODateTime;
  supervisorId?: string;
  supervisorApprovedAt?: ISODateTime;
  supervisorComment?: string;
}

export interface Reconciliation {
  advanceReceived: Money;
  totalActual: Money;
  settlement: Money; // actual - advance
  direction: 'DUE_TO_EMPLOYEE' | 'REFUND_TO_IHM' | 'BALANCED';
}

export interface Liquidation {
  id: string; // LIQ-2026-0012
  requestId: string;
  tripTitle: string;
  travellerId: string;
  travellerName: string;
  returnDate: ISODate;
  dueDate: ISODate;
  status: LiquidationStatus;
  lines: ExpenseLine[];
  boardingPassesRequired: boolean;
  boardingPasses: Attachment[];
  tripReport: TripReport;
  reconciliation: Reconciliation;
  refundReference?: string;
  reviewerComment?: string;
  submittedAt?: ISODateTime;
  reviewedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Reminder keys already sent by the daily job (e.g. 'before_2', 'due', 'overdue_1'). */
  remindersSent?: string[];
}

// ---------- Fleet ----------

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year?: number;
  registration: string; // BAD 4721
  officeId?: string;
  projectId?: string;
  odometerKm: number;
  status: 'AVAILABLE' | 'IN_SERVICE' | 'RETIRED';
  serviceNote?: string;
  serviceDueBack?: ISODate;
  assignedDriverId?: string;
  assignedDriverName?: string;
}

export type BookingMode = 'ASSIGNED_DRIVER' | 'SELF_DRIVE';
export type BookingStatus = 'REQUESTED' | 'CONFIRMED' | 'IN_PROGRESS' | 'RETURNED' | 'CLOSED' | 'CANCELLED' | 'REJECTED';

export interface SelfDriveSteps {
  licenceValid?: { ok: boolean; expiry: ISODate; at: ISODateTime };
  preDepartureInspection?: { ok: boolean; notes?: string; at: ISODateTime; by: string };
  keysAccepted?: { odometerOut: number; fuelLevel: string; at: ISODateTime; by: string };
  returnInspection?: { odometerIn: number; fuelLevel: string; faults?: string; at: ISODateTime; by: string };
  keyReturn?: { travellerSignedAt?: ISODateTime; officeSignedAt?: ISODateTime; officeSignedBy?: string };
}

export interface VehicleBooking {
  id: string; // VEH-2026-0143
  vehicleId?: string;
  vehicleLabel?: string;
  requesterId: string;
  requesterName: string;
  requestId?: string;
  purpose: string;
  destination: string;
  passengers: number;
  pickupAt: ISODateTime;
  returnAt: ISODateTime;
  mode: BookingMode;
  driverId?: string;
  driverName?: string;
  status: BookingStatus;
  selfDrive: SelfDriveSteps;
  photos: Attachment[];
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------- Mileage ----------

export type MileageStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';
export interface MileageClaim {
  id: string; // MIL-2026-0094
  claimantId: string;
  claimantName: string;
  purpose: string;
  date: ISODate;
  fromName: string;
  toName: string;
  province: string;
  withinProvince: boolean;
  distanceKm: number;
  rateId?: string;
  ratePerKm: Money;
  rateEffectiveFrom?: ISODate;
  amount: Money;
  preApprovalRef?: string;
  preApprovalBy?: string;
  preApprovalAttached: boolean;
  routeEvidence: Attachment[];
  businessEvidence: Attachment[];
  status: MileageStatus;
  reviewerComment?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------- External-party payments ----------

export type PayoutMethod = { type: 'MOBILE_MONEY'; provider: 'AIRTEL' | 'MTN' | 'ZAMTEL'; numberMasked: string } | { type: 'BANK'; bankName: string; accountMasked: string } | null;

export interface ExternalParticipant {
  id: string;
  fullName: string;
  organisation: string;
  dutyStationName: string;
  district?: string;
  phone?: string;
  payout: PayoutMethod;
  idReference?: string;
}

export interface ExternalParticipantLine {
  participantId: string;
  fullName: string;
  organisation: string;
  dutyStationName: string;
  isHostSite: boolean; // activity held at participant's duty station
  ihmProvidesTransport: boolean;
  dsaDays: number;
  dsa: Money;
  lunch: Money;
  lunchApplicable: boolean;
  transport: Money;
  payout: PayoutMethod;
  total: Money;
}

export type ExternalPaymentStatus = 'DRAFT' | 'SUBMITTED' | 'CC_HEAD_REVIEW' | 'FINANCE_REVIEW' | 'FINANCE_DIRECTOR_REVIEW' | 'FINAL_APPROVAL' | 'APPROVED' | 'PAID' | 'ACQUITTED' | 'RETURNED' | 'REJECTED';

export const EXTERNAL_STATUS_LABELS: Record<ExternalPaymentStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  CC_HEAD_REVIEW: 'Cost Centre Head review',
  FINANCE_REVIEW: 'Finance review',
  FINANCE_DIRECTOR_REVIEW: 'Finance Director review',
  FINAL_APPROVAL: 'Final approval',
  APPROVED: 'Approved',
  PAID: 'Paid',
  ACQUITTED: 'Acquitted',
  RETURNED: 'Returned for correction',
  REJECTED: 'Rejected',
};

export interface ExternalPaymentRequest {
  id: string; // EXT-2026-0057
  activityTitle: string;
  activityLocation: string;
  activityLocationName: string;
  startDate: ISODate;
  endDate: ISODate;
  endsBeforeNoon: boolean;
  requesterId: string;
  requesterName: string;
  costCentreId: string;
  participants: ExternalParticipantLine[];
  totals: { dsa: Money; lunch: Money; transport: Money; total: Money };
  rates: { dsaRateId?: string; dsaPerDay: Money; lunchPerDay: Money; transportFlat: Money; dsaEffectiveFrom?: ISODate };
  status: ExternalPaymentStatus;
  workflow: { id: string; version: number; stages: WorkflowStage[] } | null;
  currentStageIndex: number;
  approvals: ApprovalRecord[];
  acquittal: { attendanceRegister?: Attachment; acquittalSheets: Attachment[]; bankEvidence?: Attachment };
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Denormalised: every user who recorded a decision on this payment. */
  approverIds?: string[];
  paidAt?: ISODateTime;
  paymentReference?: string;
}

// ---------- Policy configuration ----------

export type RateKey =
  | 'ADVANCE_PERCENTAGE'
  | 'MILEAGE_RATE'
  | 'EXTERNAL_TRANSPORT_ALLOWANCE'
  | 'EXTERNAL_DSA'
  | 'EXTERNAL_LUNCH'
  | 'PER_DIEM_DOMESTIC'
  | 'PER_DIEM_INTERNATIONAL'
  | 'STATIONERY_CAP';

export const RATE_KEY_LABELS: Record<RateKey, string> = {
  ADVANCE_PERCENTAGE: 'Travel advance percentage',
  MILEAGE_RATE: 'Mileage rate (POV)',
  EXTERNAL_TRANSPORT_ALLOWANCE: 'External transport allowance',
  EXTERNAL_DSA: 'External DSA — GRZ/PSMD band A',
  EXTERNAL_LUNCH: 'External lunch allowance',
  PER_DIEM_DOMESTIC: 'Per diem — domestic overnight',
  PER_DIEM_INTERNATIONAL: 'Per diem — international',
  STATIONERY_CAP: 'Workshop stationery cap',
};

export interface Rate {
  id: string;
  key: RateKey;
  label: string;
  value: number;
  unit: 'PERCENT' | 'ZMW_PER_KM' | 'ZMW_FLAT' | 'ZMW_PER_DAY' | 'ZMW_PER_NIGHT' | 'ZMW_CAP' | 'USD_PER_NIGHT';
  effectiveFrom: ISODate;
  effectiveTo?: ISODate | null;
  note?: string;
  version: number;
  createdBy?: string;
  createdAt: ISODateTime;
}

export interface PolicyConfig {
  distanceThresholdKm: number; // 55
  hoursThreshold: number; // 12
  liquidationDeadlineDays: number; // 5
  advanceLeadTimeWorkingDays: number; // 5
  procurementLeadTimeWorkingDays: number; // 5
  internationalNoticeDays: number; // 14
  meetingNoticeWorkingDays: number; // 5
  eventNoticeWorkingDays: number; // 10
  lateInternationalClaimDays: number; // 30
  toggles: {
    blockAdvanceOnOutstandingLiquidation: boolean;
    requireInternationalNotice: boolean;
    economyOnlyInternational: boolean;
    approvalDelegation: boolean;
    restrictRentalToApprovedVendors: boolean;
  };
  publicHolidaysMMDD: string[];
  updatedAt: ISODateTime;
  updatedBy?: string;
}

// ---------- Cross-cutting ----------

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  link?: string;
  kind: string;
  read: boolean;
  createdAt: ISODateTime;
}

export interface AuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorName: string;
  stage?: string;
  oldValue?: unknown;
  newValue?: unknown;
  at: ISODateTime;
}
