'use client';
import { useCallback, useState, type KeyboardEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { ApprovalQueueItem } from '@tms/shared';
import { Avatar, Button, Card, CardSkeleton, Chip, EmptyState, ErrorState, Icon } from '@/components/m3';
import { useApprovalQueue } from '@/lib/queries';
import { useIsMobile } from '@/lib/hooks';
import { ApprovalDetail } from './ApprovalDetail';
import './approvals.css';

type Bucket = 'pending' | 'returned' | 'done';
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'returned', label: 'Returned' },
  { key: 'done', label: 'Done' },
];

/** 1c — Approval queue. Serves both /approvals (?selected=) and /approvals/[id]. */
export function ApprovalsScreen() {
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const routeId = typeof params?.id === 'string' ? params.id : undefined;
  const selectedId = search.get('selected') ?? routeId ?? null;
  const [bucketChoice, setBucketChoice] = useState<Bucket | null>(null);
  const stacked = useIsMobile(1023);
  const q = useApprovalQueue();

  const select = useCallback(
    (id: string | null) => {
      const url = id ? `/approvals?selected=${encodeURIComponent(id)}` : '/approvals';
      if (routeId) router.replace(url);
      else window.history.replaceState(null, '', url); // shallow — keeps the list mounted
    },
    [routeId, router],
  );

  const data = q.data;
  // Derived (not effect-driven): default to the bucket that contains the selected id, else Pending.
  const bucket: Bucket = bucketChoice ?? (selectedId && data ? (BUCKETS.find((b) => data[b.key].some((i) => i.id === selectedId))?.key ?? 'pending') : 'pending');
  const items = data?.[bucket] ?? [];
  const counts = data?.counts;

  const open = (item: ApprovalQueueItem) => {
    if (item.kind !== 'TRV') router.push(item.href);
    else select(item.id);
  };

  const showList = !stacked || !selectedId;
  const showDetail = !stacked || !!selectedId;

  return (
    <div className="page page--flush">
      <div className="apq">
        {showList ? (
          <aside className="apq__list" aria-label="Approval queue">
            <div className="apq__title">
              Approvals {counts?.pending ? <span className="apq__count">{counts.pending}</span> : null}
            </div>
            <div className="apq__tabs" role="tablist">
              {BUCKETS.map((b) => (
                <button key={b.key} type="button" role="tab" aria-selected={bucket === b.key} className={`apq__tab ${bucket === b.key ? 'apq__tab--active' : ''}`} onClick={() => setBucketChoice(b.key)}>
                  {b.label} {counts ? counts[b.key] : ''}
                </button>
              ))}
            </div>
            {q.isLoading ? (
              <>
                <CardSkeleton lines={1} h={96} />
                <CardSkeleton lines={1} h={96} />
                <CardSkeleton lines={1} h={96} />
              </>
            ) : q.error ? (
              <ErrorState error={q.error} retry={() => q.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState icon="fact_check" title={bucket === 'pending' ? 'Nothing waiting on you' : `No ${bucket} requests`} body={bucket === 'pending' ? 'Requests routed to your stage will appear here.' : undefined} />
            ) : (
              items.map((item) => <QueueCard key={`${item.kind}-${item.id}`} item={item} selected={item.id === selectedId} onOpen={() => open(item)} />)
            )}
          </aside>
        ) : null}
        {showDetail ? (
          <section className="apq__detail" aria-live="polite">
            {stacked ? (
              <div className="mb12">
                <Button variant="text" size="sm" icon="arrow_back" onClick={() => select(null)}>
                  All approvals
                </Button>
              </div>
            ) : null}
            {selectedId ? (
              <ApprovalDetail key={selectedId} id={selectedId} onDone={() => select(null)} />
            ) : (
              <EmptyState icon="fact_check" title="Select a request to review" body="Pick a request from the list to see its SOP checklist, approval chain and cost estimate." />
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function QueueCard({ item, selected, onOpen }: { item: ApprovalQueueItem; selected: boolean; onOpen: () => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <Card size="sm" selectable selected={selected} role="button" tabIndex={0} aria-pressed={selected} onClick={onOpen} onKeyDown={onKey}>
      <div className="row g10">
        <Avatar initials={item.requesterInitials} tone={item.avatarTone} size="sm" />
        <div className="grow">
          <div className="apq__card-name truncate">
            {item.requesterName} · {item.shortRef}
          </div>
          <div className="apq__card-sub truncate">{item.title}</div>
        </div>
        {item.kind !== 'TRV' ? <Icon name="arrow_outward" size={16} color="var(--md-outline)" title="Opens its own page" /> : null}
      </div>
      {item.tags.length ? (
        <div className="apq__tags">
          {item.tags.map((t, i) => (
            <Chip key={`${t.label}-${i}`} tone={t.tone} size="xs" regular={t.tone === 'neutral'}>
              {t.label}
            </Chip>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
