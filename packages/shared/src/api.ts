/**
 * REST API contract (base path /api/v1). Both the Express API and the web client import these DTOs.
 * Every response is JSON. Errors: { error: { code: string; message: string; details?: unknown } }.
 * Auth: Authorization: Bearer <Firebase ID token>.
 */
import type { Role } from './roles';
import type { RequestStatus } from './status';
import type {
  AdvanceRecord,
  ApprovalDecision,
  Arrangement,
  Attachment,
  BankingMilestone,
  BookingMode,
  CostLine,
  CostCentre,
  Department,
  ExpenseLine,
  ExternalParticipant,
  ExternalPaymentRequest,
  Liquidation,
  Location,
  MileageClaim,
  Notification,
  PolicyConfig,
  Project,
  Rate,
  RateKey,
  Trip,
  TravelRequest,
  TravellerRef,
  TripReport,
  Unit,
  UserProfile,
  Vehicle,
  VehicleBooking,
  Vendor,
  WorkflowDefinition,
  WorkflowStage,
  WizardStep,
  AuditEvent,
  TravelCategory,
  TransportMode,
  Costing,
  EligibilityResult,
} from './types';
import type { LiquidationReadiness } from './policy';

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface Paged<T> {
  items: T[];
  nextCursor?: string | null;
  total?: number;
}

// ----- /me -----
export interface MeResponse {
  user: UserProfile;
  department?: Department;
  unit?: Unit;
  dutyStation?: Location;
  supervisor?: Pick<UserProfile, 'id' | 'displayName' | 'initials'>;
  capabilities: {
    canApprove: boolean;
    canSeeFinance: boolean;
    canSeeFleetAdmin: boolean;
    canAdmin: boolean;
    canProcure: boolean;
  };
  unreadNotifications: number;
}

// ----- /dashboard -----
export interface DashboardResponse {
  greetingName: string;
  today: string;
  dutyStationName: string;
  unitName: string;
  blockers: { type: 'OVERDUE_LIQUIDATION'; requestId: string; liquidationId: string; title: string; dueDate: string; daysOverdue: number }[];
  currentTrip: (TravelRequest & { trip: Trip | null }) | null;
  yearStats: { trips: number; nights: number; spend: number };
  myRequests: { id: string; ref: string; title: string; status: RequestStatus; statusLabel: string; kind: 'TRV' | 'MIL' | 'VEH' | 'LIQ' | 'EXT'; href: string }[];
  upcomingTrips: TravelRequest[];
  approvalsPending: number;
  liquidationsDue: { id: string; requestId: string; title: string; dueDate: string; daysRemaining: number }[];
  vehicleBookings: VehicleBooking[];
}

export interface FinanceDashboardResponse {
  awaitingAdvance: number;
  paymentQueue: number;
  outstandingAdvances: { count: number; value: number };
  liquidationsPending: number;
  reimbursementsPayable: number;
  refundsDue: number;
  externalPayments: number;
}

// ----- /travel-requests -----
export interface CreateTravelRequestBody {
  category?: TravelCategory;
}
/** Partial patch; server recomputes nights/eligibility/costing and bumps version on material changes. */
export interface UpdateTravelRequestBody {
  category?: TravelCategory | null;
  activityTitle?: string;
  purpose?: string;
  activityDescription?: string;
  expectedOutcomes?: string;
  workPlanRef?: string;
  justification?: string;
  departmentId?: string;
  unitId?: string;
  projectId?: string;
  costCentreId?: string;
  supervisorId?: string;
  travellers?: TravellerRef[];
  isGroup?: boolean;
  itinerary?: Partial<TravelRequest['itinerary']>;
  transport?: Partial<TravelRequest['transport']>;
  accommodation?: Partial<TravelRequest['accommodation']>;
  allowances?: Partial<TravelRequest['allowances']>;
  costingLines?: CostLine[];
  international?: TravelRequest['international'];
  personal?: TravelRequest['personal'];
  /** Supporting documents uploaded via POST /files (wizard step 9); replaces the list. */
  attachments?: Attachment[];
  wizardStep?: WizardStep;
  completeStep?: WizardStep;
}
export interface TravelRequestListQuery {
  scope?: 'mine' | 'team' | 'all';
  status?: RequestStatus | RequestStatus[];
  limit?: number;
  cursor?: string;
}
export interface TravelRequestDetail {
  request: TravelRequest;
  trip: Trip | null;
  liquidation: Liquidation | null;
  vehicleBooking: VehicleBooking | null;
  people: Record<string, Pick<UserProfile, 'id' | 'displayName' | 'initials' | 'avatarTone'>>;
  project?: Project;
  costCentre?: CostCentre;
  canEdit: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  /** Draft can be permanently deleted (requester or admin, DRAFT only). */
  canDelete: boolean;
  approvalChain: ApprovalChainItem[];
  audit?: AuditEvent[];
}
export interface ApprovalChainItem {
  key: string;
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'invalidated' | 'rejected';
  actorName?: string;
  at?: string;
  comment?: string;
}
export interface EligibilityPreviewBody {
  originId?: string;
  destinationId?: string;
  distanceKm?: number;
  departAt?: string;
  returnAt?: string;
  category?: TravelCategory | null;
}
export interface EligibilityPreviewResponse {
  eligibility: EligibilityResult;
  distanceKm: number;
  nights: number;
}

// ----- /approvals -----
export interface ApprovalQueueItem {
  kind: 'TRV' | 'EXT' | 'MIL' | 'VEH' | 'LIQ';
  id: string;
  ref: string;
  shortRef: string;
  title: string;
  requesterName: string;
  requesterInitials: string;
  avatarTone: UserProfile['avatarTone'];
  status: string;
  statusLabel: string;
  tags: { label: string; tone: 'neutral' | 'pending' | 'info' | 'blocked' | 'approved' | 'active' }[];
  submittedAt: string;
  amount?: number;
  href: string;
}
export interface ApprovalQueueResponse {
  pending: ApprovalQueueItem[];
  returned: ApprovalQueueItem[];
  done: ApprovalQueueItem[];
  counts: { pending: number; returned: number; done: number };
}
export interface ApprovalDetailResponse extends TravelRequestDetail {
  stage: WorkflowStage | null;
  checklist: { key: string; label: string }[] | null;
  checklistState: Record<string, boolean>;
  canAct: boolean;
  actingRole: Role | null;
}
export interface ApprovalDecisionBody {
  decision: ApprovalDecision;
  comment?: string;
  checklist?: Record<string, boolean>;
}

// ----- /trips -----
export interface TripDetailResponse extends TravelRequestDetail {
  trip: Trip;
}
export interface UpsertArrangementBody extends Partial<Omit<Arrangement, 'id'>> {
  type: Arrangement['type'];
  title: string;
}
export interface AddDocumentBody {
  attachmentId: string;
  kind?: Attachment['kind'];
}

// ----- /files -----
export interface UploadResponse {
  attachment: Attachment;
}

// ----- /liquidations -----
export interface LiquidationDetailResponse {
  liquidation: Liquidation;
  request: TravelRequest;
  readiness: LiquidationReadiness;
  daysRemaining: number;
  canSubmit: boolean;
  canReview: boolean;
  canApproveTripReport: boolean;
}
export interface UpdateLiquidationBody {
  lines?: ExpenseLine[];
  tripReport?: Partial<TripReport>;
  refundReference?: string;
}
export interface AddExpenseLineBody {
  category: ExpenseLine['category'];
  label: string;
  budgeted?: number;
  actual: number;
  receiptRequired?: boolean;
}
export interface AttachReceiptBody {
  attachmentId: string;
}
export interface LiquidationReviewBody {
  decision: 'APPROVED' | 'RETURNED';
  comment?: string;
  settlementReference?: string;
}

// ----- /fleet -----
export interface FleetCalendarQuery {
  from: string; // ISO date
  to: string;
}
export interface FleetCalendarResponse {
  from: string;
  to: string;
  vehicles: Vehicle[];
  bookings: VehicleBooking[];
}
export interface CreateVehicleBookingBody {
  vehicleId?: string;
  requestId?: string;
  purpose: string;
  destination: string;
  passengers: number;
  pickupAt: string;
  returnAt: string;
  mode: BookingMode;
}
export interface AssignVehicleBody {
  vehicleId: string;
  driverId?: string;
}
export type SelfDriveStepBody =
  | { step: 'licence'; expiry: string }
  | { step: 'pre_inspection'; ok: boolean; notes?: string }
  | { step: 'keys_out'; odometerOut: number; fuelLevel: string }
  | { step: 'return_inspection'; odometerIn: number; fuelLevel: string; faults?: string }
  | { step: 'key_return'; party: 'TRAVELLER' | 'OFFICE' };
export interface BookingConflictError {
  code: 'BOOKING_CONFLICT';
  conflicts: Pick<VehicleBooking, 'id' | 'pickupAt' | 'returnAt' | 'requesterName' | 'destination'>[];
}

// ----- /mileage-claims -----
export interface CreateMileageClaimBody {
  purpose: string;
  date: string;
  fromName: string;
  toName: string;
  distanceKm: number;
  province?: string;
  withinProvince?: boolean;
  preApprovalRef?: string;
}
export interface MileageDetailResponse {
  claim: MileageClaim;
  policy: { items: { key: string; label: string; ok: boolean }[]; ok: boolean };
  canSubmit: boolean;
  canDecide: boolean;
}

// ----- /finance -----
export interface AdvanceQueueRow {
  requestId: string;
  ref: string;
  shortRef: string;
  travellerName: string;
  destination: string;
  projectOrFunding: string;
  approvedAmount: number;
  advance: AdvanceRecord;
  departAt: string;
  status: RequestStatus;
  isApproved: boolean;
  blockingRequestId?: string | null;
}
export interface AdvanceQueueResponse {
  rows: AdvanceQueueRow[];
  summary: { readyCount: number; readyValue: number; flagged: number; blocked: number };
  advancePercentage: number;
}
export interface MilestoneBody {
  milestone: BankingMilestone;
  reference?: string;
}
export interface ExceptionBody {
  reason: string;
}

// ----- /external-payments -----
export interface CreateExternalPaymentBody {
  activityTitle: string;
  activityLocationName: string;
  startDate: string;
  endDate: string;
  endsBeforeNoon?: boolean;
  costCentreId: string;
}
export interface UpsertExternalParticipantBody {
  participantId?: string;
  fullName: string;
  organisation: string;
  dutyStationName: string;
  isHostSite?: boolean;
  ihmProvidesTransport?: boolean;
  payout?: ExternalParticipant['payout'];
}
export interface ExternalPaymentDetailResponse {
  payment: ExternalPaymentRequest;
  payoutsMissing: number;
  canAct: boolean;
  canEdit: boolean;
  policyRules: { label: string; ok: boolean }[];
  approvalChain: ApprovalChainItem[];
}

// ----- /admin -----
export interface CreateRateBody {
  key: RateKey;
  value: number;
  unit: Rate['unit'];
  effectiveFrom: string;
  effectiveTo?: string | null;
  note?: string;
}
export interface AdminOverview {
  rates: Rate[];
  workflows: WorkflowDefinition[];
  policy: PolicyConfig;
  vendors: Vendor[];
  users: UserProfile[];
  masterData: { departments: Department[]; units: Unit[]; projects: Project[]; costCentres: CostCentre[]; locations: Location[]; vehicles: Vehicle[] };
}
export interface CreateWorkflowVersionBody {
  category: WorkflowDefinition['category'];
  name?: string;
  stages: WorkflowStage[];
  note?: string;
}
export interface CreateUserBody {
  email: string;
  displayName: string;
  roles: Role[];
  title?: string;
  departmentId?: string;
  unitId?: string;
  supervisorId?: string;
  dutyStationId?: string;
  costCentreIds?: string[];
  province?: string;
  phone?: string;
  /** Email the person a set-password link (Firebase password reset flow). Default true. */
  sendInvite?: boolean;
}
export interface CreateUserResponse {
  user: UserProfile;
  /** True when the set-password email was sent. */
  inviteSent: boolean;
  /** Set-password link the admin can share manually if email does not arrive. */
  setupLink?: string;
  /** True when the Auth account already existed and only the profile was (re)created. */
  existedInAuth: boolean;
}
export interface UpdateUserBody {
  roles?: Role[];
  departmentId?: string;
  unitId?: string;
  costCentreIds?: string[];
  supervisorId?: string;
  dutyStationId?: string;
  active?: boolean;
}

// ----- /notifications, /search -----
export interface NotificationsResponse {
  items: Notification[];
  unread: number;
}
export interface SearchResponse {
  results: { kind: string; id: string; title: string; subtitle: string; href: string }[];
}

export type { Costing, TransportMode };
