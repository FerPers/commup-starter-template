'use client';

import { useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
  padding?: CardPadding;
  hoverable?: boolean;
  bordered?: boolean;
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  style?: CSSProperties;
  children: ReactNode;
}

const PADDING: Record<CardPadding, number | undefined> = {
  none: undefined,
  sm: 12,
  md: 20,
  lg: 28,
};

const SHADOW = {
  none: undefined,
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
} as const;

export function Card({
  padding = 'md',
  hoverable = false,
  bordered = true,
  elevation = 'sm',
  style,
  children,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: CardProps) {
  const [hover, setHover] = useState(false);

  const merged: CSSProperties = {
    background: 'var(--card-bg)',
    border: bordered ? '1px solid var(--border)' : 'none',
    borderRadius: 'var(--radius-lg)',
    padding: PADDING[padding],
    boxShadow: hoverable && hover ? SHADOW.md : SHADOW[elevation],
    transition: hoverable ? 'box-shadow 0.18s, transform 0.18s' : undefined,
    transform: hoverable && hover ? 'translateY(-1px)' : undefined,
    cursor: hoverable ? 'pointer' : undefined,
    ...style,
  };

  return (
    <div
      {...rest}
      style={merged}
      onMouseEnter={hoverable ? (e) => { setHover(true); onMouseEnter?.(e); } : onMouseEnter}
      onMouseLeave={hoverable ? (e) => { setHover(false); onMouseLeave?.(e); } : onMouseLeave}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}

export function CardHeader({ title, subtitle, action, style }: CardHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 16,
      ...style,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
