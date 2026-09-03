'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FINANCE_ROLES, fmtDay, formatZMW, hasAnyRole, liquidationDaysRemaining, plural, type Liquidation } from '@tms/shared';
import { Card, CardSkeleton, Chip, EmptyState, ErrorState, Icon, PageHeader, Segmented, humanize, toneFor } from '@/components/m3';
import { useMe } from '@/lib/auth-context';
import { useLiquidations } from '@/lib/queries';
import './liquidations.css';

type Scope = 'mine' | 'review';

function dueChip(l: Liquidation) {
  if (l.status !== 'OPEN' && l.status !== 'RETURNED') return null;
  const d = liquidationDaysRemaining(l.dueDate);
  return d >= 0 ? (
    <Chip tone="pending">
      {d === 0 ? 'Due today' : `Due in ${plural(d, 'day')}`} · {fmtDay(l.dueDate)}
    </Chip>
  ) : (
    <Chip tone="blocked">Overdue by {plural(-d, 'day')}</Chip>
  );
}

function settlementText(l: Liquidation, mine: boolean) {
  const r = l.reconciliation;
  if (r.direction === 'DUE_TO_EMPLOYEE') return `${mine ? 'Due to you' : `Due to ${l.travellerName}`} · ${formatZMW(r.settlement)}`;
  if (r.direction === 'REFUND_TO_IHM') return `Refund to IHM · ${formatZMW(-r.settlement)}`;
  return 'Balanced';
}

export function LiquidationsListScreen() {
  const me = useMe();
  const isFinance = me.capabilities.canSeeFinance || hasAnyRole(me.user.roles, FINANCE_ROLES);
  const [scope, setScope] = useState<Scope>('mine');
  const q = useLiquidations({ scope });
  const items = q.data?.items ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Liquidations"
        subtitle="Reconcile travel advances against actual spend within 5 days of returning."
        actions={
          isFinance ? (
            <Segmented<Scope>
              options={[
                { value: 'mine', label: 'My trips' },
                { value: 'review', label: 'For review' },
              ]}
              value={scope}
              onChange={setScope}
            />
          ) : undefined
        }
      />
      <div className="mt20">
        {q.isLoading ? (
          <CardSkeleton lines={4} h={220} />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon="receipt_long" title={scope === 'review' ? 'Nothing awaiting review' : 'No liquidations yet'} body={scope === 'review' ? 'Submitted liquidations will appear here for settlement.' : 'A liquidation opens automatically on the return date of each trip with an advance.'} />
          </Card>
        ) : (
          <Card flush>
            {items.map((l) => (
              <Link key={l.id} href={`/liquidations/${l.id}`} className="liq-item">
                <div className="grow">
                  <div className="row g10 wrap">
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{l.tripTitle}</span>
                    <Chip tone={toneFor(l.status)}>{humanize(l.status)}</Chip>
                    {dueChip(l)}
                  </div>
                  <div className="t-caption mt4">
                    {l.requestId} · {scope === 'review' ? `${l.travellerName} · ` : ''}returned {fmtDay(l.returnDate)} · {settlementText(l, scope === 'mine')}
                  </div>
                </div>
                <Icon name="chevron_right" size={22} color="var(--md-outline)" />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
