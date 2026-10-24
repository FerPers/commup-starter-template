'use client'

import { useTranslations } from 'next-intl'
import { PIN_STATUS_COLORS } from '@/lib/pid/pins'
import { ROW_STATE_COLORS, ROW_STATE_ORDER } from '@/lib/pid/view'
import type { ColorBy, SystemRef, SystemStates } from './types'

// Leyenda del visor (P2, maqueta aprobada): «Sistemas en esta hoja» (por pines y marcas), con su color estable del
// proyecto (P1) y «Aislar» (los demás se atenúan). El conmutador Por sistema / Por estado colorea los pines (estado del
// tag) y, desde P3, las marcas (estado de la liberación siguiente del sistema). «Ver» encuadra el sistema en la hoja.
export default function PidLegend({
  colorBy,
  onColorBy,
  systems,
  counts,
  isolated,
  onIsolate,
  states,
  onFocus,
}: {
  colorBy: ColorBy
  onColorBy: (mode: ColorBy) => void
  systems: SystemRef[]
  counts: Map<string, { pins: number; markups: number }>
  isolated: string | null
  onIsolate: (id: string | null) => void
  states: SystemStates
  onFocus: (id: string) => void
}) {
  const t = useTranslations('PidDocuments')
  const tr = useTranslations('ControlTower')
  return (
    <section aria-labelledby="pid-legend-title" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <strong id="pid-legend-title" style={{ fontSize: 15, color: 'var(--text-strong)' }}>{t('markups.systemsOnSheet')}</strong>
        <div role="group" aria-label={t('viewer.colorBy')} style={{ display: 'inline-flex', padding: 2, borderRadius: 8, background: 'var(--gray-100)', alignSelf: 'flex-start' }}>
          {(['system', 'status'] as const).map(mode => {
            const on = colorBy === mode
            return (
              <button key={mode} type="button" aria-pressed={on} onClick={() => onColorBy(mode)}
                style={{ minHeight: 32, padding: '0 12px', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: on ? 'var(--card-bg)' : 'transparent', color: on ? 'var(--text-strong)' : 'var(--text-muted)' }}>
                {t(`markups.colorBy_${mode}`)}
              </button>
            )
          })}
        </div>
      </div>

      {systems.length === 0 && (
        <p style={{ margin: 0, padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{t('markups.noSystems')}</p>
      )}
      {systems.map(sys => {
        const on = isolated === sys.id
        const c = counts.get(sys.id) ?? { pins: 0, markups: 0 }
        const st = states[sys.id]
        const swatch = colorBy === 'status' ? (st ? ROW_STATE_COLORS[st.state] : 'var(--gray-300)') : sys.color
        return (
          <div key={sys.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', opacity: isolated && !on ? 0.5 : 1 }}>
            <span aria-hidden="true" style={{ width: 14, height: 36, borderRadius: 4, flexShrink: 0, background: swatch }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: 'var(--text-strong)' }}>{sys.code}</strong>
              {sys.name !== sys.code && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sys.name}</span>
              )}
              {colorBy === 'status' && st
                ? <span style={{ fontSize: 12, fontWeight: 600, color: ROW_STATE_COLORS[st.state] }}>{st.gate ? `${st.gate} · ` : ''}{tr(`rowState.${st.state}`)}</span>
                : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('markups.systemCounts', { markups: c.markups, pins: c.pins })}</span>}
            </div>
            <button type="button" onClick={() => onFocus(sys.id)} title={t('markups.focusHint')}
              style={{ minHeight: 36, padding: '0 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)' }}>
              {t('markups.focus')}
            </button>
            <button type="button" aria-pressed={on} onClick={() => onIsolate(on ? null : sys.id)}
              style={{ minHeight: 36, padding: '0 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--text-strong)' : 'var(--border)'}`, background: on ? 'var(--text-strong)' : 'var(--card-bg)', color: on ? 'var(--card-bg)' : 'var(--text-strong)' }}>
              {on ? t('markups.showAll') : t('markups.isolate')}
            </button>
          </div>
        )
      })}

      {colorBy === 'status' && (
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 5, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('markups.markupStatus')}</span>
          {ROW_STATE_ORDER.map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 14, height: 6, borderRadius: 3, background: ROW_STATE_COLORS[s], flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr(`rowState.${s}`)}</span>
            </div>
          ))}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('markups.pinStatus')}</span>
          {([
            [PIN_STATUS_COLORS.punchA, t('viewer.legendPunchA')],
            [PIN_STATUS_COLORS.complete, t('viewer.legendComplete')],
            [PIN_STATUS_COLORS.progress, t('viewer.legendProgress')],
            [PIN_STATUS_COLORS.pending, t('viewer.legendPending')],
          ] as const).map(([color, label]) => (
            <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
