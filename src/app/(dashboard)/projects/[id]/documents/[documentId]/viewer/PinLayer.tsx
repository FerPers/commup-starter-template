'use client'

import { useTranslations } from 'next-intl'
import type { Pt } from '@/lib/pid/geometry'
import type { Hotspot } from './types'

// Capa de pines sobre la hoja: color = estado (semáforo) o sistema, glifo = disciplina. Posición en porcentaje de
// la página. También pinta el pin pendiente (antes de confirmar) con su ventanita.
// P4: un pin sobre el resalte de otro sistema lleva un anillo ámbar, y el pendiente lo avisa antes de confirmar
// (solo avisa: decisión de Luis 2026-10-23).
export default function PinLayer({
  pins,
  colorOf,
  dimmed,
  selectedId,
  onSelect,
  isTouch,
  pending,
  pendingBusy,
  onConfirmPending,
  onCancelPending,
  crossed,
  pendingWarning,
}: {
  pins: Hotspot[]
  colorOf: (h: Hotspot) => string
  dimmed: (h: Hotspot) => boolean
  selectedId: string | null
  onSelect: (h: Hotspot) => void
  isTouch: boolean
  pending: Pt | null
  pendingBusy: boolean
  onConfirmPending: () => void
  onCancelPending: () => void
  /** Pines que caen sobre el resalte de otro sistema: id → texto del aviso. */
  crossed?: Map<string, string>
  /** Aviso del pin por confirmar (cae sobre otro sistema). */
  pendingWarning?: string | null
}) {
  const t = useTranslations('PidDocuments')
  const pinSize = isTouch ? 28 : 20
  return (
    <>
      {pins.map(h => {
        const color = colorOf(h)
        const warn = crossed?.get(h.id)
        const label = `${h.tag.tag_number}${h.system ? ` · ${h.system.code}` : ''} · ${h.itr_completion_pct}% ITR${h.open_punches_a > 0 ? ` · ${h.open_punches_a} Cat A` : ''}${h.needs_review ? ` · ${t('viewer.needsReview')}` : ''}${warn ? ` · ${warn}` : ''}`
        return (
          <button
            type="button"
            key={h.id}
            onClick={() => onSelect(h)}
            title={label}
            aria-label={label}
            aria-pressed={selectedId === h.id}
            style={{
              padding: 0, font: 'inherit',
              position: 'absolute',
              left: `${h.x_pct}%`,
              top: `${h.y_pct}%`,
              transform: 'translate(-50%, -50%)',
              width: pinSize, height: pinSize,
              borderRadius: '50%',
              background: color,
              border: h.needs_review ? '2px dashed #f59e0b' : `2px solid white`,
              cursor: 'pointer',
              zIndex: 10,
              opacity: dimmed(h) ? 0.2 : 1,
              boxShadow: selectedId === h.id
                ? `0 0 0 3px color-mix(in srgb, ${color} 38%, transparent)`
                : warn ? '0 0 0 3px var(--warning-500), 0 2px 4px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'box-shadow 0.15s',
            }}
          >
            <span style={{ fontSize: isTouch ? '11px' : '8px', color: '#fff', fontWeight: 700, lineHeight: 1 }}>
              {h.discipline.code.substring(0, 1)}
            </span>
          </button>
        )
      })}

      {pending && (
        <div style={{
          position: 'absolute',
          left: `${pending.x}%`,
          top: `${pending.y}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
        }}>
          {/* Ghost pin */}
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: '#3b82f6', border: '2px solid white',
            boxShadow: '0 0 0 3px rgba(59,130,246,0.4)',
            marginBottom: '4px',
          }} />
          {/* Confirmation popover */}
          <div style={{
            position: 'absolute', top: '28px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--card-bg)', borderRadius: '8px', padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)', border: '1px solid var(--border)',
            display: 'flex', gap: '8px', whiteSpace: 'nowrap', flexWrap: 'wrap', justifyContent: 'center',
            width: pendingWarning ? 240 : undefined,
          }}>
            {pendingWarning && (
              <p role="alert" style={{ margin: 0, width: '100%', whiteSpace: 'normal', fontSize: 12, color: 'var(--warning-800)', background: 'var(--warning-50)', border: '1px solid var(--warning-300)', borderRadius: 6, padding: '6px 8px' }}>
                {pendingWarning}
              </p>
            )}
            <button
              onClick={e => { e.stopPropagation(); onConfirmPending() }}
              disabled={pendingBusy}
              style={{
                padding: '5px 12px', background: '#3b82f6', color: '#fff',
                border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
              }}
            >
              {pendingBusy ? '…' : t('viewer.confirm')}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onCancelPending() }}
              style={{
                padding: '5px 12px', background: 'var(--card-bg)', color: 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
              }}
            >
              {t('viewer.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
