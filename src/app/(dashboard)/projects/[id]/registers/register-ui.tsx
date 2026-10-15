'use client'

import { useTranslations } from 'next-intl'
import type { RegisterKind, RegisterStatus } from '@/lib/registers/catalog'

// Piezas compartidas de los registros controlados (fase 3): etiqueta de estado según el tipo
// (una ciega «instalada», un bypass «en bypass») y chip de color por estado.

export const STATUS_STYLE: Record<RegisterStatus, { bg: string; fg: string; border: string }> = {
  proposed:   { bg: 'var(--gray-50)',    fg: 'var(--text-muted)',  border: 'var(--border)' },
  authorized: { bg: '#eff6ff',           fg: '#1d4ed8',            border: '#93c5fd' },
  active:     { bg: '#fffbeb',           fg: '#b45309',            border: '#fcd34d' },
  removed:    { bg: '#f5f3ff',           fg: '#6d28d9',            border: '#c4b5fd' },
  verified:   { bg: 'var(--success-50)', fg: 'var(--success-700)', border: '#a7f3d0' },
  cancelled:  { bg: 'var(--gray-50)',    fg: 'var(--gray-400)',    border: 'var(--border)' },
}

export function useStatusLabel() {
  const t = useTranslations('Registers')
  return (kind: RegisterKind, status: RegisterStatus) =>
    t.has(`statusByKind.${kind}.${status}`) ? t(`statusByKind.${kind}.${status}`) : t(`status.${status}`)
}

export function StatusChip({ kind, status }: { kind: RegisterKind; status: RegisterStatus }) {
  const label = useStatusLabel()
  const st = STATUS_STYLE[status]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap',
      background: st.bg, color: st.fg, border: `1px solid ${st.border}`,
      textDecoration: status === 'cancelled' ? 'line-through' : undefined,
    }}>
      {label(kind, status)}
    </span>
  )
}

export const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
export const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
export const label: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }
export const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)', boxSizing: 'border-box',
}
export const linkStyle: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--primary-600, #2563eb)', textDecoration: 'none', fontWeight: 500 }
export const btn = (variant: 'primary' | 'outline' | 'danger', disabled = false): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  border: variant === 'outline' ? '1px solid var(--border)' : 'none',
  background: variant === 'primary' ? 'var(--primary-500)' : variant === 'danger' ? 'var(--danger-500)' : 'transparent',
  color: variant === 'outline' ? 'var(--text-strong)' : '#fff',
})
