// Verificación en campo del punch (fase 4 · bloque A, decisión §10.2 del plan readiness).
// «Resuelto» es un sub-estado de in_progress (resolved_at); se muestra como su propio estado
// pero, para gates, certificados y KPIs, sigue siendo un punch abierto.

export type PunchDisplayStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled'

export function punchDisplayStatus(p: { status: string; resolved_at?: string | null }): PunchDisplayStatus {
  if (p.status === 'in_progress' && p.resolved_at) return 'resolved'
  return p.status as PunchDisplayStatus
}

/** Quién puede hacer qué (las mismas reglas que las RPC; la BD decide al final). */
export function punchVerificationRights(
  p: { status: string; resolved_at?: string | null; resolved_by?: string | null },
  userId: string,
  role: string,
) {
  const s = punchDisplayStatus(p)
  return {
    canResolve: (s === 'open' || s === 'in_progress') && role !== 'client',
    canVerify: s === 'resolved' && p.resolved_by !== userId,
    /** Resuelto por el propio usuario: debe verificarlo otra persona. */
    waitingOther: s === 'resolved' && p.resolved_by === userId,
  }
}
