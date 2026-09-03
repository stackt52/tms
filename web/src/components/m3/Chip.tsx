import type { ReactNode } from 'react';
import { STATUS_META, type RequestStatus, type Tone } from '@tms/shared';
import { Icon } from './Icon';

export type ChipTone = Tone | 'primary' | 'white' | 'faint' | 'dashed' | 'dashed-error';

export interface ChipProps {
  tone?: ChipTone;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: string;
  iconFilled?: boolean;
  regular?: boolean;
  file?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
  children: ReactNode;
}

export function Chip({ tone = 'neutral', size = 'sm', icon, iconFilled, regular, file, onClick, className = '', title, children }: ChipProps) {
  const cls = `m3-chip m3-chip--${tone} ${size !== 'sm' ? `m3-chip--${size}` : ''} ${regular ? 'm3-chip--regular' : ''} ${file ? 'm3-chip--file' : ''} ${onClick ? 'm3-chip--clickable' : ''} ${className}`;
  const iconSize = file ? 17 : size === 'lg' ? 16 : size === 'md' ? 15 : 14;
  const inner = (
    <>
      {icon ? <Icon name={icon} size={iconSize} filled={iconFilled} /> : null}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} title={title}>
        {inner}
      </button>
    );
  }
  return (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}

export function StatusChip({ status, size = 'md', label }: { status: RequestStatus; size?: ChipProps['size']; label?: string }) {
  const meta = STATUS_META[status];
  return (
    <Chip tone={meta.tone} size={size}>
      {label ?? meta.label}
    </Chip>
  );
}

/** Generic label → tone mapping for non-request statuses (liquidation, booking, mileage, external). */
export function toneFor(status: string): Tone {
  const s = status.toUpperCase();
  if (['DRAFT', 'CANCELLED', 'CLOSED', 'RETIRED', 'NOT_REQUESTED'].includes(s)) return 'neutral';
  if (['APPROVED', 'CONFIRMED', 'CLEAR', 'PAID', 'ACQUITTED', 'RELEASED', 'ACTIVE', 'AVAILABLE', 'LIQUIDATED', 'RETURNED_OK'].includes(s)) return 'approved';
  if (['IN_PROGRESS', 'READY_FOR_TRAVEL', 'CURRENT'].includes(s)) return 'active';
  if (['REJECTED', 'BLOCKED', 'OVERDUE', 'IN_SERVICE', 'MISSING', 'RETURNED_FOR_CORRECTION', 'EXPIRED'].includes(s)) return 'blocked';
  if (['SCHEDULED', 'INTERNATIONAL', 'REQUESTED', 'INFO'].includes(s)) return 'info';
  return 'pending';
}

export function humanize(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}
