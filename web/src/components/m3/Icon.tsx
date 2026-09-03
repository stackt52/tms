import type { CSSProperties } from 'react';

export interface IconProps {
  name: string;
  filled?: boolean;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/** Material Symbols Rounded. `filled` = FILL 1 (active/status), default outlined. */
export function Icon({ name, filled, size, color, className = '', style, title }: IconProps) {
  return (
    <span
      className={`${filled ? 'msf' : 'msr'} ${className}`}
      style={{ fontSize: size, color, ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {name}
    </span>
  );
}
