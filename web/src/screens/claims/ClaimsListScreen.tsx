'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate, formatZMW } from '@tms/shared';
import { Button, Card, CardSkeleton, Chip, EmptyState, ErrorState, PageHeader, Segmented, humanize, toneFor } from '@/components/m3';
import { useMe } from '@/lib/auth-context';
import { useMileageClaims } from '@/lib/queries';
import './claims.css';

type Scope = 'mine' | 'review';

export function ClaimsListScreen() {
  const me = useMe();
  const router = useRouter();
  const canReview = me.capabilities.canApprove || me.capabilities.canSeeFinance;
  const [scope, setScope] = useState<Scope>('mine');
  const q = useMileageClaims({ scope });
  const items = q.data?.items ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Mileage claims"
        subtitle="Private-vehicle mileage within your province, reimbursed at the effective-dated rate."
        actions={
          <div className="row g12 wrap">
            {canReview ? (
              <Segmented<Scope>
                options={[
                  { value: 'mine', label: 'My claims' },
                  { value: 'review', label: 'For review' },
                ]}
                value={scope}
                onChange={setScope}
              />
            ) : null}
            <Button icon="add" href="/claims/new">
              New mileage claim
            </Button>
          </div>
        }
      />
      <div className="mt20">
        {q.isLoading ? (
          <CardSkeleton lines={4} h={220} />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon="route"
              title={scope === 'review' ? 'No claims awaiting review' : 'No mileage claims yet'}
              body={scope === 'review' ? 'Submitted claims from your team will appear here.' : 'Log a private-vehicle trip to claim mileage at ZMW per km.'}
              action={
                scope === 'mine' ? (
                  <Button variant="tonal" size="sm" icon="add" href="/claims/new">
                    New mileage claim
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card flush className="tbl-scroll">
            <div>
              <div className="tbl-head">
                <span style={{ flex: 2.4 }}>Claim</span>
                {scope === 'review' ? <span style={{ flex: 1.2 }}>Claimant</span> : null}
                <span style={{ flex: 1 }}>Date</span>
                <span style={{ flex: 0.8 }}>Distance</span>
                <span style={{ flex: 1 }}>Amount</span>
                <span style={{ flex: 1 }}>Status</span>
              </div>
              {items.map((c) => (
                <div key={c.id} className="tbl-row tbl-row--clickable claim-row" role="link" tabIndex={0} onClick={() => router.push(`/claims/${c.id}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/claims/${c.id}`)}>
                  <span style={{ flex: 2.4, minWidth: 0 }}>
                    <div style={{ fontWeight: 650 }} className="truncate">
                      {c.id} · {c.purpose || 'Untitled trip'}
                    </div>
                    <div className="t-caption-sm truncate">
                      {c.fromName} → {c.toName}
                    </div>
                  </span>
                  {scope === 'review' ? <span style={{ flex: 1.2 }}>{c.claimantName}</span> : null}
                  <span style={{ flex: 1 }}>{c.date ? fmtDate(c.date) : '—'}</span>
                  <span style={{ flex: 0.8 }}>{c.distanceKm.toLocaleString('en-ZM')} km</span>
                  <span style={{ flex: 1, fontWeight: 700 }}>{formatZMW(c.amount)}</span>
                  <span style={{ flex: 1 }}>
                    <Chip tone={toneFor(c.status)}>{humanize(c.status)}</Chip>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
