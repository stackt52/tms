'use client';
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';

interface BaseProps {
  label: string;
  icon?: string;
  trailing?: ReactNode;
  hint?: string;
  error?: string;
  tinted?: boolean;
  /** Label/background match the page surface (used on tinted backgrounds like mobile). */
  onSurface?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export type TextFieldProps = BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style'>;

export function TextField({ label, icon, trailing, hint, error, tinted, onSurface, className = '', style, id, readOnly, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={`m3-field-wrap ${className}`} style={style}>
      <div className={`m3-field ${tinted || readOnly ? 'm3-field--tinted' : ''} ${error ? 'm3-field--error' : ''} ${onSurface ? 'm3-field--surface' : ''}`}>
        <label className="m3-field__label" htmlFor={inputId}>
          {label}
        </label>
        {icon ? <Icon name={icon} className="m3-field__icon" size={19} /> : null}
        <input id={inputId} className="m3-field__input" readOnly={readOnly} aria-invalid={!!error} {...rest} />
        {trailing}
      </div>
      {error ? <div className="m3-field__hint m3-field__hint--error">{error}</div> : hint ? <div className="m3-field__hint">{hint}</div> : null}
    </div>
  );
}

export type TextAreaProps = BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'style'>;

export function TextArea({ label, hint, error, tinted, onSurface, className = '', style, id, ...rest }: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={`m3-field-wrap ${className}`} style={style}>
      <div className={`m3-field m3-field--multiline ${tinted ? 'm3-field--tinted' : ''} ${error ? 'm3-field--error' : ''} ${onSurface ? 'm3-field--surface' : ''}`}>
        <label className="m3-field__label" htmlFor={inputId}>
          {label}
        </label>
        <textarea id={inputId} className="m3-field__input" rows={3} aria-invalid={!!error} {...rest} />
      </div>
      {error ? <div className="m3-field__hint m3-field__hint--error">{error}</div> : hint ? <div className="m3-field__hint">{hint}</div> : null}
    </div>
  );
}

export type SelectFieldProps = BaseProps & {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'style'>;

export function SelectField({ label, icon, hint, error, tinted, onSurface, options, placeholder, className = '', style, id, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={`m3-field-wrap ${className}`} style={style}>
      <div className={`m3-field ${tinted ? 'm3-field--tinted' : ''} ${error ? 'm3-field--error' : ''} ${onSurface ? 'm3-field--surface' : ''}`}>
        <label className="m3-field__label" htmlFor={inputId}>
          {label}
        </label>
        {icon ? <Icon name={icon} className="m3-field__icon" size={19} /> : null}
        <select id={inputId} className="m3-field__input" aria-invalid={!!error} {...rest}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error ? <div className="m3-field__hint m3-field__hint--error">{error}</div> : hint ? <div className="m3-field__hint">{hint}</div> : null}
    </div>
  );
}

/** Read-only computed value styled like a tinted field ("Nights · 3 (auto)"). */
export function ReadonlyField({ label, children, className = '', style, onSurface }: { label: string; children: ReactNode; className?: string; style?: React.CSSProperties; onSurface?: boolean }) {
  return (
    <div className={`m3-field-wrap ${className}`} style={style}>
      <div className={`m3-field m3-field--readonly ${onSurface ? 'm3-field--surface' : ''}`}>
        <span className="m3-field__label" style={{ background: 'var(--md-surface)' }}>
          {label}
        </span>
        <div className="m3-field__value" style={{ fontWeight: 700 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
