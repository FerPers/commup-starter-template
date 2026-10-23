// F-21 (plan referente § P): red-line de campo sobre una revisión de un P&ID (tabla pid_redlines). Lógica pura.
// Marcas (= SQL pid_redline_marks_ok): nube = 2 esquinas opuestas · trazo = polilínea de 2..500 puntos · texto = 1 punto
// + t (1..120) · punto = red-line puntual del teléfono (1 punto). Unidad 0..1 de la página YA ROTADA, con el tamaño y la
// rotación de la página al dibujar (como pid_markups); al mostrarlas se reproyectan a la rotación de la hoja abierta.
// Estados: abierta → aceptada / rechazada (otra persona, Líder en adelante; rechazar con motivo ≥ 10) → incorporada
// (F-21c). Sin efecto en las liberaciones.

import { distance, distanceToSegment, reprojectPoint, type PageSize, type Pt, type Rotation } from './geometry'
import { fromStoredPoints, markupMetrics, toStoredPoints } from './markups'

export type RedlineMarkKind = 'cloud' | 'pen' | 'text' | 'point'
export type RedlineMark = { k: RedlineMarkKind; p: Pt[]; t?: string }
export type RedlineStatus = 'open' | 'accepted' | 'rejected' | 'incorporated'

export const REDLINE_STATUSES: readonly RedlineStatus[] = ['open', 'accepted', 'rejected', 'incorporated']
export const MAX_REDLINE_MARKS = 50
export const MAX_PEN_POINTS = 500
export const MAX_TEXT_LENGTH = 120
/** Motivo mínimo para rechazar (= review_pid_redline). */
export const REJECT_MIN = 10

export type Redline = {
  id: string
  number: string
  page_num: number
  status: RedlineStatus
  description: string
  system_id: string | null
  tag_id: string | null
  marks: RedlineMark[]
  page_width: number
  page_height: number
  page_rotation: Rotation
  created_by: string
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
}

const inUnit = (p: Pt) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1

/** ¿Las marcas son válidas? (= pid_redline_marks_ok) */
export function validRedlineMarks(marks: RedlineMark[]): boolean {
  if (marks.length < 1 || marks.length > MAX_REDLINE_MARKS) return false
  return marks.every(m => {
    const n = m.p.length
    const countOk = m.k === 'cloud' ? n === 2 : m.k === 'pen' ? n >= 2 && n <= MAX_PEN_POINTS : m.k === 'text' || m.k === 'point' ? n === 1 : false
    if (!countOk || !m.p.every(inUnit)) return false
    if (m.k === 'text') { const t = m.t?.trim() ?? ''; return t.length >= 1 && t.length <= MAX_TEXT_LENGTH }
    return m.t === undefined
  })
}

/** Marcas → jsonb (puntos acotados a 0..1 con 6 decimales; el texto, recortado). */
export function toStoredMarks(marks: RedlineMark[]): { k: RedlineMarkKind; p: [number, number][]; t?: string }[] {
  return marks.map(m => ({ k: m.k, p: toStoredPoints(m.p), ...(m.k === 'text' ? { t: (m.t ?? '').trim() } : {}) }))
}

/** jsonb de la BD → marcas; lo que no tenga forma de marca se descarta. */
export function fromStoredMarks(raw: unknown): RedlineMark[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(e => {
    if (!e || typeof e !== 'object') return []
    const o = e as { k?: unknown; p?: unknown; t?: unknown }
    if (o.k !== 'cloud' && o.k !== 'pen' && o.k !== 'text' && o.k !== 'point') return []
    const p = fromStoredPoints(o.p)
    if (!p.length) return []
    return [{ k: o.k, p, ...(o.k === 'text' && typeof o.t === 'string' ? { t: o.t } : {}) }]
  })
}

/** Marcas en la rotación de la hoja abierta. */
export function displayMarks(r: Pick<Redline, 'marks' | 'page_rotation'>, rotation: Rotation): RedlineMark[] {
  return r.marks.map(m => ({ ...m, p: m.p.map(pt => reprojectPoint(pt, r.page_rotation, rotation)) }))
}

/** Punto donde va el número del red-line: la esquina de arriba a la izquierda de la nube o el primer punto. */
export function redlineAnchor(marks: RedlineMark[]): Pt | null {
  const cloud = marks.find(m => m.k === 'cloud')
  if (cloud) return { x: Math.min(cloud.p[0].x, cloud.p[1].x), y: Math.min(cloud.p[0].y, cloud.p[1].y) }
  return marks[0]?.p[0] ?? null
}

/**
 * Nube de revisión: rectángulo de esquinas `a` y `b` con el borde en festones (arcos hacia afuera), en puntos de la
 * página. `bump` = diámetro aproximado de cada festón.
 */
export function cloudPath(a: Pt, b: Pt, size: PageSize, bump: number): string {
  const x0 = Math.min(a.x, b.x) * size.w, x1 = Math.max(a.x, b.x) * size.w
  const y0 = Math.min(a.y, b.y) * size.h, y1 = Math.max(a.y, b.y) * size.h
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  let d = `M${x0.toFixed(2)} ${y0.toFixed(2)}`
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4]
    const len = Math.hypot(bx - ax, by - ay)
    const n = Math.max(1, Math.round(len / bump))
    const r = len / n / 2
    for (let j = 1; j <= n; j++) {
      const px = ax + ((bx - ax) * j) / n, py = ay + ((by - ay) * j) / n
      // sweep 1 = festón hacia afuera al recorrer el rectángulo en sentido horario
      d += ` A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${px.toFixed(2)} ${py.toFixed(2)}`
    }
  }
  return `${d} Z`
}

/**
 * Nube como polígono (para el PDF: los arcos no se giran con la hoja en pdf-lib): festones semicirculares hacia
 * afuera sobre el rectángulo de esquinas `a` y `b`, en puntos de la página como se ve (origen arriba a la izquierda).
 */
export function cloudPoints(a: Pt, b: Pt, size: PageSize, bump: number, samples = 6): Pt[] {
  const x0 = Math.min(a.x, b.x) * size.w, x1 = Math.max(a.x, b.x) * size.w
  const y0 = Math.min(a.y, b.y) * size.h, y1 = Math.max(a.y, b.y) * size.h
  // Recorrido horario (y hacia abajo): arriba, derecha, abajo, izquierda; normal hacia afuera de cada lado.
  const edges: { from: Pt; to: Pt; out: Pt }[] = [
    { from: { x: x0, y: y0 }, to: { x: x1, y: y0 }, out: { x: 0, y: -1 } },
    { from: { x: x1, y: y0 }, to: { x: x1, y: y1 }, out: { x: 1, y: 0 } },
    { from: { x: x1, y: y1 }, to: { x: x0, y: y1 }, out: { x: 0, y: 1 } },
    { from: { x: x0, y: y1 }, to: { x: x0, y: y0 }, out: { x: -1, y: 0 } },
  ]
  const pts: Pt[] = []
  for (const e of edges) {
    const len = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y)
    if (len === 0) continue
    const dir = { x: (e.to.x - e.from.x) / len, y: (e.to.y - e.from.y) / len }
    const n = Math.max(1, Math.round(len / bump))
    const r = len / n / 2
    for (let j = 0; j < n; j++) {
      const c = { x: e.from.x + dir.x * r * (2 * j + 1), y: e.from.y + dir.y * r * (2 * j + 1) }
      for (let k = 0; k < samples; k++) {
        const t = (Math.PI * k) / samples
        pts.push({ x: c.x - dir.x * r * Math.cos(t) + e.out.x * r * Math.sin(t), y: c.y - dir.y * r * Math.cos(t) + e.out.y * r * Math.sin(t) })
      }
    }
  }
  return pts
}

/** ¿El clic `p` toca alguna marca del red-line? (nube: dentro del rectángulo; trazo: cerca; texto/punto: cerca del ancla) */
export function hitsRedline(p: Pt, marks: RedlineMark[], size: PageSize): boolean {
  const tol = markupMetrics(size).hit
  return marks.some(m => {
    if (m.k === 'cloud') {
      const [a, b] = m.p
      return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
    }
    if (m.k === 'pen') {
      for (let i = 1; i < m.p.length; i++) if (distanceToSegment(p, m.p[i - 1], m.p[i], size) <= tol) return true
      return false
    }
    return distance(p, m.p[0], size) <= tol * 2.5
  })
}

/** ¿Puede revisar (aceptar o rechazar)? Abierta, Líder en adelante y distinto de quien la creó (= review_pid_redline). */
export function canReviewRedline(r: Pick<Redline, 'status' | 'created_by'>, userId: string, isEditor: boolean): boolean {
  return isEditor && r.status === 'open' && r.created_by !== userId
}

/** Conteo por estado (filtros del panel). */
export function countByStatus(list: Pick<Redline, 'status'>[]): Record<RedlineStatus, number> {
  const out: Record<RedlineStatus, number> = { open: 0, accepted: 0, rejected: 0, incorporated: 0 }
  for (const r of list) out[r.status]++
  return out
}

/** Colores por estado (marcas en el plano y chips): abierta rojo, aceptada verde, rechazada gris, incorporada azul. */
export const REDLINE_STATUS_STYLE: Record<RedlineStatus, { ink: string; chipBg: string; chipText: string; chipBorder: string }> = {
  open: { ink: '#dc2626', chipBg: 'var(--danger-50)', chipText: 'var(--danger-700)', chipBorder: 'var(--danger-200)' },
  accepted: { ink: '#16a34a', chipBg: 'var(--success-50)', chipText: 'var(--success-700)', chipBorder: 'var(--success-200)' },
  rejected: { ink: '#64748b', chipBg: 'var(--gray-100)', chipText: 'var(--text-secondary)', chipBorder: 'var(--border)' },
  incorporated: { ink: '#2563eb', chipBg: 'var(--primary-50)', chipText: 'var(--primary-700)', chipBorder: 'var(--primary-200)' },
}
