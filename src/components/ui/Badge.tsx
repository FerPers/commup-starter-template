import type { CSSProperties, ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  dot?: boolean;
  style?: CSSProperties;
  title?: string;
}

const VARIANT: Record<BadgeVariant, { bg: string; fg: string; dot: string }> = {
  success: { bg: 'var(--success-50)', fg: 'var(--success-700)', dot: 'var(--success-500)' },
  warning: { bg: 'var(--warning-50)', fg: 'var(--warning-700)', dot: 'var(--warning-500)' },
  danger:  { bg: 'var(--danger-50)',  fg: 'var(--danger-700)',  dot: 'var(--danger-500)' },
  info:    { bg: 'var(--primary-50)', fg: 'var(--primary-700)', dot: 'var(--primary-500)' },
  neutral: { bg: 'var(--gray-100)',   fg: 'var(--gray-700)',    dot: 'var(--gray-500)' },
  accent:  { bg: 'var(--accent-50)',  fg: 'var(--accent-700)',  dot: 'var(--accent-500)' },
};

const SIZE: Record<BadgeSize, CSSProperties> = {
  sm: { padding: '2px 8px',  fontSize: 'var(--text-xs)', height: 20 },
  md: { padding: '4px 10px', fontSize: 'var(--text-sm)', height: 24 },
};

export function Badge({ variant = 'neutral', size = 'sm', children, dot, style, title }: BadgeProps) {
  const v = VARIANT[variant];
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: v.bg,
        color: v.fg,
        borderRadius: 'var(--radius-pill)',
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...SIZE[size],
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 6, height: 6, borderRadius: '50%', background: v.dot, flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
