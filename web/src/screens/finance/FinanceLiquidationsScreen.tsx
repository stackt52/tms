'use client';
import { useRouter } from 'next/navigation';
import { calendarDaysBetween, fmtDay, formatZMW, shortRef, type Liquidation } from '@tms/shared';
import { Button, Card, CardSkeleton, Chip, EmptyState, ErrorState, humanize, toneFor } from '@/components/m3';
import { useFinanceLiquidations } from '@/lib/queries';
import { FinanceNav } from './FinanceNav';
import './finance.css';

const COLS = { liq: 2.4, trip: 1.1, due: 1.4, settle: 1.8, status: 1.2, action: 1.1 };

/** /finance/liquidations — submitted liquidations awaiting Finance review (review actions live on /liquidations/[id]). */
export function FinanceLiquidationsScreen() {
  const q = useFinanceLiquidations();
  const router = useRouter();
  const items = q.data?.items ?? [];
  return (
    <div className="page">
      <div className="fin-header">
        <div className="t-title">Liquidations</div>
        <div className="spacer" />
        <div className="t-body-sm t-muted">Submitted within 5 days of return · review, settle or return each one</div>
      </div>
      <FinanceNav />
      {q.isLoading ? (
        <div className="mt18">
          <CardSkeleton lines={4} h={240} />
        </div>
      ) : q.error ? (
        <Card className="mt18">
          <ErrorState error={q.error} retry={() => q.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card className="mt18">
          <EmptyState icon="receipt_long" title="No liquidations to review" body="Travellers' submitted liquidations will appear here." />
        </Card>
      ) : (
        <Card flush className="fin-table">
          <div className="tbl-scroll">
            <div>
              <div className="tbl-head">
                <span style={{ flex: COLS.liq }}>Liquidation / traveller</span>
                <span style={{ flex: COLS.trip }}>Trip</span>
                <span style={{ flex: COLS.due }}>Due</span>
                <span style={{ flex: COLS.settle }}>Settlement</span>
                <span style={{ flex: COLS.status }}>Status</span>
                <span style={{ flex: COLS.action }} />
              </div>
              {items.map((l) => (
                <LiqRow key={l.id} l={l} onOpen={() => router.push(`/liquidations/${l.id}`)} />
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function LiqRow({ l, onOpen }: { l: Liquidation; onOpen: () => void }) {
  const days = calendarDaysBetween(new Date(), l.dueDate);
  const overdue = days < 0 && l.status !== 'APPROVED' && l.status !== 'CLOSED';
  const rec = l.reconciliation;
  const settle =
    rec.direction === 'DUE_TO_EMPLOYEE' ? (
      <Chip tone="approved" icon="arrow_outward">
        Due to employee · {formatZMW(Math.abs(rec.settlement))}
      </Chip>
    ) : rec.direction === 'REFUND_TO_IHM' ? (
      <Chip tone="pending" icon="undo">
        Refund to IHM · {formatZMW(Math.abs(rec.settlement))}
      </Chip>
    ) : (
      <Chip tone="neutral">Balanced</Chip>
    );
  return (
    <div className="tbl-row tbl-row--clickable" onClick={onOpen}>
      <span style={{ flex: COLS.liq }}>
        <b>{shortRef(l.id)}</b> · {l.travellerName}
        <br />
        <span className="fin-sub">{l.tripTitle}</span>
      </span>
      <span style={{ flex: COLS.trip }}>{shortRef(l.requestId)}</span>
      <span style={{ flex: COLS.due, ...(overdue ? { color: 'var(--md-error)', fontWeight: 700 } : {}) }}>
        {fmtDay(l.dueDate)}
        <br />
        <span className="fin-sub" style={overdue ? { color: 'var(--md-error)' } : undefined}>
          {overdue ? `${Math.abs(days)} d overdue` : days === 0 ? 'due today' : `in ${days} d`}
        </span>
      </span>
      <span style={{ flex: COLS.settle }}>{settle}</span>
      <span style={{ flex: COLS.status }}>
        <Chip tone={l.status === 'RETURNED' ? 'blocked' : toneFor(l.status)}>{humanize(l.status)}</Chip>
      </span>
      <span style={{ flex: COLS.action }} onClick={(e) => e.stopPropagation()}>
        <Button variant="text" size="sm" href={`/liquidations/${l.id}`} trailingIcon="arrow_forward">
          Review
        </Button>
      </span>
    </div>
  );
}
