'use client';
import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

export function StatTile({ label, value, verdict, ok }: { label: string; value: ReactNode; verdict?: string; ok?: boolean }) {
  return (
    <div className="m3-stat">
      <div className="m3-stat__label">{label}</div>
      <div className="m3-stat__value">
        {value}
        {verdict ? <span className={ok === false ? 'm3-stat__bad' : 'm3-stat__ok'}> · {verdict}</span> : null}
      </div>
    </div>
  );
}

export function SummaryCard({ label, value, tone }: { label: string; value: ReactNode; tone?: 'pending' | 'blocked' }) {
  return (
    <div className={`m3-summary ${tone ? `m3-summary--${tone}` : ''}`}>
      <div className="m3-summary__label">{label}</div>
      <div className="m3-summary__value">{value}</div>
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 12, style }: { h?: number | string; w?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden />;
}

export function CardSkeleton({ lines = 3, h = 140 }: { lines?: number; h?: number }) {
  return (
    <div className="m3-card" style={{ minHeight: h }}>
      <Skeleton h={18} w="40%" />
      <div className="col g10 mt16">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} h={14} w={`${90 - i * 12}%`} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, body, action }: { icon?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="m3-empty">
      <div className="m3-empty__icon">
        <Icon name={icon} size={28} />
      </div>
      <div className="m3-empty__title">{title}</div>
      {body ? <div style={{ fontSize: 13, maxWidth: 380 }}>{body}</div> : null}
      {action ? <div className="mt8">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return <EmptyState icon="error" title="Could not load" body={msg} action={retry ? <Button variant="tonal" size="sm" icon="refresh" onClick={retry}>Try again</Button> : undefined} />;
}

export function Dialog({ open, onClose, title, subtitle, actions, wide, children }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; wide?: boolean; children?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="m3-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`m3-dialog ${wide ? 'm3-dialog--wide' : ''}`} role="dialog" aria-modal="true">
        <div className="m3-dialog__title">{title}</div>
        {subtitle ? <div className="t-caption mb12">{subtitle}</div> : null}
        {children}
        {actions ? <div className="m3-dialog__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function PageHeader({ title, chip, subtitle, actions, back }: { title: ReactNode; chip?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div>
      {back}
      <div className="row g12 wrap">
        <div className="t-title">{title}</div>
        {chip}
        {actions ? (
          <>
            <div className="spacer" />
            {actions}
          </>
        ) : null}
      </div>
      {subtitle ? <div className="t-body-sm t-muted mt4">{subtitle}</div> : null}
    </div>
  );
}

export function KV({ label, value, total, muted }: { label: ReactNode; value: ReactNode; total?: boolean; muted?: boolean }) {
  return (
    <div className={`kv ${total ? 'kv--total' : ''}`} style={muted ? { opacity: 0.75 } : undefined}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
