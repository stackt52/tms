import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Banner({ tone = 'error', icon, title, body, action, compact, children }: { tone?: 'error' | 'warning' | 'info' | 'success'; icon?: string; title?: ReactNode; body?: ReactNode; action?: ReactNode; compact?: boolean; children?: ReactNode }) {
  const defaultIcon = tone === 'error' ? 'error' : tone === 'warning' ? 'info' : tone === 'success' ? 'check_circle' : 'info';
  return (
    <div className={`m3-banner m3-banner--${tone} ${compact ? 'm3-banner--compact' : ''}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon ?? defaultIcon} filled={tone === 'error' || tone === 'success'} size={compact ? 22 : tone === 'warning' ? 19 : 26} className="m3-banner__icon" />
      <div className="grow">
        {title ? <div className="m3-banner__title">{title}</div> : null}
        {body ? <div className="m3-banner__body">{body}</div> : null}
        {children}
      </div>
      {action}
    </div>
  );
}
