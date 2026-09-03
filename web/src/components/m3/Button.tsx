'use client';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'outlined-warn' | 'text' | 'danger-text' | 'danger' | 'dark';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: string;
  iconFilled?: boolean;
  trailingIcon?: string;
  loading?: boolean;
  /** Shown instead of children while disabled (e.g. "Approve — 3 checks left"). */
  disabledLabel?: ReactNode;
  block?: boolean;
  href?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'filled',
  size = 'md',
  icon,
  iconFilled,
  trailingIcon,
  loading,
  disabled,
  disabledLabel,
  block,
  href,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconSize = size === 'xs' ? 16 : size === 'sm' ? 18 : 20;
  const cls = `m3-btn m3-btn--${variant} m3-btn--${size} ${block ? 'm3-btn--block' : ''} ${disabled || loading ? 'm3-btn--disabled' : ''} ${className}`;
  const content = (
    <>
      {loading ? <span className="m3-btn__spinner" /> : icon ? <Icon name={icon} size={iconSize} filled={iconFilled} /> : null}
      <span>{disabled && disabledLabel ? disabledLabel : children}</span>
      {trailingIcon ? <Icon name={trailingIcon} size={iconSize} /> : null}
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

export function IconButton({ icon, filled, badge, label, className = '', ...rest }: { icon: string; filled?: boolean; badge?: number; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`m3-iconbtn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} filled={filled} size={22} />
      {badge ? <span className="m3-iconbtn__badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
}
