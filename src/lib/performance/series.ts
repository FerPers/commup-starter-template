/**
 * S12 (E-33): reducción de series para gráficos que conserva los picos. Divide la serie en ~n/2 tramos y de
 * cada uno guarda el punto mínimo y el máximo (en orden de tiempo). Tomar 1 de cada N escondía un trip de 2 min
 * en un gráfico de 6 h. Puntos con valor null se conservan como cortes si caen en el tramo.
 */
export function minMaxDownsample<P extends { t: number; v: number | null }>(points: P[], n = 720): P[] {
  if (points.length <= n) return points
  const buckets = Math.max(1, Math.floor(n / 2))
  const size = Math.ceil(points.length / buckets)
  const out: P[] = []
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size)
    let lo: P | null = null
    let hi: P | null = null
    for (const p of chunk) {
      if (p.v === null) continue
      if (!lo || p.v < (lo.v as number)) lo = p
      if (!hi || p.v > (hi.v as number)) hi = p
    }
    if (!lo || !hi) { out.push(chunk[0]); continue }
    if (lo === hi) out.push(lo)
    else out.push(...(lo.t <= hi.t ? [lo, hi] : [hi, lo]))
  }
  return out
}
