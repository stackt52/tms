'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STATUS_META, fmtDate, fmtDowDay, fmtLongDay, fmtRange, formatZMW, plural, shortRef, timelineFor, type DashboardResponse } from '@tms/shared';
import { Banner, Button, CardSkeleton, Chip, EmptyState, ErrorState, Icon, ProcessTimeline, StatusChip, Skeleton, toneFor, useToast } from '@/components/m3';
import { Fab } from '@/components/shell/AppShell';
import { AccountButton, NotificationsButton, TopBar } from '@/components/shell/TopBar';
import { useIsMobile } from '@/lib/hooks';
import { useCreateTravelRequest, useDashboard } from '@/lib/queries';
import './dashboard.css';

type Req = DashboardResponse['myRequests'][number];

function requestTone(r: Req) {
  const meta = STATUS_META[r.status] as (typeof STATUS_META)[keyof typeof STATUS_META] | undefined;
  return meta?.tone ?? toneFor(String(r.status));
}

function useNewRequest() {
  const create = useCreateTravelRequest();
  const router = useRouter();
  const { error } = useToast();
  const start = () => {
    if (create.isPending) return;
    create.mutate(
      {},
      {
        onSuccess: (d) => router.push(`/requests/${d.request.id}/edit`),
        onError: (e) => error(e, 'Could not create a draft'),
      },
    );
  };
  return { start, busy: create.isPending };
}

function liquidateHref(d: DashboardResponse): string {
  const blocker = d.blockers[0];
  if (blocker) return `/liquidations/${blocker.liquidationId}`;
  const due = d.liquidationsDue[0];
  if (due) return `/liquidations/${due.id}`;
  return '/trips';
}

export function DashboardScreen() {
  const mobile = useIsMobile();
  const q = useDashboard();
  if (q.isLoading) {
    return (
      <div className="page page--dashboard dash">
        <Skeleton h={36} w={280} />
        <div className="row g12 wrap">
          <Skeleton h={48} w={200} r={100} />
          <Skeleton h={48} w={160} r={100} />
          <Skeleton h={48} w={160} r={100} />
        </div>
        <div className="dash__grid">
          <div className="dash__main">
            <CardSkeleton h={220} />
          </div>
          <div className="dash__side">
            <CardSkeleton h={120} lines={1} />
            <CardSkeleton h={140} />
          </div>
        </div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="page page--dashboard">
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      </div>
    );
  }
  return mobile ? <MobileDashboard data={q.data} /> : <DesktopDashboard data={q.data} />;
}

/* ---------------- Desktop (1a) ---------------- */

function DesktopDashboard({ data }: { data: DashboardResponse }) {
  const { start, busy } = useNewRequest();
  const trip = data.currentTrip;
  return (
    <div className="page page--dashboard dash">
      <TopBar title={`Hello, ${data.greetingName}`} subtitle={[fmtLongDay(data.today), data.dutyStationName, data.unitName].filter(Boolean).join(' · ')} />

      <div className="dash__quick">
        <button type="button" className="m3-quick m3-quick--primary" onClick={start} disabled={busy} aria-busy={busy}>
          {busy ? <span className="m3-btn__spinner" /> : <Icon name="add" size={20} />}
          New travel request
        </button>
        <Link href="/fleet?book=1" className="m3-quick">
          <Icon name="directions_car" size={20} />
          Book a vehicle
        </Link>
        <Link href="/claims/new" className="m3-quick">
          <Icon name="route" size={20} />
          Mileage claim
        </Link>
        <Link href={liquidateHref(data)} className="m3-quick">
          <Icon name="receipt_long" size={20} />
          Liquidate a trip
        </Link>
      </div>

      {data.blockers.map((b) => (
        <Banner
          key={b.liquidationId}
          tone="error"
          title={`Liquidation overdue — ${b.requestId} · ${b.title}`}
          body={`Due ${fmtDate(b.dueDate)} (5 days after return). New advances are blocked until this trip is liquidated.`}
          action={
            <Link href={`/liquidations/${b.liquidationId}`} className="m3-btn m3-btn--danger" style={{ padding: '10px 22px', fontSize: 13.5 }}>
              Liquidate now
            </Link>
          }
        />
      ))}

      <div className="dash__grid">
        <div className="dash__main">
          <div className="dash-trip">
            <div className="dash-trip__head">
              <span className="dash-trip__title">Current trip</span>
              {trip ? <StatusChip status={trip.status} /> : null}
              {trip ? (
                <Link href={`/trips/${trip.id}`} className="dash-trip__link">
                  Open trip workspace →
                </Link>
              ) : null}
            </div>
            {trip ? (
              <>
                <div className="dash-trip__row">
                  <div className="dash-trip__tile">
                    <Icon name="flight_takeoff" filled size={26} />
                  </div>
                  <div className="grow">
                    <div className="dash-trip__name">
                      {trip.id} · {trip.activityTitle || 'Untitled trip'}
                    </div>
                    <div className="dash-trip__meta">{tripMeta(trip)}</div>
                  </div>
                  <AdvanceFigure trip={trip} />
                </div>
                <div className="dash-trip__timeline">
                  <ProcessTimeline items={timelineFor(trip.status)} />
                </div>
              </>
            ) : (
              <EmptyState
                icon="flight_takeoff"
                title="No active trip"
                body="Your next approved trip will appear here with its arrangements, advance and liquidation progress."
                action={
                  <Button variant="tonal" size="sm" icon="add" onClick={start} loading={busy}>
                    New request
                  </Button>
                }
              />
            )}
          </div>
        </div>

        <div className="dash__side">
          <div className="dash-year">
            <div className="dash-year__label">MY YEAR SO FAR</div>
            <div className="dash-year__row">
              <div>
                <div className="dash-year__value">{data.yearStats.trips}</div>
                <div className="dash-year__k">Trips</div>
              </div>
              <div>
                <div className="dash-year__value">{data.yearStats.nights}</div>
                <div className="dash-year__k">Nights</div>
              </div>
              <div>
                <div className="dash-year__value">{formatZMW(data.yearStats.spend, { compact: true })}</div>
                <div className="dash-year__k">Travel spend</div>
              </div>
            </div>
          </div>
          <div className="dash-reqs">
            <div className="dash-reqs__title">My requests</div>
            {data.myRequests.length ? (
              <div className="dash-reqs__list">
                {data.myRequests.map((r) => (
                  <Link key={`${r.kind}-${r.id}`} href={r.href} className="dash-reqs__item">
                    <Chip tone={requestTone(r)}>{r.statusLabel}</Chip>
                    <span className="truncate">
                      {shortRef(r.ref)} · {r.title}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="t-caption">No requests yet — start with a new travel request.</div>
            )}
            <div className="mt12">
              <Link href="/requests" className="t-caption t-primary" style={{ fontWeight: 650 }}>
                All requests →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function tripMeta(trip: NonNullable<DashboardResponse['currentTrip']>): string {
  const it = trip.itinerary;
  const parts: string[] = [];
  if (it.departAt && it.returnAt) parts.push(fmtRange(it.departAt, it.returnAt));
  parts.push(plural(it.nights, 'night'));
  if (trip.projectId) parts.push(`Project ${trip.projectId}`);
  if (trip.costCentreId) parts.push(`Cost centre ${trip.costCentreId}`);
  return parts.join(' · ');
}

function AdvanceFigure({ trip }: { trip: NonNullable<DashboardResponse['currentTrip']> }) {
  const fin = trip.trip?.financials;
  const adv = trip.advance;
  const pct = fin?.advancePercentage ?? adv?.percentage ?? 75;
  const amount = fin?.advanceAmount ?? adv?.amount ?? 0;
  const paid = !!adv?.paidAt || !!adv?.milestones?.RELEASED;
  return (
    <div className="dash-trip__adv">
      <div className="dash-trip__adv-label">
        {paid ? 'Advance paid' : 'Advance'} ({pct}%)
      </div>
      <div className="dash-trip__adv-value">{formatZMW(amount)}</div>
    </div>
  );
}

/* ---------------- Mobile (1k) ---------------- */

function MobileDashboard({ data }: { data: DashboardResponse }) {
  const trip = data.currentTrip;
  const blocker = data.blockers[0];
  const snapHref = data.liquidationsDue[0] ? `/liquidations/${data.liquidationsDue[0].id}` : blocker ? `/liquidations/${blocker.liquidationId}` : trip?.trip?.liquidationId ? `/liquidations/${trip.trip.liquidationId}` : trip ? `/trips/${trip.id}?tab=documents` : '/trips';
  return (
    <div className="page dashm">
      <div className="dashm__greet">
        <div className="grow">
          <div className="dashm__hello">Muli bwanji, {data.greetingName}</div>
          <div className="dashm__sub">
            {data.dutyStationName} · {fmtDowDay(data.today)}
          </div>
        </div>
        <NotificationsButton />
        <AccountButton size="sm" />
      </div>

      {blocker ? (
        <Link href={`/liquidations/${blocker.liquidationId}`} className="dashm__banner" role="alert">
          <Icon name="error" filled size={22} color="var(--md-error)" />
          <div className="grow">
            <b>Liquidation overdue</b> — {shortRef(blocker.requestId)} {blocker.title}. Advances blocked until submitted.
          </div>
          <Icon name="chevron_right" size={18} />
        </Link>
      ) : null}

      <div className="dashm-trip">
        <div className="dashm-trip__head">
          <span>Current trip</span>
          {trip ? <StatusChip status={trip.status} size="xs" /> : null}
        </div>
        {trip ? (
          <>
            <div className="dashm-trip__meta">
              <b>
                {shortRef(trip.id)} · {trip.itinerary.destinationName?.split(' — ')[0] || trip.activityTitle || 'Trip'}
              </b>
              {trip.itinerary.departAt && trip.itinerary.returnAt ? ` · ${fmtRange(trip.itinerary.departAt, trip.itinerary.returnAt)}` : ''} · {plural(trip.itinerary.nights, 'night')}
            </div>
            <div className="mt14">
              <ProcessTimeline items={timelineFor(trip.status)} compact />
            </div>
            <div className="dashm-trip__ends">
              <span>Approved</span>
              <span className="ml-auto">Liquidation</span>
            </div>
            <div className="dashm-trip__actions">
              <Button variant="tonal" size="sm" href={`/trips/${trip.id}?tab=documents`}>
                Boarding pass
              </Button>
              <Button variant="outlined" size="sm" href={`/trips/${trip.id}`}>
                Trip workspace
              </Button>
            </div>
          </>
        ) : (
          <div className="dashm-trip__meta">No active trip. Tap + to start a new travel request.</div>
        )}
      </div>

      <div className="dashm__tiles">
        <Link href={snapHref} className="dashm-tile">
          <Icon name="photo_camera" filled size={22} color="var(--md-primary)" />
          <span>Snap a receipt</span>
        </Link>
        <Link href="/claims/new" className="dashm-tile">
          <Icon name="route" filled size={22} color="var(--md-primary)" />
          <span>Mileage claim</span>
        </Link>
        <Link href="/fleet?book=1" className="dashm-tile">
          <Icon name="directions_car" filled size={22} color="var(--md-primary)" />
          <span>Book vehicle</span>
        </Link>
      </div>

      <div className="dashm-reqs">
        <div className="dashm-reqs__title">My requests</div>
        {data.myRequests.length ? (
          data.myRequests.map((r) => (
            <Link key={`${r.kind}-${r.id}`} href={r.href} className="dashm-reqs__item">
              <Chip tone={requestTone(r)} size="xs">
                {r.statusLabel}
              </Chip>
              <span className="truncate">
                {shortRef(r.ref)} · {r.title}
              </span>
            </Link>
          ))
        ) : (
          <div className="t-caption">No requests yet.</div>
        )}
      </div>

      <Fab href="/requests/new" label="New travel request" />
    </div>
  );
}
