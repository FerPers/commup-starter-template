import type { CSSProperties, ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}

export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: '48px 24px',
      textAlign: 'center',
      color: 'var(--text-muted)',
      ...style,
    }}>
      {icon && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56, height: 56,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--gray-100)',
          color: 'var(--gray-500)',
        }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: 'var(--text-sm)', maxWidth: 360, lineHeight: 1.5 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
