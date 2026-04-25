'use client';

import { useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> {
  inputSize?: InputSize;
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  style?: CSSProperties;
  wrapperStyle?: CSSProperties;
}

const SIZE: Record<InputSize, { height: number; padX: number; font: string }> = {
  sm: { height: 28, padX: 8,  font: 'var(--text-sm)' },
  md: { height: 36, padX: 12, font: 'var(--text-base)' },
  lg: { height: 44, padX: 14, font: 'var(--text-md)' },
};

export function Input({
  inputSize = 'md',
  invalid,
  leftIcon,
  rightIcon,
  fullWidth = true,
  style,
  wrapperStyle,
  onFocus,
  onBlur,
  disabled,
  ...rest
}: InputProps) {
  const [focus, setFocus] = useState(false);
  const s = SIZE[inputSize];
  const borderColor = invalid ? 'var(--danger-500)' : (focus ? 'var(--primary-500)' : 'var(--border)');

  const wrapper: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    width: fullWidth ? '100%' : undefined,
    height: s.height,
    paddingLeft: s.padX,
    paddingRight: s.padX,
    background: disabled ? 'var(--gray-100)' : 'var(--card-bg)',
    border: `1px solid ${borderColor}`,
    borderRadius: 'var(--radius-md)',
    boxShadow: focus ? 'var(--focus-ring)' : undefined,
    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
    ...wrapperStyle,
  };

  const input: CSSProperties = {
    flex: 1,
    minWidth: 0,
    height: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: disabled ? 'var(--text-muted)' : 'var(--text-strong)',
    fontSize: s.font,
    fontFamily: 'inherit',
    ...style,
  };

  return (
    <div style={wrapper}>
      {leftIcon && <span style={{ display: 'inline-flex', color: 'var(--text-muted)', flexShrink: 0 }}>{leftIcon}</span>}
      <input
        {...rest}
        disabled={disabled}
        style={input}
        onFocus={(e) => { setFocus(true); onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      />
      {rightIcon && <span style={{ display: 'inline-flex', color: 'var(--text-muted)', flexShrink: 0 }}>{rightIcon}</span>}
    </div>
  );
}
