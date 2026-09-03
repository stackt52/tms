import { describe, expect, it } from 'vitest';
import type { VehicleBooking } from '@tms/shared';
import { findConflicts } from './fleet';

const b = (id: string, vehicleId: string, pickupAt: string, returnAt: string, status: VehicleBooking['status'] = 'CONFIRMED'): VehicleBooking => ({
  id,
  vehicleId,
  requesterId: 'u',
  requesterName: 'Someone',
  purpose: 'p',
  destination: 'd',
  passengers: 1,
  pickupAt,
  returnAt,
  mode: 'ASSIGNED_DRIVER',
  status,
  selfDrive: {},
  photos: [],
  createdAt: 'x',
  updatedAt: 'x',
});

describe('findConflicts', () => {
  const existing = [b('VEH-1', 'v1', '2026-09-07T06:00:00.000Z', '2026-09-11T16:00:00.000Z'), b('VEH-2', 'v2', '2026-09-09T06:00:00.000Z', '2026-09-10T16:00:00.000Z', 'IN_PROGRESS'), b('VEH-3', 'v1', '2026-09-12T06:00:00.000Z', '2026-09-13T16:00:00.000Z', 'CANCELLED')];
  it('detects an overlap on the same vehicle', () => {
    expect(findConflicts(existing, 'v1', '2026-09-10T06:00:00.000Z', '2026-09-12T16:00:00.000Z').map((c) => c.id)).toEqual(['VEH-1']);
  });
  it('ignores other vehicles, cancelled bookings and back-to-back ranges', () => {
    expect(findConflicts(existing, 'v2', '2026-09-07T06:00:00.000Z', '2026-09-08T16:00:00.000Z')).toHaveLength(0);
    expect(findConflicts(existing, 'v1', '2026-09-12T06:00:00.000Z', '2026-09-13T16:00:00.000Z')).toHaveLength(0);
    expect(findConflicts(existing, 'v1', '2026-09-11T16:00:00.000Z', '2026-09-12T16:00:00.000Z')).toHaveLength(0);
  });
  it('excludes the booking being re-assigned', () => {
    expect(findConflicts(existing, 'v1', '2026-09-08T06:00:00.000Z', '2026-09-09T16:00:00.000Z', 'VEH-1')).toHaveLength(0);
  });
});
