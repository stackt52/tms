'use client';
import { useState } from 'react';
import { fmtRange, type BookingConflictError, type BookingMode, type Vehicle, type VehicleBooking } from '@tms/shared';
import { Banner, Button, Dialog, Segmented, SelectField, TextField, useToast } from '@/components/m3';
import { ApiClientError } from '@/lib/api';
import { useCreateVehicleBooking } from '@/lib/queries';

const EMPTY = { purpose: '', destination: '', passengers: '1', pickupAt: '', returnAt: '', mode: 'ASSIGNED_DRIVER' as BookingMode, vehicleId: '' };

export function BookVehicleDialog({ open, onClose, vehicles, onCreated }: { open: boolean; onClose: () => void; vehicles: Vehicle[]; onCreated: (b: VehicleBooking) => void }) {
  const toast = useToast();
  const create = useCreateVehicleBooking();
  const [f, setF] = useState(EMPTY);
  const [conflicts, setConflicts] = useState<BookingConflictError['conflicts'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const pickup = f.pickupAt ? new Date(f.pickupAt) : null;
  const ret = f.returnAt ? new Date(f.returnAt) : null;
  const orderOk = !!pickup && !!ret && ret.getTime() > pickup.getTime();
  const valid = f.purpose.trim() && f.destination.trim() && Number(f.passengers) >= 1 && orderOk;
  const problem = !f.purpose.trim() ? 'add a purpose' : !f.destination.trim() ? 'add a destination' : !pickup || !ret ? 'set pickup and return' : !orderOk ? 'return must be after pickup' : '';

  const close = () => {
    setConflicts(null);
    setError(null);
    onClose();
  };
  const submit = () => {
    setConflicts(null);
    setError(null);
    create.mutate(
      {
        purpose: f.purpose.trim(),
        destination: f.destination.trim(),
        passengers: Number(f.passengers) || 1,
        pickupAt: pickup!.toISOString(),
        returnAt: ret!.toISOString(),
        mode: f.mode,
        vehicleId: f.vehicleId || undefined,
      },
      {
        onSuccess: (b) => {
          toast.success(`Booking ${b.id} requested`);
          setF(EMPTY);
          onCreated(b);
        },
        onError: (e) => {
          if (e instanceof ApiClientError && (e.status === 409 || e.code === 'BOOKING_CONFLICT')) {
            const d = e.details as { conflicts?: BookingConflictError['conflicts'] } | undefined;
            setConflicts(d?.conflicts ?? []);
            setError(e.message || 'That vehicle is already booked for those dates.');
          } else {
            setError(e instanceof Error ? e.message : 'Could not create booking');
          }
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Book a vehicle"
      subtitle="Requests go to the fleet office, who confirm a vehicle (and driver) subject to availability."
      actions={
        <>
          <Button variant="text" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!valid} disabledLabel={`Request — ${problem}`}>
            Request booking
          </Button>
        </>
      }
    >
      <div className="col g16 mt12">
        <Segmented<BookingMode>
          options={[
            { value: 'ASSIGNED_DRIVER', label: 'Assigned driver' },
            { value: 'SELF_DRIVE', label: 'Self-drive' },
          ]}
          value={f.mode}
          onChange={(v) => set('mode', v)}
        />
        <TextField label="Purpose" placeholder="e.g. Chongwe outreach" value={f.purpose} onChange={(e) => set('purpose', e.target.value)} />
        <div className="row g14">
          <TextField label="Destination" placeholder="Town / facility" className="grow" value={f.destination} onChange={(e) => set('destination', e.target.value)} />
          <TextField label="Passengers" type="number" min={1} max={14} style={{ width: 120 }} value={f.passengers} onChange={(e) => set('passengers', e.target.value)} />
        </div>
        <div className="row g14">
          <TextField label="Pickup" type="datetime-local" className="grow" value={f.pickupAt} onChange={(e) => set('pickupAt', e.target.value)} />
          <TextField label="Return" type="datetime-local" className="grow" value={f.returnAt} min={f.pickupAt || undefined} onChange={(e) => set('returnAt', e.target.value)} error={f.pickupAt && f.returnAt && !orderOk ? 'Return must be after pickup' : undefined} />
        </div>
        <SelectField
          label="Preferred vehicle (optional)"
          placeholder="Any available vehicle"
          options={vehicles.filter((v) => v.status === 'AVAILABLE').map((v) => ({ value: v.id, label: `${v.make} ${v.model} · ${v.registration}` }))}
          value={f.vehicleId}
          onChange={(e) => set('vehicleId', e.target.value)}
        />
        {error ? (
          <Banner tone="error" compact title={conflicts ? 'Vehicle not available' : 'Could not create booking'} body={error}>
            {conflicts?.length ? (
              <div className="mt6">
                {conflicts.map((c) => (
                  <div key={c.id} className="fleet-conflict">
                    {c.requesterName} · {c.destination} · {fmtRange(c.pickupAt, c.returnAt)}
                  </div>
                ))}
              </div>
            ) : null}
          </Banner>
        ) : null}
      </div>
    </Dialog>
  );
}
