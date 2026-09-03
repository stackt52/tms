'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ACTIVE_TRIP_STATUSES, fmtDate, fmtRange, formatZMW, plural, timelineFor, type TravelRequest, type Trip } from '@tms/shared';
import { Card, CardSkeleton, Chip, EmptyState, ErrorState, Icon, PageHeader, ProcessTimeline, Segmented, StatusChip } from '@/components/m3';
import { useDashboard, useTrips } from '@/lib/queries';
import './trips.css';

type Mode = 'active' | 'past';
type TripRow = TravelRequest & { trip: Trip | null };

export function TripsListScreen() {
  const [mode, setMode] = useState<Mode>('active');
  const q = useTrips();
  const dash = useDashboard();

  const rows = useMemo(() => {
    const all = q.data?.items ?? [];
    const filtered = all.filter((r) => (mode === 'active' ? ACTIVE_TRIP_STATUSES.includes(r.status) : !ACTIVE_TRIP_STATUSES.includes(r.status)));
    return filtered.sort((a, b) => {
      const da = a.itinerary.departAt ?? a.updatedAt;
      const db = b.itinerary.departAt ?? b.updatedAt;
      return mode === 'active' ? (da < db ? -1 : 1) : da < db ? 1 : -1;
    });
  }, [q.data, mode]);

  const liquidations = dash.data?.liquidationsDue ?? [];
  const blockers = dash.data?.blockers ?? [];

  return (
    <div className="page">
      <PageHeader
        title="My trips"
        subtitle="Approved travel, arrangements, advances and liquidation."
        actions={
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'past', label: 'Past' },
            ]}
          />
        }
      />

      {blockers.length || liquidations.length ? (
        <Card className="mt18" size="md" title="Liquidations" titleRight={<Chip tone={blockers.length ? 'blocked' : 'pending'}>{blockers.length ? `${blockers.length} overdue` : `${liquidations.length} due`}</Chip>}>
          {blockers.map((b) => (
            <Link key={b.liquidationId} href={`/liquidations/${b.liquidationId}`} className="liq-row">
              <Icon name="error" filled size={20} color="var(--md-error)" />
              <span className="grow">
                <b>{b.requestId}</b> · {b.title}
              </span>
              <Chip tone="blocked">{plural(b.daysOverdue, 'day')} overdue</Chip>
              <Icon name="chevron_right" size={20} color="var(--md-outline)" />
            </Link>
          ))}
          {liquidations.map((l) => (
            <Link key={l.id} href={`/liquidations/${l.id}`} className="liq-row">
              <Icon name="receipt_long" size={20} color="var(--md-primary)" />
              <span className="grow">
                <b>{l.requestId}</b> · {l.title}
              </span>
              <Chip tone={l.daysRemaining <= 1 ? 'blocked' : 'pending'}>{l.daysRemaining < 0 ? `${-l.daysRemaining} days overdue` : `Due in ${plural(l.daysRemaining, 'day')}`}</Chip>
              <Icon name="chevron_right" size={20} color="var(--md-outline)" />
            </Link>
          ))}
        </Card>
      ) : null}

      {q.isLoading ? (
        <div className="trip-list">
          <CardSkeleton h={120} />
          <CardSkeleton h={120} />
        </div>
      ) : q.isError ? (
        <div className="mt18">
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        </div>
      ) : rows.length === 0 ? (
        <div className="m3-card mt18">
          <EmptyState icon="luggage" title={mode === 'active' ? 'No active trips' : 'No past trips'} body={mode === 'active' ? 'Approved travel requests become trips here once the approval chain completes.' : 'Liquidated and closed trips will be listed here.'} />
        </div>
      ) : (
        <div className="trip-list">
          {rows.map((r) => (
            <TripCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function TripCard({ r }: { r: TripRow }) {
  const it = r.itinerary;
  const fin = r.trip?.financials;
  const pct = fin?.advancePercentage ?? r.advance?.percentage ?? 75;
  const amount = fin?.advanceAmount ?? r.advance?.amount ?? 0;
  return (
    <Link href={`/trips/${r.id}`} className="trip-card">
      <div className="trip-card__head">
        <StatusChip status={r.status} />
        <div className="grow">
          <div className="trip-card__title">
            {r.id} · {r.activityTitle || 'Untitled trip'}
          </div>
          <div className="trip-card__meta">
            {[it.departAt && it.returnAt ? fmtRange(it.departAt, it.returnAt) : null, plural(it.nights, 'night'), it.destinationName, fin?.liquidationDueDate ? `Liquidation due ${fmtDate(fin.liquidationDueDate)}` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="trip-card__adv">
          <div className="trip-card__adv-k">Advance ({pct}%)</div>
          <div className="trip-card__adv-v">{formatZMW(amount)}</div>
        </div>
      </div>
      <div className="trip-card__tl">
        <ProcessTimeline items={timelineFor(r.status)} />
      </div>
    </Link>
  );
}
