'use client';
import Link from 'next/link';
import { fmtRange, formatZMW, plural, shortRef, type ExternalPaymentRequest } from '@tms/shared';
import { Button, Card, CardSkeleton, Chip, EmptyState, ErrorState, Icon, humanize, toneFor } from '@/components/m3';
import { useExternalPayments } from '@/lib/queries';
import { FinanceNav } from './FinanceNav';
import './finance.css';

const COLS = { status: 1.5, req: 2.6, dates: 1.5, people: 1.1, total: 1.2, go: 0.4 };

export function externalStatusTone(status: ExternalPaymentRequest['status']) {
  return status === 'RETURNED' ? 'blocked' : toneFor(status);
}

/** /finance/external-payments — list of EXT requests. */
export function ExternalPaymentsListScreen() {
  const q = useExternalPayments();
  const items = q.data?.items ?? [];
  const cta = (
    <Button icon="add" href="/finance/external-payments/new">
      New external payment request
    </Button>
  );
  return (
    <div className="page">
      <div className="fin-header">
        <div>
          <div className="t-title">External-party payments</div>
          <div className="t-body-sm t-muted mt4">DSA, lunch and transport for non-IHM participants · bank transfer &amp; mobile money only</div>
        </div>
        <div className="spacer" />
        {cta}
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
          <EmptyState icon="groups" title="No external-party payment requests yet" body="Create one for a workshop or training where non-IHM participants receive DSA, lunch or transport." action={cta} />
        </Card>
      ) : (
        <Card flush className="fin-table">
          <div className="tbl-scroll">
            <div>
              <div className="tbl-head">
                <span style={{ flex: COLS.status }}>Status</span>
                <span style={{ flex: COLS.req }}>Request</span>
                <span style={{ flex: COLS.dates }}>Dates</span>
                <span style={{ flex: COLS.people }}>Participants</span>
                <span style={{ flex: COLS.total }}>Total</span>
                <span style={{ flex: COLS.go }} />
              </div>
              {items.map((p) => (
                <Link key={p.id} href={`/finance/external-payments/${p.id}`} className="tbl-row tbl-row--clickable fin-row-link">
                  <span style={{ flex: COLS.status }}>
                    <Chip tone={externalStatusTone(p.status)}>{humanize(p.status)}</Chip>
                  </span>
                  <span style={{ flex: COLS.req }}>
                    <b>{shortRef(p.id)}</b> · {p.activityTitle}
                    <br />
                    <span className="fin-sub">
                      {p.activityLocationName} · {p.requesterName} ({p.costCentreId})
                    </span>
                  </span>
                  <span style={{ flex: COLS.dates }}>{fmtRange(p.startDate, p.endDate)}</span>
                  <span style={{ flex: COLS.people }}>{plural(p.participants.length, 'participant')}</span>
                  <span style={{ flex: COLS.total, fontWeight: 700 }}>{formatZMW(p.totals.total)}</span>
                  <span style={{ flex: COLS.go, textAlign: 'right' }}>
                    <Icon name="chevron_right" size={20} color="var(--md-outline)" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
