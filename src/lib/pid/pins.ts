// Semáforo del pin del P&ID: el estado de completamiento manda sobre la disciplina (la disciplina queda como
// glifo interior). Rojo = bloqueante.
export const PIN_STATUS_COLORS = {
  punchA: '#dc2626',
  complete: '#16a34a',
  progress: '#f59e0b',
  pending: '#94a3b8',
} as const

export function pinStatusColor(h: { open_punches_a: number; itr_completion_pct: number }): string {
  if (h.open_punches_a > 0) return PIN_STATUS_COLORS.punchA
  if (h.itr_completion_pct >= 100) return PIN_STATUS_COLORS.complete
  if (h.itr_completion_pct > 0) return PIN_STATUS_COLORS.progress
  return PIN_STATUS_COLORS.pending
}

/** Sistemas presentes en el plano, sin repetir y por código (leyenda «Por sistema»). */
export function systemsOnDrawing<S extends { id: string; code: string }>(pins: { system: S | null }[]): S[] {
  return [...new Map(pins.filter(h => h.system).map(h => [h.system!.id, h.system!])).values()]
    .sort((a, b) => a.code.localeCompare(b.code))
}
