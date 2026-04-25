'use client';

import { useState, type CSSProperties, type SelectHTMLAttributes } from 'react';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'style'> {
  selectSize?: SelectSize;
  invalid?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
}

const SIZE: Record<SelectSize, { height: number; padX: number; font: string }> = {
  sm: { height: 28, padX: 8,  font: 'var(--text-sm)' },
  md: { height: 36, padX: 12, font: 'var(--text-base)' },
  lg: { height: 44, padX: 14, font: 'var(--text-md)' },
};

export function Select({
  selectSize = 'md',
  invalid,
  fullWidth = true,
  style,
  onFocus,
  onBlur,
  disabled,
  children,
  ...rest
}: SelectProps) {
  const [focus, setFocus] = useState(false);
  const s = SIZE[selectSize];
  const borderColor = invalid ? 'var(--danger-500)' : (focus ? 'var(--primary-500)' : 'var(--border)');

  const merged: CSSProperties = {
    width: fullWidth ? '100%' : undefined,
    height: s.height,
    padding: `0 ${s.padX + 24}px 0 ${s.padX}px`,
    background: disabled ? 'var(--gray-100)' : 'var(--card-bg)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-strong)',
    border: `1px solid ${borderColor}`,
    borderRadius: 'var(--radius-md)',
    fontSize: s.font,
    fontFamily: 'inherit',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: focus ? 'var(--focus-ring)' : undefined,
    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `right ${s.padX}px center`,
    backgroundSize: '12px',
    ...style,
  };

  return (
    <select
      {...rest}
      disabled={disabled}
      style={merged}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
    >
      {children}
    </select>
  );
}
