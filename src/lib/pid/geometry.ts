// P1 (plan referente): geometría del P&ID vivo, pura y sin DOM. Dos sistemas de coordenadas:
//  - pines (pid_hotspots): porcentaje 0..100 sobre la página como se ve (x_pct / y_pct, numeric(7,4));
//  - marcas (límites, P2): unidad 0..1 sobre la página ya rotada, guardando tamaño y rotación al dibujar.
// Las distancias y ángulos se miden en el espacio de la página (unidad × tamaño), no en la unidad: una hoja A1
// apaisada no es cuadrada y un tramo «horizontal» en unidad no lo es en pantalla si se ignora la proporción.

export type Pt = { x: number; y: number }
export type PageSize = { w: number; h: number }
export type Rotation = 0 | 90 | 180 | 270

const UNIT_SIZE: PageSize = { w: 1, h: 1 }

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Porcentaje de pin: dentro de 0..100 (CHECK pid_hotspots_pct_range) y con 4 decimales (numeric(7,4)). */
export function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(clamp(v, 0, 100) * 1e4) / 1e4
}

/** Punto del puntero → porcentaje de la caja (`getBoundingClientRect`), acotado al borde. */
export function pointerToPct(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Pt {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  return {
    x: clampPct(((clientX - rect.left) / rect.width) * 100),
    y: clampPct(((clientY - rect.top) / rect.height) * 100),
  }
}

/** Punto del puntero → unidad 0..1 de la caja, acotado al borde. */
export function pointerToUnit(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Pt {
  const p = pointerToPct(clientX, clientY, rect)
  return { x: p.x / 100, y: p.y / 100 }
}

export function normalizeRotation(deg: number): Rotation {
  const r = ((Math.round(deg / 90) * 90) % 360 + 360) % 360
  return r as Rotation
}

/**
 * Punto en unidad de la página SIN rotar → unidad de la página girada `rotation` grados en sentido horario
 * (como `/Rotate` de un PDF y la vista de pdf.js).
 */
export function rotatePoint(p: Pt, rotation: Rotation): Pt {
  switch (rotation) {
    case 90: return { x: 1 - p.y, y: p.x }
    case 180: return { x: 1 - p.x, y: 1 - p.y }
    case 270: return { x: p.y, y: 1 - p.x }
    default: return { x: p.x, y: p.y }
  }
}

/** Inversa de `rotatePoint`. */
export function unrotatePoint(p: Pt, rotation: Rotation): Pt {
  return rotatePoint(p, ((360 - rotation) % 360) as Rotation)
}

/** Tamaño de la página girada (90 y 270 intercambian ancho y alto). */
export function rotatedSize(size: PageSize, rotation: Rotation): PageSize {
  return rotation === 90 || rotation === 270 ? { w: size.h, h: size.w } : { ...size }
}

/**
 * Lleva un punto guardado con otra rotación de página a la rotación actual: un límite dibujado con la hoja a 0°
 * cae en su lugar si la revisión nueva viene girada.
 */
export function reprojectPoint(p: Pt, from: Rotation, to: Rotation): Pt {
  return from === to ? { x: p.x, y: p.y } : rotatePoint(unrotatePoint(p, from), to)
}

const toPage = (p: Pt, size: PageSize) => ({ x: p.x * size.w, y: p.y * size.h })

export function distance(a: Pt, b: Pt, size: PageSize = UNIT_SIZE): number {
  const pa = toPage(a, size), pb = toPage(b, size)
  return Math.hypot(pa.x - pb.x, pa.y - pb.y)
}

/** Distancia de `p` al segmento a–b, en el espacio de la página. */
export function distanceToSegment(p: Pt, a: Pt, b: Pt, size: PageSize = UNIT_SIZE): number {
  const pp = toPage(p, size), pa = toPage(a, size), pb = toPage(b, size)
  const dx = pb.x - pa.x, dy = pb.y - pa.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(pp.x - pa.x, pp.y - pa.y)
  const t = clamp(((pp.x - pa.x) * dx + (pp.y - pa.y) * dy) / len2, 0, 1)
  return Math.hypot(pp.x - (pa.x + t * dx), pp.y - (pa.y + t * dy))
}

/** Distancia de `p` a una polilínea (Infinity si está vacía). */
export function distanceToPolyline(p: Pt, pts: Pt[], size: PageSize = UNIT_SIZE): number {
  if (pts.length === 0) return Infinity
  if (pts.length === 1) return distance(p, pts[0], size)
  let best = Infinity
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(p, pts[i - 1], pts[i], size))
  return best
}

export function polylineLength(pts: Pt[], size: PageSize = UNIT_SIZE): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1], pts[i], size)
  return total
}

/**
 * Ajuste ortogonal: si el tramo prev→next queda a menos de `toleranceDeg` de la horizontal o la vertical (medido
 * en la página), se endereza. Las líneas de un P&ID son casi todas ortogonales.
 */
export function snapOrthogonal(prev: Pt, next: Pt, size: PageSize = UNIT_SIZE, toleranceDeg = 8): Pt {
  const dx = (next.x - prev.x) * size.w
  const dy = (next.y - prev.y) * size.h
  if (dx === 0 && dy === 0) return { x: next.x, y: next.y }
  const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) // 0..180
  const fromHorizontal = Math.min(angle, 180 - angle)
  if (fromHorizontal <= toleranceDeg) return { x: next.x, y: prev.y }
  if (Math.abs(angle - 90) <= toleranceDeg) return { x: prev.x, y: next.y }
  return { x: next.x, y: next.y }
}

/**
 * Simplificación Ramer–Douglas–Peucker: quita vértices a menos de `epsilon` (en el espacio de la página) de la
 * línea que los une. Conserva siempre el primero y el último.
 */
export function simplify(pts: Pt[], epsilon: number, size: PageSize = UNIT_SIZE): Pt[] {
  const dedup = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
  if (dedup.length <= 2) return dedup.map(p => ({ ...p }))
  const keep = new Array<boolean>(dedup.length).fill(false)
  keep[0] = keep[dedup.length - 1] = true
  const stack: [number, number][] = [[0, dedup.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let maxD = -1, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = distanceToSegment(dedup[i], dedup[s], dedup[e], size)
      if (d > maxD) { maxD = d; idx = i }
    }
    if (idx !== -1 && maxD > epsilon) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  return dedup.filter((_, i) => keep[i]).map(p => ({ ...p }))
}

/** Caja que contiene los puntos (null si no hay). Sirve para el zoom a un sistema (`?system=`, P3). */
export function bounds(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (pts.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}
