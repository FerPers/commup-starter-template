'use client';

import { useState, type CSSProperties, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> {
  invalid?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
}

export function Textarea({
  invalid,
  fullWidth = true,
  rows = 4,
  style,
  onFocus,
  onBlur,
  disabled,
  ...rest
}: TextareaProps) {
  const [focus, setFocus] = useState(false);
  const borderColor = invalid ? 'var(--danger-500)' : (focus ? 'var(--primary-500)' : 'var(--border)');

  const merged: CSSProperties = {
    width: fullWidth ? '100%' : undefined,
    padding: '10px 12px',
    background: disabled ? 'var(--gray-100)' : 'var(--card-bg)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-strong)',
    border: `1px solid ${borderColor}`,
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)',
    fontFamily: 'inherit',
    outline: 'none',
    boxShadow: focus ? 'var(--focus-ring)' : undefined,
    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
    resize: 'vertical',
    minHeight: 80,
    ...style,
  };

  return (
    <textarea
      {...rest}
      rows={rows}
      disabled={disabled}
      style={merged}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
    />
  );
}
