import type { DependencyKind, SystemType } from '@/lib/systems/dependencies'

// Piezas visuales compartidas por la lista de sistemas y la ficha (sin dependencias pesadas).

export const TYPE_STYLE: Record<SystemType, { bg: string; fg: string }> = {
  process: { bg: '#eff6ff', fg: '#1d4ed8' },
  utility: { bg: '#f0fdf4', fg: '#15803d' },
  safety:  { bg: '#fef2f2', fg: '#b91c1c' },
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
