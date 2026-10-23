import type { DependencyKind, SystemType } from '@/lib/systems/dependencies'

// Piezas visuales compartidas por la lista de sistemas y la ficha (sin dependencias pesadas).

export const TYPE_STYLE: Record<SystemType, { bg: string; fg: string }> = {
  process: { bg: 'var(--primary-50)', fg: 'var(--primary-700)' },
  utility: { bg: 'var(--success-50)', fg: 'var(--success-700)' },
  safety:  { bg: 'var(--danger-50)',  fg: 'var(--danger-700)' },
}
export const KIND_LETTER: Record<DependencyKind, string> = { utility: 'U', process: 'P', other: 'O' }

export function TypeChip({ type, label }: { type: SystemType; label: string }) {
  const st = TYPE_STYLE[type]
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 'var(--text-xs)', fontWeight: 600, background: st.bg, color: st.fg }}>
      {label}
    </span>
  )
}
