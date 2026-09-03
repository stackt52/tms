'use client';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`m3-switch ${checked ? 'm3-switch--on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="m3-switch__thumb" />
    </button>
  );
}

export function CheckRow({ checked, onChange, children, disabled }: { checked: boolean; onChange?: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled || !onChange} className="m3-check" onClick={() => onChange?.(!checked)}>
      <Icon name={checked ? 'check_box' : 'check_box_outline_blank'} filled={checked} size={20} />
      <span>{children}</span>
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="m3-seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`m3-seg__item ${o.value === value ? 'm3-seg__item--active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PillTabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="m3-pilltabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`m3-pilltabs__item ${o.value === value ? 'm3-pilltabs__item--active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined ? ` ${o.count}` : ''}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ options, value, onChange, light }: { options: { value: T; label: string; badge?: number }[]; value: T; onChange: (v: T) => void; light?: boolean }) {
  return (
    <div className={`m3-tabs ${light ? 'm3-tabs--light' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`m3-tabs__item ${o.value === value ? 'm3-tabs__item--active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
          {o.badge !== undefined ? <span className="m3-tabs__badge">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ProgressSegments({ total, done }: { total: number; done: number }) {
  return (
    <div className="m3-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`m3-progress__seg ${i < done ? 'm3-progress__seg--done' : ''}`} />
      ))}
    </div>
  );
}
