'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationsResponse, SearchResponse } from '@tms/shared';
import { Avatar, Button, Icon, IconButton } from '@/components/m3';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useDebounced } from '@/lib/hooks';

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return ref;
}

export function SearchPill({ placeholder = 'Search trips, requests, claims', width }: { placeholder?: string; width?: number | string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 350);
  const ref = useOutside(() => setOpen(false));
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['search', dq],
    queryFn: () => api<SearchResponse>('/search', { query: { q: dq } }),
    enabled: dq.trim().length >= 2,
  });
  return (
    <div className="topbar__search" ref={ref} style={{ width }}>
      <Icon name="search" size={20} />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-label="Search"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && data?.results[0]) {
            router.push(data.results[0].href);
            setOpen(false);
          }
        }}
      />
      {open && dq.trim().length >= 2 ? (
        <div className="search-pop">
          {data?.results.length ? (
            data.results.map((r) => (
              <Link key={`${r.kind}-${r.id}`} href={r.href} className="search-pop__item" onClick={() => setOpen(false)}>
                <div className="search-pop__kind">{r.kind}</div>
                <div style={{ fontWeight: 650 }}>{r.title}</div>
                <div className="t-caption">{r.subtitle}</div>
              </Link>
            ))
          ) : (
            <div className="search-pop__item t-muted">{data ? 'No matches' : 'Searching…'}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api<NotificationsResponse>('/notifications'), refetchInterval: 60_000 });
  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };
  const markOne = async (id: string) => {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <IconButton icon="notifications" label="Notifications" badge={data?.unread} onClick={() => setOpen((o) => !o)} />
      {open ? (
        <div className="notif-pop">
          <div className="row g8" style={{ padding: '4px 8px 10px' }}>
            <div className="t-card-title-sm">Notifications</div>
            <div className="spacer" />
            {data?.unread ? (
              <Button variant="text" size="xs" onClick={markAll}>
                Mark all read
              </Button>
            ) : null}
          </div>
          {data?.items.length ? (
            data.items.map((n) => (
              <Link key={n.id} href={n.link ?? '#'} className={`notif-item ${n.read ? '' : 'notif-item--unread'}`} onClick={() => void markOne(n.id)}>
                <div className="notif-item__title">{n.title}</div>
                <div className="t-muted">{n.body}</div>
              </Link>
            ))
          ) : (
            <div className="notif-item t-muted">You’re all caught up.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AccountButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const router = useRouter();
  if (!me) return null;
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Account menu" style={{ display: 'block', borderRadius: '50%' }}>
        <Avatar initials={me.user.initials} tone={me.user.avatarTone} size={size} />
      </button>
      {open ? (
        <div className="account-pop">
          <div className="row g12">
            <Avatar initials={me.user.initials} tone={me.user.avatarTone} />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{me.user.displayName}</div>
              <div className="t-caption truncate">{me.user.email}</div>
            </div>
          </div>
          <div className="t-caption mt10" style={{ lineHeight: 1.5 }}>
            {me.user.roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(' · ')}
          </div>
          <div className="row g8 mt14">
            <Button variant="outlined" size="sm" icon="logout" onClick={() => logout().then(() => router.replace('/login'))}>
              Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Greeting header row used on the dashboard (desktop). */
export function TopBar({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="topbar">
      <div>
        <div className="t-display">{title}</div>
        {subtitle ? <div className="t-body t-muted" style={{ marginTop: 2 }}>{subtitle}</div> : null}
      </div>
      <div className="spacer" />
      {children}
      <span className="hide-mobile">
        <SearchPill />
      </span>
      <NotificationsButton />
      <AccountButton />
    </div>
  );
}
