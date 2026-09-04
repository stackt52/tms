'use client';
/**
 * React Query hooks for every API resource. Screens should use these rather than calling `api()` directly
 * so cache keys stay consistent and mutations invalidate the right lists.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type {
  AdminOverview,
  AdvanceQueueResponse,
  ApprovalDecisionBody,
  ApprovalDetailResponse,
  ApprovalQueueResponse,
  CreateExternalPaymentBody,
  CreateMileageClaimBody,
  CreateRateBody,
  CreateUserBody,
  CreateUserResponse,
  CreateVehicleBookingBody,
  CreateWorkflowVersionBody,
  DashboardResponse,
  EligibilityPreviewBody,
  EligibilityPreviewResponse,
  ExceptionBody,
  ExternalPaymentDetailResponse,
  ExternalPaymentRequest,
  FinanceDashboardResponse,
  FleetCalendarResponse,
  Liquidation,
  LiquidationDetailResponse,
  LiquidationReviewBody,
  MileageClaim,
  MileageDetailResponse,
  MilestoneBody,
  Paged,
  PolicyConfig,
  Rate,
  SelfDriveStepBody,
  TravelRequest,
  TravelRequestDetail,
  Trip,
  TripDetailResponse,
  UpdateLiquidationBody,
  UpdateTravelRequestBody,
  UpdateUserBody,
  UpsertArrangementBody,
  UpsertExternalParticipantBody,
  UserProfile,
  Vehicle,
  VehicleBooking,
  Vendor,
  WorkflowDefinition,
  Department,
  Unit,
  Project,
  CostCentre,
  Location,
  AuditEvent,
} from '@tms/shared';
import { api } from './api';

type QO<T> = Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>;

export interface MasterData {
  departments: Department[];
  units: Unit[];
  projects: Project[];
  costCentres: CostCentre[];
  locations: Location[];
  vendors: Vendor[];
  users: Pick<UserProfile, 'id' | 'displayName' | 'initials' | 'avatarTone' | 'roles' | 'unitId' | 'departmentId'>[];
}

export const keys = {
  dashboard: ['dashboard'] as const,
  financeDashboard: ['dashboard', 'finance'] as const,
  masterData: ['master-data'] as const,
  requests: (q?: object) => ['travel-requests', q ?? {}] as const,
  request: (id: string) => ['travel-request', id] as const,
  requestAudit: (id: string) => ['travel-request', id, 'audit'] as const,
  approvals: ['approvals'] as const,
  approval: (id: string) => ['approval', id] as const,
  trips: (q?: object) => ['trips', q ?? {}] as const,
  trip: (id: string) => ['trip', id] as const,
  liquidations: (q?: object) => ['liquidations', q ?? {}] as const,
  liquidation: (id: string) => ['liquidation', id] as const,
  liquidationByRequest: (id: string) => ['liquidation', 'by-request', id] as const,
  vehicles: ['vehicles'] as const,
  calendar: (from: string, to: string) => ['fleet-calendar', from, to] as const,
  bookings: (q?: object) => ['vehicle-bookings', q ?? {}] as const,
  booking: (id: string) => ['vehicle-booking', id] as const,
  claims: (q?: object) => ['mileage-claims', q ?? {}] as const,
  claim: (id: string) => ['mileage-claim', id] as const,
  advances: ['finance', 'advances'] as const,
  financeLiquidations: ['finance', 'liquidations'] as const,
  externals: (q?: object) => ['external-payments', q ?? {}] as const,
  external: (id: string) => ['external-payment', id] as const,
  admin: ['admin', 'overview'] as const,
};

// ----- master data -----
export const useMasterData = (o?: QO<MasterData>) => useQuery({ queryKey: keys.masterData, queryFn: () => api<MasterData>('/master-data'), staleTime: 5 * 60_000, ...o });

// ----- dashboard -----
export const useDashboard = (o?: QO<DashboardResponse>) => useQuery({ queryKey: keys.dashboard, queryFn: () => api<DashboardResponse>('/dashboard'), ...o });
export const useFinanceDashboard = (o?: QO<FinanceDashboardResponse>) => useQuery({ queryKey: keys.financeDashboard, queryFn: () => api<FinanceDashboardResponse>('/dashboard/finance'), ...o });

// ----- travel requests -----
export const useTravelRequests = (q: { scope?: 'mine' | 'team' | 'all'; status?: string | string[]; limit?: number } = {}, o?: QO<Paged<TravelRequest>>) =>
  useQuery({ queryKey: keys.requests(q), queryFn: () => api<Paged<TravelRequest>>('/travel-requests', { query: q }), ...o });
export const useTravelRequest = (id: string | undefined, o?: QO<TravelRequestDetail>) =>
  useQuery({ queryKey: keys.request(id ?? ''), queryFn: () => api<TravelRequestDetail>(`/travel-requests/${id}`), enabled: !!id, ...o });
export const useRequestAudit = (id: string | undefined) => useQuery({ queryKey: keys.requestAudit(id ?? ''), queryFn: () => api<AuditEvent[]>(`/travel-requests/${id}/audit`), enabled: !!id });

export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: readonly (readonly unknown[])[]) => Promise.all(prefixes.map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateTravelRequest() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: { category?: TravelRequest['category'] } = {}) => api<TravelRequestDetail>('/travel-requests', { method: 'POST', body }),
    onSuccess: () => inv(['travel-requests'], keys.dashboard),
  });
}
export function useUpdateTravelRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTravelRequestBody) => api<TravelRequestDetail>(`/travel-requests/${id}`, { method: 'PATCH', body }),
    onSuccess: (data) => {
      qc.setQueryData(keys.request(id), data);
      qc.invalidateQueries({ queryKey: ['travel-requests'] });
    },
  });
}
export function useSubmitTravelRequest(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api<TravelRequestDetail>(`/travel-requests/${id}/submit`, { method: 'POST' }),
    onSuccess: () => inv(keys.request(id), ['travel-requests'], keys.dashboard, keys.approvals),
  });
}
export function useCancelTravelRequest(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api<TravelRequestDetail>(`/travel-requests/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => inv(keys.request(id), ['travel-requests'], keys.dashboard),
  });
}
export function useDeleteTravelRequest(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api<void>(`/travel-requests/${id}`, { method: 'DELETE' }),
    onSuccess: () => inv(['travel-requests'], keys.dashboard),
  });
}
export const useEligibilityPreview = (id: string) =>
  useMutation({ mutationFn: (body: EligibilityPreviewBody) => api<EligibilityPreviewResponse>(`/travel-requests/${id}/eligibility-preview`, { method: 'POST', body }) });

// ----- approvals -----
export const useApprovalQueue = (o?: QO<ApprovalQueueResponse>) => useQuery({ queryKey: keys.approvals, queryFn: () => api<ApprovalQueueResponse>('/approvals/queue'), ...o });
export const useApproval = (id: string | undefined, o?: QO<ApprovalDetailResponse>) =>
  useQuery({ queryKey: keys.approval(id ?? ''), queryFn: () => api<ApprovalDetailResponse>(`/approvals/${id}`), enabled: !!id, ...o });
export function useSaveChecklist(id: string) {
  return useMutation({ mutationFn: (checklist: Record<string, boolean>) => api(`/approvals/${id}/checklist`, { method: 'PUT', body: { checklist } }) });
}
export function useDecide(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: ApprovalDecisionBody) => api<ApprovalDetailResponse>(`/approvals/${id}/decide`, { method: 'POST', body }),
    onSuccess: () => inv(keys.approvals, keys.approval(id), keys.request(id), ['travel-requests'], keys.dashboard, keys.advances),
  });
}

// ----- trips -----
export const useTrips = (q: { scope?: string } = {}, o?: QO<Paged<TravelRequest & { trip: Trip | null }>>) =>
  useQuery({ queryKey: keys.trips(q), queryFn: () => api<Paged<TravelRequest & { trip: Trip | null }>>('/trips', { query: q }), ...o });
export const useTrip = (id: string | undefined, o?: QO<TripDetailResponse>) => useQuery({ queryKey: keys.trip(id ?? ''), queryFn: () => api<TripDetailResponse>(`/trips/${id}`), enabled: !!id, ...o });
export function useUpsertArrangement(tripId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: UpsertArrangementBody & { id?: string }) => (id ? api<TripDetailResponse>(`/trips/${tripId}/arrangements/${id}`, { method: 'PATCH', body }) : api<TripDetailResponse>(`/trips/${tripId}/arrangements`, { method: 'POST', body })),
    onSuccess: () => inv(keys.trip(tripId), keys.request(tripId), ['trips'], keys.dashboard),
  });
}
export function useAddTripDocument(tripId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: { attachmentId: string; kind?: string }) => api<TripDetailResponse>(`/trips/${tripId}/documents`, { method: 'POST', body }),
    onSuccess: () => inv(keys.trip(tripId), keys.request(tripId)),
  });
}
export function useRemoveTripDocument(tripId: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (docId: string) => api(`/trips/${tripId}/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => inv(keys.trip(tripId), keys.request(tripId)),
  });
}
export function useStartTrip(tripId: string) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => api(`/trips/${tripId}/start`, { method: 'POST' }), onSuccess: () => inv(keys.trip(tripId), keys.request(tripId), ['trips'], keys.dashboard) });
}

// ----- liquidations -----
export const useLiquidations = (q: { scope?: 'mine' | 'review' } = {}, o?: QO<Paged<Liquidation>>) =>
  useQuery({ queryKey: keys.liquidations(q), queryFn: () => api<Paged<Liquidation>>('/liquidations', { query: q }), ...o });
export const useLiquidation = (id: string | undefined, o?: QO<LiquidationDetailResponse>) =>
  useQuery({ queryKey: keys.liquidation(id ?? ''), queryFn: () => api<LiquidationDetailResponse>(`/liquidations/${id}`), enabled: !!id, ...o });
export const useLiquidationByRequest = (requestId: string | undefined, o?: QO<LiquidationDetailResponse>) =>
  useQuery({ queryKey: keys.liquidationByRequest(requestId ?? ''), queryFn: () => api<LiquidationDetailResponse>(`/liquidations/by-request/${requestId}`), enabled: !!requestId, ...o });

function useLiqMutation<TBody>(id: string, path: (b: TBody) => string, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api<LiquidationDetailResponse>(path(body), { method, body: method === 'DELETE' ? undefined : body }),
    onSuccess: (data) => {
      qc.setQueryData(keys.liquidation(id), data);
      qc.invalidateQueries({ queryKey: ['liquidation'] });
      qc.invalidateQueries({ queryKey: ['liquidations'] });
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: ['trip'] });
    },
  });
}
export const useUpdateLiquidation = (id: string) => useLiqMutation<UpdateLiquidationBody>(id, () => `/liquidations/${id}`, 'PATCH');
export const useAddExpenseLine = (id: string) => useLiqMutation<{ category: string; label: string; budgeted?: number; actual: number; receiptRequired?: boolean }>(id, () => `/liquidations/${id}/lines`);
export const useDeleteExpenseLine = (id: string) => useLiqMutation<{ lineId: string }>(id, (b) => `/liquidations/${id}/lines/${b.lineId}`, 'DELETE');
export const useAttachReceipt = (id: string) => useLiqMutation<{ lineId: string; attachmentId: string }>(id, (b) => `/liquidations/${id}/lines/${b.lineId}/receipts`);
export const useAttachBoardingPass = (id: string) => useLiqMutation<{ attachmentId: string }>(id, () => `/liquidations/${id}/boarding-passes`);
export const useSubmitTripReport = (id: string) => useLiqMutation<Record<string, never>>(id, () => `/liquidations/${id}/trip-report/submit`);
export const useApproveTripReport = (id: string) => useLiqMutation<{ comment?: string }>(id, () => `/liquidations/${id}/trip-report/approve`);
export const useSubmitLiquidation = (id: string) => useLiqMutation<Record<string, never>>(id, () => `/liquidations/${id}/submit`);
export const useReviewLiquidation = (id: string) => useLiqMutation<LiquidationReviewBody>(id, () => `/liquidations/${id}/review`);
export function useOpenLiquidation() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (requestId: string) => api<LiquidationDetailResponse>(`/liquidations/open/${requestId}`, { method: 'POST' }), onSuccess: () => inv(['liquidation'], ['liquidations'], keys.dashboard, ['trip'], ['travel-request']) });
}

// ----- fleet -----
export const useVehicles = (o?: QO<Vehicle[]>) => useQuery({ queryKey: keys.vehicles, queryFn: () => api<Vehicle[]>('/vehicles'), ...o });
export const useFleetCalendar = (from: string, to: string, o?: QO<FleetCalendarResponse>) =>
  useQuery({ queryKey: keys.calendar(from, to), queryFn: () => api<FleetCalendarResponse>('/vehicle-bookings/calendar', { query: { from, to } }), ...o });
export const useVehicleBookings = (q: { scope?: string } = {}, o?: QO<Paged<VehicleBooking>>) =>
  useQuery({ queryKey: keys.bookings(q), queryFn: () => api<Paged<VehicleBooking>>('/vehicle-bookings', { query: q }), ...o });
export const useVehicleBooking = (id: string | undefined, o?: QO<VehicleBooking>) =>
  useQuery({ queryKey: keys.booking(id ?? ''), queryFn: () => api<VehicleBooking>(`/vehicle-bookings/${id}`), enabled: !!id, ...o });
export function useCreateVehicleBooking() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (body: CreateVehicleBookingBody) => api<VehicleBooking>('/vehicle-bookings', { method: 'POST', body }), onSuccess: () => inv(['fleet-calendar'], ['vehicle-bookings'], keys.dashboard, keys.approvals) });
}
function useBookingMutation<TBody>(id: string, path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api<VehicleBooking>(`/vehicle-bookings/${id}${path}`, { method: 'POST', body }),
    onSuccess: (data) => {
      qc.setQueryData(keys.booking(id), data);
      qc.invalidateQueries({ queryKey: ['fleet-calendar'] });
      qc.invalidateQueries({ queryKey: ['vehicle-bookings'] });
      qc.invalidateQueries({ queryKey: keys.vehicles });
      qc.invalidateQueries({ queryKey: keys.approvals });
    },
  });
}
export const useAssignVehicle = (id: string) => useBookingMutation<{ vehicleId: string; driverId?: string }>(id, '/assign');
export const useRejectBooking = (id: string) => useBookingMutation<{ reason: string }>(id, '/reject');
export const useSelfDriveStep = (id: string) => useBookingMutation<SelfDriveStepBody>(id, '/steps');
export const useBookingPhoto = (id: string) => useBookingMutation<{ attachmentId: string }>(id, '/photos');
export const useCancelBooking = (id: string) => useBookingMutation<Record<string, never>>(id, '/cancel');
export function useUpsertVehicle() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Vehicle> & { id?: string }) => (id ? api<Vehicle>(`/vehicles/${id}`, { method: 'PATCH', body }) : api<Vehicle>('/vehicles', { method: 'POST', body })),
    onSuccess: () => inv(keys.vehicles, ['fleet-calendar'], keys.admin),
  });
}

// ----- mileage -----
export const useMileageClaims = (q: { scope?: 'mine' | 'review' } = {}, o?: QO<Paged<MileageClaim>>) =>
  useQuery({ queryKey: keys.claims(q), queryFn: () => api<Paged<MileageClaim>>('/mileage-claims', { query: q }), ...o });
export const useMileageClaim = (id: string | undefined, o?: QO<MileageDetailResponse>) =>
  useQuery({ queryKey: keys.claim(id ?? ''), queryFn: () => api<MileageDetailResponse>(`/mileage-claims/${id}`), enabled: !!id, ...o });
export function useCreateMileageClaim() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (body: CreateMileageClaimBody) => api<MileageDetailResponse>('/mileage-claims', { method: 'POST', body }), onSuccess: () => inv(['mileage-claims'], keys.dashboard) });
}
function useClaimMutation<TBody>(id: string, path: string, method: 'POST' | 'PATCH' = 'POST') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api<MileageDetailResponse>(`/mileage-claims/${id}${path}`, { method, body }),
    onSuccess: (data) => {
      qc.setQueryData(keys.claim(id), data);
      qc.invalidateQueries({ queryKey: ['mileage-claims'] });
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: keys.approvals });
    },
  });
}
export const useUpdateMileageClaim = (id: string) => useClaimMutation<Partial<CreateMileageClaimBody>>(id, '', 'PATCH');
export const useMileageEvidence = (id: string) => useClaimMutation<{ attachmentId: string; type: 'ROUTE' | 'BUSINESS' | 'PRE_APPROVAL' }>(id, '/evidence');
export const useSubmitMileageClaim = (id: string) => useClaimMutation<Record<string, never>>(id, '/submit');
export const useDecideMileageClaim = (id: string) => useClaimMutation<{ decision: 'APPROVED' | 'REJECTED'; comment?: string }>(id, '/decide');
export const usePayMileageClaim = (id: string) => useClaimMutation<Record<string, never>>(id, '/pay');

// ----- finance -----
export const useAdvanceQueue = (o?: QO<AdvanceQueueResponse>) => useQuery({ queryKey: keys.advances, queryFn: () => api<AdvanceQueueResponse>('/finance/advances'), ...o });
export const useFinanceLiquidations = (o?: QO<Paged<Liquidation>>) => useQuery({ queryKey: keys.financeLiquidations, queryFn: () => api<Paged<Liquidation>>('/finance/liquidations'), ...o });
export function useAdvanceMilestone(requestId: string) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (body: MilestoneBody) => api(`/finance/advances/${requestId}/milestones`, { method: 'POST', body }), onSuccess: () => inv(keys.advances, keys.request(requestId), keys.trip(requestId), keys.dashboard, keys.financeDashboard) });
}
export function useRequestException(requestId: string) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (body: ExceptionBody) => api(`/finance/advances/${requestId}/exception`, { method: 'POST', body }), onSuccess: () => inv(keys.advances, keys.request(requestId)) });
}
export function useApproveException(requestId: string) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => api(`/finance/advances/${requestId}/exception/approve`, { method: 'POST' }), onSuccess: () => inv(keys.advances, keys.request(requestId)) });
}

// ----- external payments -----
export const useExternalPayments = (q: { scope?: string } = {}, o?: QO<Paged<ExternalPaymentRequest>>) =>
  useQuery({ queryKey: keys.externals(q), queryFn: () => api<Paged<ExternalPaymentRequest>>('/external-payments', { query: q }), ...o });
export const useExternalPayment = (id: string | undefined, o?: QO<ExternalPaymentDetailResponse>) =>
  useQuery({ queryKey: keys.external(id ?? ''), queryFn: () => api<ExternalPaymentDetailResponse>(`/external-payments/${id}`), enabled: !!id, ...o });
export function useCreateExternalPayment() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (body: CreateExternalPaymentBody) => api<ExternalPaymentDetailResponse>('/external-payments', { method: 'POST', body }), onSuccess: () => inv(['external-payments']) });
}
function useExtMutation<TBody>(id: string, path: string, method: 'POST' | 'PUT' = 'POST') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api<ExternalPaymentDetailResponse>(`/external-payments/${id}${path}`, { method, body }),
    onSuccess: (data) => {
      qc.setQueryData(keys.external(id), data);
      qc.invalidateQueries({ queryKey: ['external-payments'] });
      qc.invalidateQueries({ queryKey: keys.approvals });
    },
  });
}
export const useSetParticipants = (id: string) => useExtMutation<{ participants: UpsertExternalParticipantBody[] }>(id, '/participants', 'PUT');
export const useSubmitExternal = (id: string) => useExtMutation<Record<string, never>>(id, '/submit');
export const useDecideExternal = (id: string) => useExtMutation<ApprovalDecisionBody>(id, '/decide');
export const usePayExternal = (id: string) => useExtMutation<{ reference?: string }>(id, '/pay');
export const useExternalAcquittal = (id: string) => useExtMutation<{ attendanceRegisterId?: string; acquittalSheetIds?: string[]; bankEvidenceId?: string }>(id, '/acquittal');

// ----- admin -----
export const useAdminOverview = (o?: QO<AdminOverview>) => useQuery({ queryKey: keys.admin, queryFn: () => api<AdminOverview>('/admin/overview'), ...o });
function useAdminMutation<TBody, TRes = unknown>(fn: (b: TBody) => Promise<TRes>) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: () => inv(keys.admin, keys.masterData, keys.vehicles) });
}
export const useCreateRate = () => useAdminMutation<CreateRateBody, Rate>((body) => api('/admin/rates', { method: 'POST', body }));
export const useUpdateRate = () => useAdminMutation<{ id: string; note?: string; effectiveTo?: string | null }, Rate>(({ id, ...body }) => api(`/admin/rates/${id}`, { method: 'PATCH', body }));
export const useCreateWorkflow = () => useAdminMutation<CreateWorkflowVersionBody, WorkflowDefinition>((body) => api('/admin/workflows', { method: 'POST', body }));
export const useUpdatePolicy = () => useAdminMutation<Partial<PolicyConfig>, PolicyConfig>((body) => api('/admin/policy', { method: 'PATCH', body }));
export const useUpsertVendor = () => useAdminMutation<Partial<Vendor> & { id?: string }, Vendor>(({ id, ...body }) => (id ? api(`/admin/vendors/${id}`, { method: 'PATCH', body }) : api('/admin/vendors', { method: 'POST', body })));
export const useCreateUser = () => useAdminMutation<CreateUserBody, CreateUserResponse>((body) => api('/admin/users', { method: 'POST', body }));
export const useUpdateUser = () => useAdminMutation<{ id: string } & UpdateUserBody, UserProfile>(({ id, ...body }) => api(`/admin/users/${id}`, { method: 'PATCH', body }));
export const useUpsertMasterData = () =>
  useAdminMutation<{ kind: 'departments' | 'units' | 'projects' | 'cost-centres' | 'locations'; id?: string; data: Record<string, unknown> }>(({ kind, id, data }) => (id ? api(`/admin/${kind}/${id}`, { method: 'PATCH', body: data }) : api(`/admin/${kind}`, { method: 'POST', body: data })));
export const useRunDailyJobs = () => useAdminMutation<Record<string, never>, unknown>(() => api('/jobs/run-daily', { method: 'POST' }));
