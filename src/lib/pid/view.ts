// P3 (plan referente, maquetas «Tableta» y «Planos» aprobadas): lógica pura del visor que no es geometría de marcas.
//  - `systemFocus`: hoja y caja (unidad 0..1) donde está un sistema, para abrir el plano con `?system=`.
//  - `zoomToBox`: escala que encuadra esa caja en el lienzo (escala 1 = ancho del lienzo).
//  - `moveVertex`: arrastrar un vértice de una marca, con ajuste a 90° respecto del vecino.
//  - `ROW_STATE_COLORS`: color de las marcas «Por estado» = estado de la liberación siguiente del sistema
//    (`rowState` de compute_project_gates).
import type { RowState } from '@/lib/readiness/matrix'
import { bounds, clamp, snapOrthogonal, type PageSize, type Pt } from './geometry'

export type Box = { minX: number; minY: number; maxX: number; maxY: number }

/** Lo que el visor sabe ubicar de un sistema en una hoja: pines (porcentaje) y marcas (unidad, ya en la rotación abierta). */
export type FocusItem = { page: number; systemIds: string[]; points: Pt[] }

/**
 * Hoja con más presencia del sistema (marcas pesan doble que pines: el recorrido es lo que se busca) y la caja que la
 * contiene. null si el sistema no aparece en el plano.
 */
export function systemFocus(systemId: string, items: FocusItem[]): { page: number; box: Box } | null {
  const byPage = new Map<number, { score: number; pts: Pt[] }>()
  for (const it of items) {
    if (!it.systemIds.includes(systemId) || !it.points.length) continue
    const cur = byPage.get(it.page) ?? { score: 0, pts: [] }
    cur.score += it.points.length > 1 ? 2 : 1
    cur.pts.push(...it.points)
    byPage.set(it.page, cur)
  }
  let best: { page: number; score: number; pts: Pt[] } | null = null
  for (const [page, v] of byPage) if (!best || v.score > best.score || (v.score === best.score && page < best.page)) best = { page, ...v }
  if (!best) return null
  const b = bounds(best.pts)!
  return { page: best.page, box: b }
}

/** Margen alrededor de la caja (unidad) y tamaño mínimo encuadrado (un solo pin no lleva al zoom máximo). */
export const FOCUS_MARGIN = 0.06
export const FOCUS_MIN_SPAN = 0.18

/**
 * Escala para encuadrar `box` en un lienzo de `view` px (ancho de la hoja a escala 1 = `baseWidth`). Nunca baja de 1
 * (la hoja entera ya se ve a lo ancho) ni pasa de `maxScale`.
 */
export function zoomToBox(box: Box, page: PageSize, view: { w: number; h: number }, baseWidth: number, maxScale: number): number {
  const bw = Math.max(box.maxX - box.minX, FOCUS_MIN_SPAN) + 2 * FOCUS_MARGIN
  const bh = Math.max(box.maxY - box.minY, FOCUS_MIN_SPAN) + 2 * FOCUS_MARGIN
  const sw = view.w / (baseWidth * bw)
  const sh = view.h / (baseWidth * (page.h / page.w) * bh)
  return +clamp(Math.min(sw, sh), 1, maxScale).toFixed(2)
}

/** Desplazamiento del lienzo que centra la caja, con la hoja renderizada de `rendered` px. */
export function scrollToBox(box: Box, rendered: { w: number; h: number }, view: { w: number; h: number }, padding = 16): { left: number; top: number } {
  const cx = ((box.minX + box.maxX) / 2) * rendered.w + padding
  const cy = ((box.minY + box.maxY) / 2) * rendered.h + padding
  return { left: Math.max(0, Math.round(cx - view.w / 2)), top: Math.max(0, Math.round(cy - view.h / 2)) }
}

/**
 * Mueve el vértice `i` a `p` (unidad, acotado a la hoja). En una línea se ajusta a 90° respecto del vecino más
 * cercano al nuevo punto; límites y etiquetas se mueven libres.
 */
export function moveVertex(points: Pt[], i: number, p: Pt, size: PageSize, orthogonal: boolean): Pt[] {
  if (i < 0 || i >= points.length) return points
  let next = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }
  if (orthogonal && points.length > 1) {
    const neighbors = [points[i - 1], points[i + 1]].filter((q): q is Pt => !!q)
    for (const q of neighbors) {
      const s = snapOrthogonal(q, next, size)
      if (s.x !== next.x || s.y !== next.y) { next = s; break }
    }
  }
  return points.map((q, k) => (k === i ? next : q))
}

/**
 * Color «Por estado» de un sistema = su liberación siguiente. Ámbar = bloqueado (el caso común), rojo = regresión,
 * azul = esperando firmas, verde azulado = lista para aprobar, verde = todo aprobado. Distintos también en luminosidad.
 */
export const ROW_STATE_COLORS: Record<RowState, string> = {
  regressed: '#b91c1c',
  blocked: '#d97706',
  signing: '#2563eb',
  ready: '#0f766e',
  done: '#15803d',
}

export const ROW_STATE_ORDER: readonly RowState[] = ['regressed', 'blocked', 'signing', 'ready', 'done']
