'use client'

import { useTranslations } from 'next-intl'
import { NO_SYSTEM_COLOR } from '@/lib/systems/colors'
import { displayPoints, labelText, limitNormal, markupMetrics } from '@/lib/pid/markups'
import type { Pt } from '@/lib/pid/geometry'
import type { MarkupView, PageInfo, SystemRef } from './types'

// P2: capa SVG de las marcas LOSH sobre la hoja. viewBox = la página en puntos PDF (ya rotada), así que el SVG escala
// uniforme con el zoom, como la tinta del plano: el resalte tiene el grosor de la línea en el papel a cualquier zoom.
// Línea = trazo grueso y translúcido del color del sistema; límite = barra oscura con el código de cada lado;
// etiqueta = chip con el código. «Por revisar» (copiadas de la revisión anterior) = contorno ámbar punteado.

const INK = '#14213d'
const REVIEW = '#d48a1a'
const SELECT = '#1f5fbf'

type Chip = { cx: number; cy: number; text: string; fill: string }

function chipBox(text: string, font: number) {
  return { w: text.length * font * 0.62 + font * 0.9, h: font * 1.6 }
}

export default function MarkupLayer({
  page,
  markups,
  systems,
  selectedId,
  isolated,
  selectable,
  onSelect,
  draft,
  draftColor,
  hover,
  pendingLimit,
}: {
  page: PageInfo
  markups: MarkupView[]
  systems: Map<string, SystemRef>
  selectedId: string | null
  /** Sistema aislado en la leyenda: los demás se atenúan. */
  isolated: string | null
  /** Herramienta «Elegir»: las marcas reciben el clic. */
  selectable: boolean
  onSelect: (id: string) => void
  /** Línea en curso (unidad, rotación de la hoja abierta). */
  draft: Pt[]
  draftColor: string
  hover: Pt | null
  pendingLimit: { bar: [Pt, Pt]; system_id: string | null; other_system_id: string | null } | null
}) {
  const t = useTranslations('PidDocuments')
  const size = { w: page.w, h: page.h }
  const m = markupMetrics(size)
  const P = (p: Pt) => ({ x: p.x * size.w, y: p.y * size.h })
  const path = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * size.w).toFixed(2)} ${(p.y * size.h).toFixed(2)}`).join(' ')
  const colorOf = (id: string | null) => (id ? systems.get(id)?.color : undefined) ?? NO_SYSTEM_COLOR
  const codeOf = (id: string) => systems.get(id)?.code
  const dim = (mk: { system_id: string; other_system_id: string | null }) =>
    !!isolated && mk.system_id !== isolated && mk.other_system_id !== isolated

  // Chips de los dos lados de una barra: junto al extremo de arriba (barra vertical) o de la derecha (horizontal).
  function limitChips(bar: [Pt, Pt], left: string | null, right: string | null): Chip[] {
    const a = P(bar[0]), b = P(bar[1])
    const n = limitNormal(bar, size)
    const vertical = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x)
    const end = vertical ? (a.y <= b.y ? a : b) : (a.x >= b.x ? a : b)
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const len = Math.hypot(end.x - c.x, end.y - c.y) || 1
    const u = { x: (end.x - c.x) / len, y: (end.y - c.y) / len }
    const gap = m.font * 0.35
    const out: Chip[] = []
    for (const [code, sign] of [[left, -1], [right, 1]] as const) {
      if (!code) continue
      const box = chipBox(code, m.font)
      const along = (Math.abs(u.x) * box.w + Math.abs(u.y) * box.h) / 2 + gap
      const across = (Math.abs(n.x) * box.w + Math.abs(n.y) * box.h) / 2 + gap
      out.push({ cx: end.x + u.x * along + sign * n.x * across, cy: end.y + u.y * along + sign * n.y * across, text: code, fill: INK })
    }
    return out
  }

  function renderChip(c: Chip, key: string) {
    const box = chipBox(c.text, m.font)
    return (
      <g key={key}>
        <rect x={c.cx - box.w / 2} y={c.cy - box.h / 2} width={box.w} height={box.h} rx={m.font * 0.25} fill={c.fill} />
        <text x={c.cx} y={c.cy} fill="#fff" fontSize={m.font} fontWeight={700} textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{c.text}</text>
      </g>
    )
  }

  const lines = markups.filter(mk => mk.kind === 'line')
  const others = markups.filter(mk => mk.kind !== 'line')
  const selected = markups.find(mk => mk.id === selectedId) ?? null

  return (
    <svg
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t('markups.layerLabel', { count: markups.length })}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 6, pointerEvents: 'none', overflow: 'visible' }}
    >
      {/* Recorridos resaltados (debajo de todo, translúcidos). */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {lines.map(mk => {
          const pts = displayPoints(mk, page.rotation)
          const d = path(pts)
          return (
            <g key={mk.id}>
              <path d={d} stroke={colorOf(mk.system_id)} strokeWidth={m.highlight} opacity={dim(mk) ? 0.08 : 0.38} />
              {mk.needs_review && (
                <path d={d} stroke={REVIEW} strokeWidth={m.barStroke * 0.6} strokeDasharray={`${m.font} ${m.font * 0.6}`} />
              )}
              {selectable && (
                <path d={d} stroke="transparent" strokeWidth={m.hit * 2} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onSelect(mk.id) }}>
                  <title>{codeOf(mk.system_id) ?? ''}</title>
                </path>
              )}
            </g>
          )
        })}
      </g>

      {/* Límites y etiquetas. */}
      {others.map(mk => {
        const pts = displayPoints(mk, page.rotation)
        const op = dim(mk) ? 0.25 : 1
        if (mk.kind === 'limit' && pts.length === 2) {
          const bar = pts as [Pt, Pt]
          const a = P(bar[0]), b = P(bar[1])
          return (
            <g key={mk.id} opacity={op}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={m.barStroke} strokeLinecap="butt" />
              {mk.needs_review && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={REVIEW} strokeWidth={m.barStroke * 2.4} strokeDasharray={`${m.font * 0.5} ${m.font * 0.4}`} opacity={0.7} />
              )}
              {limitChips(bar, codeOf(mk.system_id) ?? '?', mk.other_system_id ? codeOf(mk.other_system_id) ?? '?' : null).map((c, i) => renderChip(c, `${mk.id}-${i}`))}
              {selectable && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={m.hit * 2}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onSelect(mk.id) }} />
              )}
            </g>
          )
        }
        if (mk.kind === 'label' && pts.length === 1) {
          const c = P(pts[0])
          const text = labelText(mk, codeOf)
          const box = chipBox(text, m.font)
          return (
            <g key={mk.id} opacity={op} style={selectable ? { pointerEvents: 'auto', cursor: 'pointer' } : undefined}
              onClick={selectable ? e => { e.stopPropagation(); onSelect(mk.id) } : undefined}>
              {renderChip({ cx: c.x, cy: c.y, text, fill: colorOf(mk.system_id) }, `${mk.id}-chip`)}
              {mk.needs_review && (
                <rect x={c.x - box.w / 2 - m.barStroke} y={c.y - box.h / 2 - m.barStroke} width={box.w + m.barStroke * 2} height={box.h + m.barStroke * 2}
                  rx={m.font * 0.3} fill="none" stroke={REVIEW} strokeWidth={m.barStroke * 0.6} strokeDasharray={`${m.font * 0.4} ${m.font * 0.3}`} />
              )}
            </g>
          )
        }
        return null
      })}

      {/* Marca elegida: contorno y vértices. */}
      {selected && (() => {
        const pts = displayPoints(selected, page.rotation)
        const hs = m.font * 0.7
        return (
          <g pointerEvents="none">
            {pts.length > 1 && <path d={path(pts)} fill="none" stroke={SELECT} strokeWidth={m.barStroke * 0.5} strokeDasharray={`${m.font * 0.5} ${m.font * 0.35}`} />}
            {pts.map((p, i) => {
              const q = P(p)
              return <rect key={i} x={q.x - hs / 2} y={q.y - hs / 2} width={hs} height={hs} fill="#fff" stroke={SELECT} strokeWidth={m.barStroke * 0.5} />
            })}
          </g>
        )
      })()}

      {/* Línea en curso + tramo elástico hasta el puntero. */}
      {draft.length > 0 && (
        <g pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={path(hover ? [...draft, hover] : draft)} stroke={draftColor} strokeWidth={m.highlight} opacity={0.45} />
          <path d={path(hover ? [...draft, hover] : draft)} stroke={INK} strokeWidth={m.barStroke * 0.4} strokeDasharray={`${m.font * 0.5} ${m.font * 0.35}`} />
          {draft.map((p, i) => {
            const q = P(p), hs = m.font * 0.7
            return <rect key={i} x={q.x - hs / 2} y={q.y - hs / 2} width={hs} height={hs} fill="#fff" stroke={SELECT} strokeWidth={m.barStroke * 0.5} />
          })}
        </g>
      )}

      {/* Límite por confirmar. */}
      {pendingLimit && (() => {
        const a = P(pendingLimit.bar[0]), b = P(pendingLimit.bar[1])
        return (
          <g pointerEvents="none">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={SELECT} strokeWidth={m.barStroke} />
            {limitChips(pendingLimit.bar,
              pendingLimit.system_id ? codeOf(pendingLimit.system_id) ?? '?' : null,
              pendingLimit.other_system_id ? codeOf(pendingLimit.other_system_id) ?? '?' : null,
            ).map((c, i) => renderChip({ ...c, fill: SELECT }, `pending-${i}`))}
          </g>
        )
      })()}
    </svg>
  )
}
