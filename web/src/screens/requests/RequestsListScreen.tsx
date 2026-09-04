'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ACTIVE_TRIP_STATUSES, REVIEW_STATUSES, TRAVEL_CATEGORY_LABELS, fmtRange, plural, type RequestStatus, type TravelRequest } from '@tms/shared';
import { Button, CardSkeleton, Dialog, EmptyState, ErrorState, Icon, IconButton, PageHeader, PillTabs, StatusChip, useToast } from '@/components/m3';
import { useCreateTravelRequest, useDeleteTravelRequest, useTravelRequests } from '@/lib/queries';
import './requests.css';

type Filter = 'all' | 'drafts' | 'review' | 'approved' | 'closed';

const DRAFT_LIKE: RequestStatus[] = ['DRAFT', 'RETURNED_FOR_CORRECTION'];
const CLOSED_LIKE: RequestStatus[] = ['LIQUIDATED', 'CLOSED', 'REJECTED', 'CANCELLED'];

function bucket(s: RequestStatus): Exclude<Filter, 'all'> {
  if (DRAFT_LIKE.includes(s)) return 'drafts';
  if (REVIEW_STATUSES.includes(s)) return 'review';
  if (ACTIVE_TRIP_STATUSES.includes(s)) return 'approved';
  if (CLOSED_LIKE.includes(s)) return 'closed';
  return 'review';
}

export function requestHref(r: Pick<TravelRequest, 'id' | 'status'>): string {
  return r.status === 'DRAFT' ? `/requests/${r.id}/edit` : `/requests/${r.id}`;
}

export function requestMeta(r: TravelRequest): string {
  const it = r.itinerary;
  const parts: string[] = [];
  if (r.category) parts.push(TRAVEL_CATEGORY_LABELS[r.category]);
  if (it.destinationName) parts.push(it.destinationName);
  if (it.departAt && it.returnAt) parts.push(`${fmtRange(it.departAt, it.returnAt)} · ${plural(it.nights, 'night')}`);
  if (r.projectId) parts.push(r.projectId);
  return parts.join(' · ');
}

export function RequestsListScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const q = useTravelRequests({ scope: 'mine', limit: 200 });
  const create = useCreateTravelRequest();
  const router = useRouter();
  const { error } = useToast();

  const items = useMemo(() => {
    const all = q.data?.items ?? [];
    return [...all].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [q.data]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, drafts: 0, review: 0, approved: 0, closed: 0 };
    for (const r of items) c[bucket(r.status)]++;
    return c;
  }, [items]);
  const visible = filter === 'all' ? items : items.filter((r) => bucket(r.status) === filter);

  const startNew = () =>
    create.mutate({}, { onSuccess: (d) => router.push(`/requests/${d.request.id}/edit`), onError: (e) => error(e, 'Could not create a draft') });

  return (
    <div className="page">
      <PageHeader
        title="My travel requests"
        subtitle="Drafts, requests in review and approved trips."
        actions={
          <Button icon="add" onClick={startNew} loading={create.isPending}>
            New travel request
          </Button>
        }
      />
      <div className="mt18">
        <PillTabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'drafts', label: 'Drafts', count: counts.drafts },
            { value: 'review', label: 'In review', count: counts.review },
            { value: 'approved', label: 'Approved', count: counts.approved },
            { value: 'closed', label: 'Closed', count: counts.closed },
          ]}
        />
      </div>

      {q.isLoading ? (
        <div className="req-list">
          <CardSkeleton h={70} lines={1} />
          <CardSkeleton h={70} lines={1} />
          <CardSkeleton h={70} lines={1} />
        </div>
      ) : q.isError ? (
        <div className="mt18">
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        </div>
      ) : visible.length === 0 ? (
        <div className="m3-card mt18">
          <EmptyState
            icon="luggage"
            title={filter === 'all' ? 'No travel requests yet' : 'Nothing here'}
            body={filter === 'all' ? 'Start a guided travel request — it autosaves as you go.' : 'Try another filter.'}
            action={
              filter === 'all' ? (
                <Button variant="tonal" size="sm" icon="add" onClick={startNew} loading={create.isPending}>
                  New travel request
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="req-list">
          {visible.map((r) => (
            <Link key={r.id} href={requestHref(r)} className="req-card">
              <StatusChip status={r.status} />
              <div className="grow">
                <div className="req-card__title">
                  {r.id} · {r.activityTitle || 'Untitled request'}
                </div>
                <div className="req-card__meta">{requestMeta(r) || 'Draft — continue in the wizard'}</div>
              </div>
              {r.status === 'DRAFT' ? <DraftDeleteButton request={r} /> : null}
              <Icon name="chevron_right" size={22} color="var(--md-outline)" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Trash action on draft rows; stops the row link from navigating and confirms before deleting. */
function DraftDeleteButton({ request }: { request: TravelRequest }) {
  const [open, setOpen] = useState(false);
  const del = useDeleteTravelRequest(request.id);
  const { success, error } = useToast();
  return (
    <span
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{ display: 'inline-flex' }}
    >
      <IconButton icon="delete" label={`Delete draft ${request.id}`} onClick={() => setOpen(true)} />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this draft?"
        subtitle={`${request.id} · ${request.activityTitle || 'Untitled request'} will be removed permanently.`}
        actions={
          <>
            <Button variant="text" onClick={() => setOpen(false)}>
              Keep draft
            </Button>
            <Button
              variant="danger"
              icon="delete"
              loading={del.isPending}
              onClick={() =>
                del.mutate(undefined, {
                  onSuccess: () => {
                    success(`Draft ${request.id} deleted`);
                    setOpen(false);
                  },
                  onError: (e) => error(e, 'Could not delete draft'),
                })
              }
            >
              Delete draft
            </Button>
          </>
        }
      />
    </span>
  );
}
