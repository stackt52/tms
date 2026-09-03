'use client';
import { useMemo, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDays, calendarDaysBetween, fmtDay, isoDate, startOfDay, type Vehicle, type VehicleBooking } from '@tms/shared';
import { Button, Card, CardSkeleton, EmptyState, ErrorState, IconButton, Segmented } from '@/components/m3';
import { useMe } from '@/lib/auth-context';
import { useFleetCalendar } from '@/lib/queries';
import { BookingSheet } from './BookingSheet';
import { BookVehicleDialog } from './BookVehicleDialog';
import './fleet.css';

type View = 'week' | 'month';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function mondayOf(d: Date): Date {
  const s = startOfDay(d);
  const dow = s.getUTCDay();
  return addDays(s, dow === 0 ? -6 : 1 - dow);
}
function parseWeek(p: string | null): Date {
  if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) {
    const d = new Date(`${p}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return mondayOf(d);
  }
  return mondayOf(new Date());
}
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0]![0]}. ${parts[parts.length - 1]}`;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const VISIBLE: VehicleBooking['status'][] = ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS', 'RETURNED', 'CLOSED'];

function barTone(b: VehicleBooking): { cls: string; label: string } {
  if (b.status === 'REQUESTED') return { cls: 'fleet-bar--pending', label: `Requested — ${shortName(b.requesterName)} (pending)` };
  const past = b.status === 'RETURNED' || b.status === 'CLOSED' ? ' fleet-bar--past' : '';
  if (b.mode === 'SELF_DRIVE') return { cls: `fleet-bar--self${past}`, label: `${b.destination} — ${shortName(b.requesterName)} · self-drive` };
  return { cls: `fleet-bar--assigned${past}`, label: `${b.destination} — ${shortName(b.requesterName)}${b.driverName ? ` · driver: ${shortName(b.driverName)}` : ''}` };
}

interface Bar {
  booking: VehicleBooking;
  start: number;
  end: number;
  lane: number;
}
function layoutBars(bookings: VehicleBooking[], dayIdx: (iso: string) => number, days: number): Bar[] {
  const bars = bookings
    .map((b) => ({ booking: b, s: dayIdx(b.pickupAt), e: dayIdx(b.returnAt) }))
    .filter((x) => x.e >= 0 && x.s <= days - 1)
    .map((x) => ({ booking: x.booking, start: clamp(x.s, 0, days - 1), end: clamp(Math.max(x.e, x.s), 0, days - 1) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  return bars.map((b) => {
    let lane = laneEnds.findIndex((end) => end < b.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.end);
    } else laneEnds[lane] = b.end;
    return { ...b, lane };
  });
}

export function FleetScreen() {
  const me = useMe();
  const router = useRouter();
  const sp = useSearchParams();
  const view: View = sp.get('view') === 'month' ? 'month' : 'week';
  const days = view === 'month' ? 28 : 7;
  const start = useMemo(() => parseWeek(sp.get('week')), [sp]);
  const end = addDays(start, days - 1);
  const from = isoDate(start);
  const to = isoDate(end);
  const today = isoDate(startOfDay(new Date()));
  const selectedId = sp.get('booking');
  const bookOpen = sp.get('book') === '1';

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(`/fleet${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const q = useFleetCalendar(from, to);
  const vehicles: Vehicle[] = useMemo(() => q.data?.vehicles ?? [], [q.data]);
  const bookings = useMemo(() => (q.data?.bookings ?? []).filter((b) => VISIBLE.includes(b.status)), [q.data]);

  const selected = useMemo(() => {
    if (!bookings.length) return null;
    return bookings.find((b) => b.id === selectedId) ?? bookings.find((b) => b.requesterId === me.user.id || b.driverId === me.user.id) ?? bookings[0]!;
  }, [bookings, selectedId, me.user.id]);

  const dayIdx = (iso: string) => calendarDaysBetween(start, new Date(new Date(iso).getTime() + 2 * 3600e3));
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const title = view === 'week' ? `Fleet — week of ${sameMonth ? `${String(start.getUTCDate()).padStart(2, '0')}–${fmtDay(end)}` : `${fmtDay(start)} – ${fmtDay(end)}`}` : `Fleet — ${fmtDay(start)} – ${fmtDay(end)}`;

  const unassigned = bookings.filter((b) => !b.vehicleId && b.status === 'REQUESTED');
  const gridStyle = { '--days': days } as CSSProperties;
  const gridCls = `fleet-grid ${view === 'month' ? 'fleet-grid--month' : ''}`;

  const renderRow = (key: string, name: string, meta: string, rowBookings: VehicleBooking[], service?: { note?: string; dueBack?: string }) => {
    const bars = service ? [] : layoutBars(rowBookings, dayIdx, days);
    const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
    const covered = new Set<number>();
    for (const b of bars) if (b.lane === 0) for (let i = b.start; i <= b.end; i++) covered.add(i);
    return (
      <div key={key} className={gridCls} style={gridStyle}>
        <div className="fleet-veh" style={{ gridColumn: 1, gridRow: `1 / ${lanes + 1}` }}>
          <div className="fleet-veh__name">{name}</div>
          <div className="fleet-veh__meta">{meta}</div>
        </div>
        {service ? (
          <div className="fleet-bar fleet-bar--service" style={{ gridColumn: `2 / ${days + 2}`, gridRow: 1 }} title={service.note}>
            In service — {service.note ?? 'maintenance'}
            {service.dueBack ? `, due back ${fmtDay(service.dueBack)}` : ''}
          </div>
        ) : (
          <>
            {bars.map((b) => {
              const t = barTone(b.booking);
              return (
                <button
                  key={b.booking.id}
                  type="button"
                  className={`fleet-bar ${t.cls} ${selected?.id === b.booking.id ? 'fleet-bar--selected' : ''}`}
                  style={{ gridColumn: `${b.start + 2} / ${b.end + 3}`, gridRow: b.lane + 1 }}
                  title={`${b.booking.id} · ${t.label}`}
                  aria-pressed={selected?.id === b.booking.id}
                  onClick={() => setParams({ booking: b.booking.id })}
                >
                  {t.label}
                </button>
              );
            })}
            {Array.from({ length: days }).map((_, i) =>
              covered.has(i) ? null : <div key={i} className={`fleet-free ${isoDate(addDays(start, i)) === today ? 'fleet-free--today' : ''}`} style={{ gridColumn: i + 2, gridRow: 1 }} />,
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="row g14 wrap">
        <div className="t-title">{title}</div>
        <Segmented<View>
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={view}
          onChange={(v) => setParams({ view: v === 'week' ? null : v })}
        />
        <div className="row">
          <IconButton icon="chevron_left" label="Previous" onClick={() => setParams({ week: isoDate(addDays(start, -days)) })} />
          <Button variant="text" size="xs" onClick={() => setParams({ week: null })}>
            Today
          </Button>
          <IconButton icon="chevron_right" label="Next" onClick={() => setParams({ week: isoDate(addDays(start, days)) })} />
        </div>
        <div className="spacer" />
        <Button icon="add" onClick={() => setParams({ book: '1' })} style={{ padding: '11px 22px', fontSize: 13.5 }}>
          Book a vehicle
        </Button>
      </div>

      <div className="split fleet-split" style={{ marginTop: 18 }}>
        <div className="main">
          {q.isLoading ? (
            <CardSkeleton lines={5} h={320} />
          ) : q.isError ? (
            <Card>
              <ErrorState error={q.error} retry={() => q.refetch()} />
            </Card>
          ) : (
            <Card className="fleet-card">
              <div className="fleet-scroll">
                <div className={`${gridCls} fleet-grid--head`} style={gridStyle}>
                  <span />
                  {Array.from({ length: days }).map((_, i) => {
                    const d = addDays(start, i);
                    const dow = d.getUTCDay();
                    const iso = isoDate(d);
                    const we = dow === 0 || dow === 6;
                    return (
                      <span key={i} className={iso === today ? 'fleet-head--today' : we ? 'fleet-head--we' : ''} title={fmtDay(d)}>
                        {view === 'week' ? `${DAYS[dow]} ${d.getUTCDate()}` : d.getUTCDate() === 1 || i === 0 ? fmtDay(d).replace(/^0/, '') : String(d.getUTCDate())}
                      </span>
                    );
                  })}
                </div>
                {vehicles.length === 0 ? <EmptyState icon="directions_car" title="No vehicles in the fleet" body="Vehicles are added under Admin → Master data." /> : null}
                {vehicles
                  .filter((v) => v.status !== 'RETIRED')
                  .map((v) =>
                    renderRow(
                      v.id,
                      `${v.make} ${v.model}`,
                      `${v.registration} · ${v.odometerKm.toLocaleString('en-ZM')} km`,
                      bookings.filter((b) => b.vehicleId === v.id),
                      v.status === 'IN_SERVICE' ? { note: v.serviceNote, dueBack: v.serviceDueBack } : undefined,
                    ),
                  )}
                {unassigned.length ? renderRow('unassigned', 'Unassigned requests', 'awaiting fleet office', unassigned) : null}
              </div>
              <div className="fleet-legend">
                <span>
                  <i className="fleet-legend__sw" style={{ background: 'var(--md-primary-container)' }} />
                  Assigned
                </span>
                <span>
                  <i className="fleet-legend__sw" style={{ background: 'var(--md-secondary-container)' }} />
                  Self-drive
                </span>
                <span>
                  <i className="fleet-legend__sw" style={{ background: 'var(--md-tertiary-container)' }} />
                  Pending
                </span>
                <span>
                  <i className="fleet-legend__sw" style={{ background: 'var(--md-error-container)' }} />
                  Unavailable
                </span>
                <span>
                  <i className="fleet-legend__sw" style={{ background: 'var(--md-surface-container)' }} />
                  Free
                </span>
              </div>
            </Card>
          )}
        </div>
        <div className="side">
          {q.isLoading ? (
            <CardSkeleton lines={5} h={280} />
          ) : selected ? (
            <Card>
              <BookingSheet key={selected.id} booking={selected} vehicles={vehicles} fullPageHref={`/fleet/bookings/${selected.id}`} />
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon="event_available"
                title="No bookings in this period"
                body="Select a booking bar to see its sheet here, or request a vehicle."
                action={
                  <Button variant="tonal" size="sm" icon="add" onClick={() => setParams({ book: '1' })}>
                    Book a vehicle
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      </div>

      <BookVehicleDialog
        open={bookOpen}
        onClose={() => setParams({ book: null })}
        vehicles={vehicles}
        onCreated={(b) => setParams({ book: null, booking: b.id, week: isoDate(mondayOf(new Date(b.pickupAt))) })}
      />
    </div>
  );
}
