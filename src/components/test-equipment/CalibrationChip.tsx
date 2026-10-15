'use client'

import { useTranslations } from 'next-intl'
import type { CalibrationState } from '@/lib/test-equipment/calibration'

// Chip del estado de calibración de un equipo de prueba (fase 4 · bloque B).

export const CALIBRATION_STYLE: Record<CalibrationState, { bg: string; fg: string; border: string }> = {
  valid:    { bg: 'var(--success-50)', fg: 'var(--success-700)', border: '#a7f3d0' },
  expiring: { bg: '#fffbeb', fg: '#b45309', border: '#fcd34d' },
  expired:  { bg: 'var(--danger-50)', fg: 'var(--danger-700)', border: '#fecaca' },
  not_yet:  { bg: 'var(--gray-50)', fg: 'var(--text-muted)', border: 'var(--border)' },
}

export function CalibrationChip({ state }: { state: CalibrationState }) {
  const t = useTranslations('TestEquipment')
  const st = CALIBRATION_STYLE[state]
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}>
      {t(`state.${state}`)}
    </span>
  )
}
