import { Icon } from './Icon';

export type TimelineState = 'done' | 'current' | 'upcoming' | 'rejected' | 'invalidated';

export function ProcessTimeline({ items, compact }: { items: { key: string; label: string; state: 'done' | 'current' | 'upcoming' }[]; compact?: boolean }) {
  return (
    <div className={`m3-ptl ${compact ? 'm3-ptl--compact' : ''}`} aria-label="Trip progress">
      {items.map((it, i) => (
        <div key={it.key} style={{ display: 'contents' }}>
          <div className={`m3-ptl__node m3-ptl__node--${it.state}`} title={it.label}>
            {it.state === 'done' ? <Icon name="check_circle" filled size={compact ? 17 : 20} color="var(--md-primary)" /> : <span className={`m3-ptl__dot m3-ptl__dot--${it.state}`} />}
            {!compact ? <span className="m3-ptl__label">{it.label}</span> : null}
          </div>
          {i < items.length - 1 ? <div className={`m3-ptl__bar ${it.state === 'done' ? 'm3-ptl__bar--done' : ''}`} /> : null}
        </div>
      ))}
    </div>
  );
}

export function ChainTimeline({ items }: { items: { key: string; label: string; state: TimelineState; meta?: string }[] }) {
  return (
    <div className="m3-chain">
      {items.map((it, i) => (
        <div key={it.key} style={{ display: 'contents' }}>
          <div className={`m3-chain__item m3-chain__item--${it.state}`}>
            {it.state === 'done' ? (
              <Icon name="check_circle" filled size={19} color="var(--md-primary)" />
            ) : it.state === 'rejected' || it.state === 'invalidated' ? (
              <Icon name={it.state === 'rejected' ? 'cancel' : 'history'} size={19} color="var(--md-error)" />
            ) : (
              <span className={`m3-chain__dot m3-chain__dot--${it.state}`} />
            )}
            <span>
              {it.label}
              {it.meta ? <span className="m3-chain__meta"> — {it.meta}</span> : null}
            </span>
          </div>
          {i < items.length - 1 ? <div className={`m3-chain__link ${it.state === 'done' ? 'm3-chain__link--done' : ''}`} /> : null}
        </div>
      ))}
    </div>
  );
}

/** Check list rows: filled check_circle when ok, red cancel when not (used for "Before you submit", policy checks). */
export function CheckList({ items, size = 18 }: { items: { key: string; label: string; ok: boolean }[]; size?: number }) {
  return (
    <div className="col g8" style={{ fontSize: 12.5 }}>
      {items.map((it) => (
        <div key={it.key} className="row g8">
          <Icon name={it.ok ? 'check_circle' : 'cancel'} filled={it.ok} size={size} color={it.ok ? 'var(--md-primary)' : 'var(--md-error)'} />
          <span style={it.ok ? undefined : { color: 'var(--md-error)', fontWeight: 650 }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
