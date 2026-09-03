import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export type CardTone = 'white' | 'dark' | 'primary' | 'secondary' | 'tertiary' | 'surface' | 'warning' | 'error';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: CardTone;
  size?: 'lg' | 'md' | 'sm';
  flush?: boolean;
  selectable?: boolean;
  selected?: boolean;
  title?: ReactNode;
  titleRight?: ReactNode;
  style?: CSSProperties;
  children?: ReactNode;
}

export function Card({ tone = 'white', size = 'lg', flush, selectable, selected, title, titleRight, className = '', children, ...rest }: CardProps) {
  const cls = `m3-card ${size !== 'lg' ? `m3-card--${size}` : ''} ${tone !== 'white' ? `m3-card--${tone}` : ''} ${flush ? 'm3-card--flush' : ''} ${selectable ? 'm3-card--selectable' : ''} ${selected ? 'm3-card--selected' : ''} ${className}`;
  return (
    <div className={cls} {...rest}>
      {title !== undefined ? (
        <div className="row g10" style={{ marginBottom: 14 }}>
          <div className="t-card-title">{title}</div>
          {titleRight ? (
            <>
              <div className="spacer" />
              {titleRight}
            </>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Uppercase caption label inside tonal/dark cards ("MY YEAR SO FAR", "FINANCIALS"). */
export function CardLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="m3-card__label" style={style}>
      {children}
    </div>
  );
}
