'use client'

import { useTranslations } from 'next-intl'
import type { Pt } from '@/lib/pid/geometry'
import { markupMetrics } from '@/lib/pid/markups'
import { cloudPath, displayMarks, redlineAnchor, REDLINE_STATUS_STYLE, type RedlineMark } from '@/lib/pid/redlines'
import type { PageInfo, RedlineView } from './types'

// F-21a: capa SVG de los red-lines sobre la hoja (viewBox = página en puntos PDF ya rotada, como MarkupLayer). Cada
// red-line se pinta del color de su estado (abierta rojo, aceptada verde, rechazada gris, incorporada azul) con su
// número en un círculo; el que se está dibujando va en rojo con la esquina de la nube pendiente y el trazo en curso.

const DRAFT = '#dc2626'
const SELECT = '#1f5fbf'

export default function RedlineLayer({
  page,
  redlines,
  selectedId,
  selectable,
  onSelect,
  draftMarks,
  cloudStart,
  penDraft,
  hover,
}: {
  page: PageInfo
  /** Red-lines de esta hoja. */
  redlines: RedlineView[]
  selectedId: string | null
  /** Herramienta «Elegir»: los red-lines reciben el clic. */
  selectable: boolean
  onSelect: (id: string) => void
  /** Marcas del red-line en curso (unidad, rotación de la hoja abierta). */
  draftMarks: RedlineMark[]
  /** Primera esquina de la nube en curso. */
  cloudStart: Pt | null
  /** Trazo en curso. */
  penDraft: Pt[]
  hover: Pt | null
}) {
  const t = useTranslations('PidDocuments')
  const size = { w: page.w, h: page.h }
  const m = markupMetrics(size)
  const stroke = m.barStroke * 0.9
  const bump = Math.min(size.w, size.h) * 0.018
  const P = (p: Pt) => ({ x: p.x * size.w, y: p.y * size.h })
  const path = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * size.w).toFixed(2)} ${(p.y * size.h).toFixed(2)}`).join(' ')

  function renderMarks(marks: RedlineMark[], color: string, key: string, dashed = false) {
    return marks.map((mk, i) => {
      const k = `${key}-${i}`
      if (mk.k === 'cloud') {
        return <path key={k} d={cloudPath(mk.p[0], mk.p[1], size, bump)} fill={color} fillOpacity={0.06} stroke={color} strokeWidth={stroke}
          strokeDasharray={dashed ? `${m.font * 0.5} ${m.font * 0.35}` : undefined} />
      }
      if (mk.k === 'pen') return <path key={k} d={path(mk.p)} fill="none" stroke={color} strokeWidth={stroke * 1.2} strokeLinecap="round" strokeLinejoin="round" />
      const c = P(mk.p[0])
      if (mk.k === 'text') {
        return <text key={k} x={c.x} y={c.y} fill={color} fontSize={m.font * 1.25} fontWeight={700} dominantBaseline="central"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{mk.t}</text>
      }
      return (
        <g key={k}>
          <circle cx={c.x} cy={c.y} r={m.font * 1.3} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={stroke} />
          <circle cx={c.x} cy={c.y} r={m.font * 0.35} fill={color} />
        </g>
      )
    })
  }

  return (
    <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none" role="img" aria-label={t('redline.layerLabel', { count: redlines.length })}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 7, pointerEvents: 'none', overflow: 'visible' }}>
      {redlines.map(r => {
        const marks = displayMarks(r, page.rotation)
        const color = REDLINE_STATUS_STYLE[r.status].ink
        const anchor = redlineAnchor(marks)
        const a = anchor ? P(anchor) : null
        const badge = m.font * 1.15
        const selected = r.id === selectedId
        return (
          <g key={r.id} opacity={r.status === 'rejected' || r.status === 'incorporated' ? 0.6 : 1}
            style={selectable ? { pointerEvents: 'visiblePainted', cursor: 'pointer' } : undefined}
            onClick={selectable ? e => { e.stopPropagation(); onSelect(r.id) } : undefined}>
            <title>{`${r.number} · ${r.description}`}</title>
            {renderMarks(marks, color, r.id, r.status === 'rejected')}
            {a && (
              <g>
                {selected && <circle cx={a.x} cy={a.y} r={badge * 1.45} fill="none" stroke={SELECT} strokeWidth={stroke} />}
                <circle cx={a.x} cy={a.y} r={badge} fill={color} stroke="#fff" strokeWidth={stroke} />
                <text x={a.x} y={a.y} fill="#fff" fontSize={m.font * 0.95} fontWeight={700} textAnchor="middle" dominantBaseline="central"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{String(Number(r.number.replace(/\D/g, '')))}</text>
              </g>
            )}
          </g>
        )
      })}

      {/* Red-line en curso */}
      <g pointerEvents="none">
        {renderMarks(draftMarks, DRAFT, 'draft')}
        {cloudStart && (() => {
          const end = hover ?? cloudStart
          return <path d={cloudPath(cloudStart, end, size, bump)} fill={DRAFT} fillOpacity={0.05} stroke={DRAFT} strokeWidth={stroke} strokeDasharray={`${m.font * 0.5} ${m.font * 0.35}`} />
        })()}
        {penDraft.length > 0 && (
          <path d={path(hover ? [...penDraft, hover] : penDraft)} fill="none" stroke={DRAFT} strokeWidth={stroke * 1.2} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={`${m.font * 0.5} ${m.font * 0.35}`} />
        )}
      </g>
    </svg>
  )
}
