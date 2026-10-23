// P2 (plan referente): marcas LOSH sobre una revisión de un P&ID (tabla pid_markups). Lógica pura, sin DOM.
//  - line  = recorrido resaltado de un sistema (2..500 vértices);
//  - limit = barra de límite en un punto de aislamiento (2 puntos = extremos de la barra), sistema a cada lado;
//  - label = etiqueta con el código del sistema (1 punto).
// Los puntos se guardan en unidad 0..1 de la página YA ROTADA, con el tamaño y la rotación de esa página al dibujar
// (= SQL pid_markup_points_ok); al mostrarlos se reproyectan a la rotación de la hoja abierta.

import { clamp, distance, distanceToSegment, reprojectPoint, simplify, type PageSize, type Pt, type Rotation } from './geometry'

export type MarkupKind = 'line' | 'limit' | 'label'

export const MARKUP_KINDS: readonly MarkupKind[] = ['line', 'limit', 'label']
export const MAX_LINE_VERTICES = 500
export const MAX_LABEL_LENGTH = 80

export type Markup = {
  id: string
  page_num: number
  kind: MarkupKind
  system_id: string
  /** Solo en un límite: el sistema del otro lado. null = límite de batería (fuera del alcance). */
  other_system_id: string | null
  /** Unidad 0..1 en la rotación `page_rotation`. */
  points: Pt[]
  page_width: number
  page_height: number
  page_rotation: Rotation
  label: string | null
  needs_review: boolean
}

/** Cantidad de puntos válida por tipo (= pid_markup_points_ok). */
export function validMarkupPoints(kind: MarkupKind, pts: Pt[]): boolean {
  const min = kind === 'label' ? 1 : 2
  const max = kind === 'line' ? MAX_LINE_VERTICES : kind === 'limit' ? 2 : 1
  if (pts.length < min || pts.length > max) return false
  return pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)
}

const round6 = (v: number) => Math.round(clamp(v, 0, 1) * 1e6) / 1e6

/** Puntos → jsonb `[[x,y],…]` acotados a 0..1 con 6 decimales (una hoja A0 = 3370 pt: 6 decimales sobran). */
export function toStoredPoints(pts: Pt[]): [number, number][] {
  return pts.map(p => [round6(p.x), round6(p.y)])
}

/** jsonb de la BD → puntos; lo que no tenga forma de punto se descarta. */
export function fromStoredPoints(raw: unknown): Pt[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(e => (Array.isArray(e) && typeof e[0] === 'number' && typeof e[1] === 'number' ? [{ x: e[0], y: e[1] }] : []))
}

/** Puntos de la marca en la rotación de la hoja abierta. */
export function displayPoints(m: Pick<Markup, 'points' | 'page_rotation'>, rotation: Rotation): Pt[] {
  return m.points.map(p => reprojectPoint(p, m.page_rotation, rotation))
}

/** Lado corto de la página: las medidas de las marcas son proporcionales a él (A3 o A0, se ven igual). */
const shortSide = (size: PageSize) => Math.min(size.w, size.h)

/** Grosores y tamaños en puntos de la página (el SVG escala con el zoom, como la tinta del plano). */
export function markupMetrics(size: PageSize) {
  const s = shortSide(size)
  return {
    highlight: s * 0.011,
    barStroke: s * 0.004,
    barLength: s * 0.04,
    font: s * 0.0115,
    /** Distancia para «tocar» una marca o una línea al hacer clic. */
    hit: s * 0.012,
    /** Dos clics a menos de esto son el mismo vértice (el doble clic que termina la línea). */
    sameVertex: s * 0.003,
    /** Simplificación de la polilínea al guardar. */
    simplify: s * 0.0008,
  }
}

/**
 * Cierra una polilínea dibujada: quita vértices repetidos (el doble clic que la termina deja uno o dos encima
 * del último) y los colineales. null si no quedan dos vértices distintos.
 */
export function finishLine(pts: Pt[], size: PageSize): Pt[] | null {
  const m = markupMetrics(size)
  const dedup: Pt[] = []
  for (const p of pts) {
    if (dedup.length && distance(dedup[dedup.length - 1], p, size) < m.sameVertex) continue
    dedup.push(p)
  }
  if (dedup.length < 2) return null
  const out = simplify(dedup, m.simplify, size)
  return out.length >= 2 ? out.slice(0, MAX_LINE_VERTICES) : null
}

type LineLike = { id?: string; system_id: string; points: Pt[] }

export type LineHit<L extends LineLike> = {
  line: L
  /** Punto de la línea más cercano al clic. */
  at: Pt
  /** Extremos del tramo tocado. */
  a: Pt
  b: Pt
  dist: number
}

/** Línea resaltada más cercana a `p` (en la página) dentro de `maxDist`; null si ninguna. */
export function nearestLine<L extends LineLike>(p: Pt, lines: L[], size: PageSize, maxDist: number): LineHit<L> | null {
  let best: LineHit<L> | null = null
  for (const line of lines) {
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i]
      const d = distanceToSegment(p, a, b, size)
      if (d <= maxDist && (!best || d < best.dist)) best = { line, at: projectOnSegment(p, a, b, size), a, b, dist: d }
    }
  }
  return best
}

function projectOnSegment(p: Pt, a: Pt, b: Pt, size: PageSize): Pt {
  const dx = (b.x - a.x) * size.w, dy = (b.y - a.y) * size.h
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return { ...a }
  const t = clamp((((p.x - a.x) * size.w) * dx + ((p.y - a.y) * size.h) * dy) / len2, 0, 1)
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
}

/** Dirección unitaria a→b medida en la página. */
function pageDir(a: Pt, b: Pt, size: PageSize): { x: number; y: number } {
  const dx = (b.x - a.x) * size.w, dy = (b.y - a.y) * size.h
  const len = Math.hypot(dx, dy)
  return len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len }
}

/**
 * Barra de límite en `p`: perpendicular al tramo de línea resaltada que toca (se apoya sobre él), o vertical si no
 * hay línea cerca (la mayoría de los tramos de un P&ID son horizontales). Devuelve los dos extremos en unidad.
 */
export function limitBar(p: Pt, hit: { at: Pt; a: Pt; b: Pt } | null, size: PageSize): [Pt, Pt] {
  const half = markupMetrics(size).barLength / 2
  const center = hit ? hit.at : p
  const along = hit ? pageDir(hit.a, hit.b, size) : { x: 1, y: 0 }
  const n = { x: -along.y, y: along.x } // perpendicular, en la página
  const off = { x: (n.x * half) / size.w, y: (n.y * half) / size.h }
  return [
    { x: clamp(center.x - off.x, 0, 1), y: clamp(center.y - off.y, 0, 1) },
    { x: clamp(center.x + off.x, 0, 1), y: clamp(center.y + off.y, 0, 1) },
  ]
}

/**
 * Normal de una barra de límite, en la página, orientada hacia la derecha (o hacia abajo si la barra es
 * horizontal). `system_id` va del lado opuesto (izquierda / arriba) y `other_system_id` de este lado.
 */
export function limitNormal(bar: [Pt, Pt], size: PageSize): { x: number; y: number } {
  const d = pageDir(bar[0], bar[1], size)
  let n = { x: -d.y, y: d.x }
  if (n.x < -1e-9 || (Math.abs(n.x) <= 1e-9 && n.y < 0)) n = { x: -n.x, y: -n.y }
  return n
}

/**
 * Sistemas por defecto de un límite nuevo: el de la línea tocada va del lado donde sigue su recorrido (el extremo
 * del tramo más alejado de la barra); del otro lado, otra línea resaltada de OTRO sistema que pase cerca, o
 * ninguno (límite de batería).
 */
export function defaultLimitSides<L extends LineLike>(
  bar: [Pt, Pt],
  hit: LineHit<L> | null,
  lines: L[],
  size: PageSize,
  fallbackSystemId: string | null,
): { system_id: string | null; other_system_id: string | null } {
  if (!hit) return { system_id: fallbackSystemId, other_system_id: null }
  const n = limitNormal(bar, size)
  const center = hit.at
  const side = (q: Pt) => ((q.x - center.x) * size.w) * n.x + ((q.y - center.y) * size.h) * n.y
  const sa = side(hit.a), sb = side(hit.b)
  const hitOnRight = (Math.abs(sa) >= Math.abs(sb) ? sa : sb) > 0
  const tol = markupMetrics(size).hit
  const other = nearestLine(center, lines.filter(l => l.system_id !== hit.line.system_id), size, tol)?.line.system_id ?? null
  return hitOnRight
    ? { system_id: other, other_system_id: hit.line.system_id }
    : { system_id: hit.line.system_id, other_system_id: other }
}

/** ¿El clic `p` toca la marca? (líneas y barras por distancia; etiqueta por distancia al ancla). */
export function hitsMarkup(p: Pt, pts: Pt[], size: PageSize, tolerance: number): boolean {
  if (pts.length === 1) return distance(p, pts[0], size) <= tolerance * 2
  for (let i = 1; i < pts.length; i++) if (distanceToSegment(p, pts[i - 1], pts[i], size) <= tolerance) return true
  return false
}

/** Ids de sistema que aparecen en las marcas (incluido el otro lado de los límites). */
export function markupSystemIds(markups: Pick<Markup, 'system_id' | 'other_system_id'>[]): string[] {
  const ids = new Set<string>()
  for (const m of markups) {
    ids.add(m.system_id)
    if (m.other_system_id) ids.add(m.other_system_id)
  }
  return [...ids]
}

/** Texto de una etiqueta: el que escribió el usuario o el código del sistema. */
export function labelText(m: Pick<Markup, 'label' | 'system_id'>, codeOf: (systemId: string) => string | undefined): string {
  const own = m.label?.trim()
  if (own) return own
  return codeOf(m.system_id) ?? '?'
}
