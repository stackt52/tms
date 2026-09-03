'use client';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationsResponse } from '@tms/shared';
import { fmtStamp } from '@tms/shared';
import { Button, Card, CardSkeleton, EmptyState, ErrorState, Icon, PageHeader } from '@/components/m3';
import { api } from '@/lib/api';

export function NotificationsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<NotificationsResponse>('/notifications') });
  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };
  return (
    <div className="page">
      <PageHeader
        title="Notifications"
        subtitle="Workflow events for your requests, approvals, advances, bookings and liquidations."
        actions={
          q.data?.unread ? (
            <Button variant="tonal" size="sm" icon="done_all" onClick={markAll}>
              Mark all read
            </Button>
          ) : undefined
        }
      />
      <div className="mt18">
        {q.isLoading ? (
          <CardSkeleton lines={4} />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data?.items.length ? (
          <Card>
            <EmptyState icon="notifications_none" title="You’re all caught up" body="New approvals, payments and reminders will appear here." />
          </Card>
        ) : (
          <Card flush style={{ padding: '8px 8px' }}>
            {q.data.items.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? '#'}
                className={`notif-item ${n.read ? '' : 'notif-item--unread'}`}
                style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px' }}
                onClick={() => {
                  if (!n.read) void api(`/notifications/${n.id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
                }}
              >
                <Icon name={n.read ? 'notifications' : 'notifications_active'} filled={!n.read} size={22} color={n.read ? 'var(--md-outline)' : 'var(--md-primary)'} />
                <div className="grow">
                  <div className="notif-item__title">{n.title}</div>
                  <div className="t-body-sm t-muted">{n.body}</div>
                  <div className="t-caption-sm mt4">{fmtStamp(n.createdAt)}</div>
                </div>
                <Icon name="chevron_right" size={20} color="var(--md-outline)" />
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
