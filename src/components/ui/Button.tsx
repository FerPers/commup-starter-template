'use client';

import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  style?: CSSProperties;
}

const SIZE: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 'var(--text-sm)', height: 28 },
  md: { padding: '8px 16px', fontSize: 'var(--text-base)', height: 36 },
  lg: { padding: '10px 20px', fontSize: 'var(--text-md)', height: 44 },
};

function variantStyles(variant: ButtonVariant, hover: boolean, disabled: boolean): CSSProperties {
  if (disabled) {
    return {
      background: 'var(--gray-200)',
      color: 'var(--gray-500)',
      borderColor: 'var(--gray-200)',
      cursor: 'not-allowed',
    };
  }
  switch (variant) {
    case 'primary':
      return {
        background: hover ? 'var(--primary-700)' : 'var(--primary-600)',
        color: '#ffffff',
        borderColor: 'transparent',
      };
    case 'outline':
      return {
        background: hover ? 'var(--gray-50)' : 'transparent',
        color: 'var(--text-strong)',
        borderColor: 'var(--border)',
      };
    case 'ghost':
      return {
        background: hover ? 'var(--gray-100)' : 'transparent',
        color: 'var(--text-strong)',
        borderColor: 'transparent',
      };
    case 'danger':
      return {
        background: hover ? 'var(--danger-700)' : 'var(--danger-600)',
        color: '#ffffff',
        borderColor: 'transparent',
      };
  }
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const isDisabled = (disabled ?? false) || loading;

  const merged: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: '1px solid',
    borderRadius: 'var(--radius-md)',
    fontWeight: 500,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s',
    width: fullWidth ? '100%' : undefined,
    boxShadow: focus ? 'var(--focus-ring)' : undefined,
    outline: 'none',
    whiteSpace: 'nowrap',
    ...SIZE[size],
    ...variantStyles(variant, hover, !!isDisabled),
    ...style,
  };

  return (
    <button
      {...rest}
      disabled={isDisabled}
      style={merged}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
    >
      {loading ? (
        <span aria-hidden="true" style={{
          width: 14, height: 14, borderRadius: '50%',
          border: '2px solid currentColor', borderRightColor: 'transparent',
          animation: 'commup-spin 0.7s linear infinite',
        }} />
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
      <style>{'@keyframes commup-spin{to{transform:rotate(360deg)}}'}</style>
    </button>
  );
}
