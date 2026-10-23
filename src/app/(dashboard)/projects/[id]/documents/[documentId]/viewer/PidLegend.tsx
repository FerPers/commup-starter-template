'use client'

import { useTranslations } from 'next-intl'
import { PIN_STATUS_COLORS } from '@/lib/pid/pins'
import type { ColorBy, SystemRef } from './types'

// Leyenda del visor: colorear por estado (semáforo) o por sistema; clic en un sistema lo aísla (los demás se
// atenúan). P1: el color de cada sistema es el suyo del proyecto (`systems.color`), igual en todos los planos.
export default function PidLegend({
  colorBy,
  onColorBy,
  systems,
  systemFilter,
  onSystemFilter,
}: {
  colorBy: ColorBy
  onColorBy: (mode: ColorBy) => void
  systems: SystemRef[]
  systemFilter: string | null
  onSystemFilter: (id: string | null) => void
}) {
  const t = useTranslations('PidDocuments')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t('viewer.colorBy')}
        </span>
        <div role="group" aria-label={t('viewer.colorBy')} style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['status', 'system'] as const).map(mode => (
            <button key={mode} type="button" aria-pressed={colorBy === mode}
              onClick={() => { onColorBy(mode); if (mode === 'status') onSystemFilter(null) }}
              style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: colorBy === mode ? 'var(--primary-500)' : 'var(--card-bg)', color: colorBy === mode ? '#fff' : 'var(--text-muted)' }}>
              {t(`viewer.colorBy_${mode}`)}
            </button>
          ))}
        </div>
      </div>
      {colorBy === 'system' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {systems.length === 0 && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('viewer.noSystems')}</span>}
          {systems.map(sys => {
            const active = systemFilter === sys.id
            return (
              <button key={sys.id} type="button" aria-pressed={active}
                onClick={() => onSystemFilter(active ? null : sys.id)}
                title={t('viewer.filterSystem')}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '3px 6px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                  border: active ? '1px solid var(--border)' : '1px solid transparent', background: active ? 'var(--gray-50)' : 'transparent',
                  opacity: systemFilter && !active ? 0.5 : 1 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: sys.color, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: '11px', color: 'var(--text-strong)', fontWeight: 600 }}>{sys.code}</span>
                {sys.name !== sys.code && <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sys.name}</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {([
            [PIN_STATUS_COLORS.punchA, t('viewer.legendPunchA')],
            [PIN_STATUS_COLORS.complete, t('viewer.legendComplete')],
            [PIN_STATUS_COLORS.progress, t('viewer.legendProgress')],
            [PIN_STATUS_COLORS.pending, t('viewer.legendPending')],
          ] as const).map(([color, label]) => (
            <div key={color} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
