import { normalizeCode } from '@/lib/excel/normalize'
import type { RegisterStatus } from './catalog'

// ── Test packs (fase 3, sesión 3 — decisiones §8.6–8.7 del plan readiness) ───────────────
// Avance DERIVADO del ciclo de los packs (sin estado por línea en BD) e importación Excel
// del line list (parseo en ./test-packs-import, que trae xlsx). Puro: sin BD ni React.

export type LineState = 'pending' | 'in_test' | 'tested'

export type PackForProgress = { id: string; status: RegisterStatus; lineIds: string[] }

/**
 * Estado de cada línea según los packs que la contienen: probada si algún pack está verificado;
 * en prueba si alguno está activo o retirado; si no, pendiente. Los packs cancelados no cuentan
 * (una línea que solo estaba en un pack cancelado vuelve a pendiente).
 */
export function lineStates(packs: PackForProgress[]): Map<string, LineState> {
  const rank: Record<LineState, number> = { pending: 0, in_test: 1, tested: 2 }
  const out = new Map<string, LineState>()
  for (const p of packs) {
    if (p.status === 'cancelled') continue
    const s: LineState = p.status === 'verified' ? 'tested' : p.status === 'active' || p.status === 'removed' ? 'in_test' : 'pending'
    for (const l of p.lineIds) {
      const prev = out.get(l)
      if (!prev || rank[s] > rank[prev]) out.set(l, s)
    }
  }
  return out
}

export type ProgressSummary = { total: number; pending: number; in_test: number; tested: number; pct: number }

export function summarize(states: Iterable<LineState>): ProgressSummary {
  const s = { total: 0, pending: 0, in_test: 0, tested: 0, pct: 0 }
  for (const x of states) { s.total++; s[x]++ }
  s.pct = s.total ? Math.round((s.tested / s.total) * 100) : 0
  return s
}

/** ¿Es un número de registro de CommUp (TPK-0001)? Si no, la etiqueta del Excel es el número del cliente (`data.pack_ref`). */
export const isRegisterNumber = (v: string) => /^TPK-\d{4,}$/.test(v)

/** El pack se identifica por su texto normalizado (mayúsculas, sin espacios extremos). */
export const packKey = (v: string) => normalizeCode(v, '')
