'use client';
import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  fmtDateTime,
  fmtRange,
  hasAnyRole,
  shortRef,
  type BookingConflictError,
  type Role,
  type Vehicle,
  type VehicleBooking,
} from '@tms/shared';
import { Button, Chip, Dialog, CheckRow, Icon, SelectField, TextArea, TextField, humanize, toneFor, useToast } from '@/components/m3';
import { ApiClientError, openFile, uploadFile } from '@/lib/api';
import { useMe } from '@/lib/auth-context';
import { useAssignVehicle, useBookingPhoto, useCancelBooking, useMasterData, useRejectBooking, useSelfDriveStep, useVehicles } from '@/lib/queries';
import './fleet.css';

export const FLEET_ROLES: Role[] = ['OFFICE_MANAGEMENT', 'FLEET_ADMIN', 'SYSTEM_ADMIN'];
export const FUEL_LEVELS = ['Full', '¾', '½', '¼', 'Empty'].map((v) => ({ value: v, label: v }));

/** Renders a 409 BOOKING_CONFLICT nicely; returns null for other errors. */
export function conflictMessage(e: unknown): string | null {
  if (!(e instanceof ApiClientError)) return null;
  if (e.status !== 409 && e.code !== 'BOOKING_CONFLICT') return null;
  const d = e.details as Partial<BookingConflictError> | { conflicts?: BookingConflictError['conflicts'] } | undefined;
  const list = d && 'conflicts' in d ? d.conflicts : undefined;
  if (list?.length) return `Vehicle already booked — ${list.map((c) => `${c.requesterName} · ${c.destination} · ${fmtRange(c.pickupAt, c.returnAt)}`).join('; ')}`;
  return e.message || 'That vehicle is already booked for those dates';
}

const mmyyyy = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};
const km = (n: number) => n.toLocaleString('en-ZM');

type StepKey = 'licence' | 'pre' | 'keys' | 'return' | 'sign';
interface StepView {
  key: StepKey;
  done: boolean;
  error?: boolean;
  label: string;
  sub?: string;
  action: string;
}

export function BookingSheet({ booking, vehicles, fullPageHref }: { booking: VehicleBooking; vehicles?: Vehicle[]; fullPageHref?: string }) {
  const me = useMe();
  const toast = useToast();
  const isRequester = booking.requesterId === me.user.id;
  const isFleet = me.capabilities.canSeeFleetAdmin || hasAnyRole(me.user.roles, FLEET_ROLES);
  const terminal = ['CLOSED', 'CANCELLED', 'REJECTED'].includes(booking.status);
  const canAct = (isRequester || isFleet) && ['CONFIRMED', 'IN_PROGRESS', 'RETURNED'].includes(booking.status);

  const step = useSelfDriveStep(booking.id);
  const photo = useBookingPhoto(booking.id);
  const cancel = useCancelBooking(booking.id);

  /* ---------- self-drive steps ---------- */
  const sd = booking.selfDrive ?? {};
  const kr = sd.keyReturn;
  const steps: StepView[] = [
    {
      key: 'licence',
      done: !!sd.licenceValid?.ok,
      error: !!sd.licenceValid && !sd.licenceValid.ok,
      label: sd.licenceValid ? (sd.licenceValid.ok ? `Licence valid — expires ${mmyyyy(sd.licenceValid.expiry)}` : `Licence expired ${mmyyyy(sd.licenceValid.expiry)} — renew before departure`) : 'Licence validity check',
      action: 'Confirm driving licence',
    },
    {
      key: 'pre',
      done: !!sd.preDepartureInspection?.ok,
      error: !!sd.preDepartureInspection && !sd.preDepartureInspection.ok,
      label: sd.preDepartureInspection ? (sd.preDepartureInspection.ok ? 'Pre-departure inspection logged' : `Pre-departure inspection — faults noted${sd.preDepartureInspection.notes ? `: ${sd.preDepartureInspection.notes}` : ''}`) : 'Pre-departure inspection',
      action: 'Log pre-departure inspection',
    },
    {
      key: 'keys',
      done: !!sd.keysAccepted,
      label: sd.keysAccepted ? `Keys accepted · odo-out ${km(sd.keysAccepted.odometerOut)} · fuel ${sd.keysAccepted.fuelLevel}` : 'Keys acceptance · odo-out & fuel',
      action: 'Accept keys',
    },
    {
      key: 'return',
      done: !!sd.returnInspection,
      label: sd.returnInspection ? `Return inspection · odo-in ${km(sd.returnInspection.odometerIn)} · fuel ${sd.returnInspection.fuelLevel}${sd.returnInspection.faults ? ` · faults: ${sd.returnInspection.faults}` : ''}` : 'Return inspection & odo-in',
      action: 'Log return inspection',
    },
    {
      key: 'sign',
      done: !!(kr?.travellerSignedAt && kr?.officeSignedAt),
      label: 'Key return — dual sign-off',
      sub: kr?.travellerSignedAt || kr?.officeSignedAt ? `traveller ${kr?.travellerSignedAt ? '✓' : '–'} · office ${kr?.officeSignedAt ? '✓' : '–'}` : undefined,
      action: 'Sign key return',
    },
  ];
  const nextStep = steps.find((s) => !s.done);
  const myParty: 'TRAVELLER' | 'OFFICE' = isRequester ? 'TRAVELLER' : 'OFFICE';
  const alreadySigned = myParty === 'TRAVELLER' ? !!kr?.travellerSignedAt : !!kr?.officeSignedAt;

  /* ---------- step dialogs ---------- */
  const [dlg, setDlg] = useState<StepKey | null>(null);
  const [f, setF] = useState({ expiry: me.user.driverLicenceExpiry ?? '', ok: true, notes: '', odometer: '', fuel: 'Full', faults: '' });
  const setField = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const runStep = (body: Parameters<typeof step.mutate>[0], done: string) =>
    step.mutate(body, {
      onSuccess: () => {
        toast.success(done);
        setDlg(null);
      },
      onError: (e) => toast.error(e, 'Could not record step'),
    });
  const onStepAction = () => {
    if (!nextStep) return;
    if (nextStep.key === 'sign') runStep({ step: 'key_return', party: myParty }, myParty === 'TRAVELLER' ? 'Key return signed — awaiting office' : 'Key return signed off');
    else setDlg(nextStep.key);
  };

  /* ---------- photos ---------- */
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { attachment } = await uploadFile(file, 'PHOTO');
      await photo.mutateAsync({ attachmentId: attachment.id });
      toast.success('Condition photo added');
    } catch (e) {
      toast.error(e, 'Could not upload photo');
    } finally {
      setUploading(false);
    }
  };
  const photos = booking.photos ?? [];
  const canUpload = (isRequester || isFleet) && !terminal;

  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <div>
      <div className="row-start g10">
        <div className="grow">
          <div className="fleet-sheet__title">
            Booking {shortRef(booking.id)} · {booking.mode === 'SELF_DRIVE' ? 'self-drive' : 'assigned driver'}
          </div>
          <div className="fleet-sheet__meta">
            {booking.requesterName} · {booking.purpose} · {fmtRange(booking.pickupAt, booking.returnAt)}
          </div>
        </div>
        <Chip tone={toneFor(booking.status)}>{humanize(booking.status)}</Chip>
      </div>

      {booking.mode === 'SELF_DRIVE' ? (
        <>
          <div className="fleet-steps">
            {steps.map((s) => (
              <div key={s.key} className={`fleet-step ${s.error ? 'fleet-step--error' : s.done ? '' : 'fleet-step--pending'}`}>
                <Icon name={s.done ? 'check_circle' : s.error ? 'error' : 'radio_button_unchecked'} filled={s.done} size={18} color={s.done ? 'var(--md-primary)' : s.error ? 'var(--md-error)' : 'var(--md-outline)'} />
                <span>
                  {s.label}
                  {s.sub ? <span className="fleet-step__sub">{s.sub}</span> : null}
                </span>
              </div>
            ))}
          </div>
          <div className="fleet-kv" style={{ marginTop: 12 }}>
            <div className="kv">
              <span>Vehicle</span>
              <span>{booking.vehicleLabel ?? 'Not yet assigned'}</span>
            </div>
            <div className="kv">
              <span>Destination</span>
              <span>{booking.destination}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="fleet-kv">
          <div className="kv">
            <span>Vehicle</span>
            <span>{booking.vehicleLabel ?? 'Not yet assigned'}</span>
          </div>
          <div className="kv">
            <span>Driver</span>
            <span>{booking.driverName ?? '—'}</span>
          </div>
          <div className="kv">
            <span>Destination</span>
            <span>{booking.destination}</span>
          </div>
          <div className="kv">
            <span>Passengers</span>
            <span>{booking.passengers}</span>
          </div>
          <div className="kv">
            <span>Pickup</span>
            <span>{fmtDateTime(booking.pickupAt)}</span>
          </div>
          <div className="kv">
            <span>Return</span>
            <span>{fmtDateTime(booking.returnAt)}</span>
          </div>
        </div>
      )}

      {/* condition photos */}
      <div className="fleet-photos">
        {Array.from({ length: 3 }).map((_, i) => {
          const p = photos[i];
          if (p) {
            return (
              <button key={p.id} type="button" className="fleet-photo" title={p.name} aria-label={`Open ${p.name}`} onClick={() => void openFile(p.id)}>
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.name} />
                ) : (
                  <Icon name="image" filled size={22} color="var(--md-primary)" />
                )}
              </button>
            );
          }
          if (canUpload) {
            return (
              <button key={`empty-${i}`} type="button" className="fleet-photo" aria-label="Add condition photo" disabled={uploading} onClick={() => fileInput.current?.click()}>
                <Icon name={uploading ? 'progress_activity' : 'photo_camera'} size={20} />
              </button>
            );
          }
          return (
            <div key={`empty-${i}`} className="fleet-photo">
              <Icon name="photo_camera" size={20} />
            </div>
          );
        })}
        {photos.length > 3 ? <span className="t-caption-sm">+{photos.length - 3}</span> : null}
        <div className="fleet-photos__cap">
          Condition photos
          <br />
          (pre-departure)
        </div>
        <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
      </div>

      {/* next-step action */}
      {booking.mode === 'SELF_DRIVE' && nextStep && canAct ? (
        <Button
          variant="tonal"
          block
          style={{ marginTop: 16 }}
          loading={step.isPending}
          disabled={nextStep.key === 'sign' && alreadySigned}
          disabledLabel={myParty === 'TRAVELLER' ? 'Awaiting office sign-off' : 'Awaiting traveller sign-off'}
          onClick={onStepAction}
        >
          {nextStep.action}
        </Button>
      ) : null}
      {booking.mode === 'SELF_DRIVE' && !nextStep ? (
        <div className="row g8 mt16 t-caption">
          <Icon name="verified" filled size={18} color="var(--md-primary)" /> All self-drive steps complete.
        </div>
      ) : null}
      {booking.status === 'REQUESTED' && !isFleet ? <div className="t-caption mt14">Awaiting the fleet office to confirm a vehicle{booking.mode === 'ASSIGNED_DRIVER' ? ' and driver' : ''}.</div> : null}

      {/* fleet office: assign / reject */}
      {isFleet && booking.status === 'REQUESTED' ? <AssignForm booking={booking} vehicles={vehicles} /> : null}

      {/* footer actions */}
      <div className="row g8 mt14 wrap">
        {fullPageHref ? (
          <Link href={fullPageHref} className="row g4" style={{ fontSize: 12.5, fontWeight: 650 }}>
            Open booking <Icon name="arrow_forward" size={15} />
          </Link>
        ) : null}
        <div className="spacer" />
        {isRequester && (booking.status === 'REQUESTED' || booking.status === 'CONFIRMED') ? (
          <Button variant="danger-text" size="xs" onClick={() => setCancelOpen(true)}>
            Cancel booking
          </Button>
        ) : null}
      </div>

      {/* ---------- dialogs ---------- */}
      <StepDialog
        open={dlg === 'licence'}
        onClose={() => setDlg(null)}
        title="Confirm driving licence"
        subtitle="Self-drive requires a valid licence for the whole booking period."
        busy={step.isPending}
        disabled={!f.expiry}
        onSubmit={() => runStep({ step: 'licence', expiry: f.expiry }, 'Licence recorded')}
      >
        <TextField label="Licence expiry date" type="date" value={f.expiry} onChange={(e) => setField('expiry', e.target.value)} />
      </StepDialog>

      <StepDialog
        open={dlg === 'pre'}
        onClose={() => setDlg(null)}
        title="Pre-departure inspection"
        subtitle="Walk around the vehicle, check tyres, lights, fluids and the first-aid kit."
        busy={step.isPending}
        onSubmit={() => runStep({ step: 'pre_inspection', ok: f.ok, notes: f.notes.trim() || undefined }, 'Inspection logged')}
      >
        <CheckRow checked={f.ok} onChange={(v) => setField('ok', v)}>
          Vehicle is roadworthy and safe to depart
        </CheckRow>
        <TextArea label="Notes / faults observed" className="mt16" value={f.notes} onChange={(e) => setField('notes', e.target.value)} />
      </StepDialog>

      <StepDialog
        open={dlg === 'keys'}
        onClose={() => setDlg(null)}
        title="Accept keys"
        subtitle="Record the odometer and fuel level as you take the vehicle."
        busy={step.isPending}
        disabled={!f.odometer}
        onSubmit={() => runStep({ step: 'keys_out', odometerOut: Number(f.odometer), fuelLevel: f.fuel }, 'Keys accepted')}
      >
        <div className="row g14">
          <TextField label="Odometer out (km)" type="number" min={0} className="grow" value={f.odometer} onChange={(e) => setField('odometer', e.target.value)} />
          <SelectField label="Fuel level" options={FUEL_LEVELS} style={{ width: 150 }} value={f.fuel} onChange={(e) => setField('fuel', e.target.value)} />
        </div>
      </StepDialog>

      <StepDialog
        open={dlg === 'return'}
        onClose={() => setDlg(null)}
        title="Return inspection"
        subtitle="Record the odometer, fuel level and any faults or damage on return."
        busy={step.isPending}
        disabled={!f.odometer}
        onSubmit={() => runStep({ step: 'return_inspection', odometerIn: Number(f.odometer), fuelLevel: f.fuel, faults: f.faults.trim() || undefined }, 'Return inspection logged')}
      >
        <div className="row g14">
          <TextField label="Odometer in (km)" type="number" min={sd.keysAccepted?.odometerOut ?? 0} className="grow" value={f.odometer} onChange={(e) => setField('odometer', e.target.value)} />
          <SelectField label="Fuel level" options={FUEL_LEVELS} style={{ width: 150 }} value={f.fuel} onChange={(e) => setField('fuel', e.target.value)} />
        </div>
        <TextArea label="Faults / damage (optional)" className="mt16" value={f.faults} onChange={(e) => setField('faults', e.target.value)} />
      </StepDialog>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        subtitle="The vehicle will be released for other bookings."
        actions={
          <>
            <Button variant="text" onClick={() => setCancelOpen(false)}>
              Keep booking
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  {},
                  {
                    onSuccess: () => {
                      toast.success('Booking cancelled');
                      setCancelOpen(false);
                    },
                    onError: (e) => toast.error(e, 'Could not cancel booking'),
                  },
                )
              }
            >
              Cancel booking
            </Button>
          </>
        }
      />
    </div>
  );
}

function StepDialog({ open, onClose, title, subtitle, busy, disabled, onSubmit, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; busy?: boolean; disabled?: boolean; onSubmit: () => void; children: ReactNode }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={busy} disabled={disabled} disabledLabel="Save">
            Save
          </Button>
        </>
      }
    >
      <div className="mt12">{children}</div>
    </Dialog>
  );
}

function AssignForm({ booking, vehicles }: { booking: VehicleBooking; vehicles?: Vehicle[] }) {
  const toast = useToast();
  const assign = useAssignVehicle(booking.id);
  const reject = useRejectBooking(booking.id);
  const md = useMasterData();
  const vq = useVehicles({ enabled: !vehicles });
  const list = (vehicles ?? vq.data ?? []).filter((v) => v.status === 'AVAILABLE');
  const [vehicleId, setVehicleId] = useState(booking.vehicleId ?? '');
  const [driverId, setDriverId] = useState(booking.driverId ?? '');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const needsDriver = booking.mode === 'ASSIGNED_DRIVER';
  return (
    <div className="mt16 col g14">
      <div style={{ fontWeight: 750, fontSize: 13.5 }}>Assign vehicle{needsDriver ? ' & driver' : ''}</div>
      <SelectField label="Vehicle" placeholder="Choose an available vehicle" options={list.map((v) => ({ value: v.id, label: `${v.make} ${v.model} · ${v.registration}` }))} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} />
      {needsDriver ? <SelectField label="Driver" placeholder="Choose a driver" options={(md.data?.users ?? []).map((u) => ({ value: u.id, label: u.displayName }))} value={driverId} onChange={(e) => setDriverId(e.target.value)} /> : null}
      <Button
        variant="tonal"
        block
        loading={assign.isPending}
        disabled={!vehicleId || (needsDriver && !driverId)}
        disabledLabel={!vehicleId ? 'Choose a vehicle' : 'Choose a driver'}
        onClick={() =>
          assign.mutate(
            { vehicleId, driverId: needsDriver ? driverId : undefined },
            {
              onSuccess: () => toast.success('Booking confirmed'),
              onError: (e) => {
                const msg = conflictMessage(e);
                if (msg) toast.error(new Error(msg));
                else toast.error(e, 'Could not assign vehicle');
              },
            },
          )
        }
      >
        {needsDriver ? 'Assign vehicle & driver' : 'Assign vehicle'}
      </Button>
      <Button variant="danger-text" size="sm" onClick={() => setRejectOpen(true)}>
        Reject request
      </Button>
      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject booking request"
        subtitle="The requester is notified with your reason."
        actions={
          <>
            <Button variant="text" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              disabledLabel="Reject — add a reason"
              loading={reject.isPending}
              onClick={() =>
                reject.mutate(
                  { reason: reason.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Booking rejected');
                      setRejectOpen(false);
                    },
                    onError: (e) => toast.error(e, 'Could not reject booking'),
                  },
                )
              }
            >
              Reject
            </Button>
          </>
        }
      >
        <TextArea label="Reason" className="mt12" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>
    </div>
  );
}
