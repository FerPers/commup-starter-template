/**
 * Utilidades puras de la bandeja de salida (Sprint O). Sin imports de Next ni
 * Supabase para poder testearlas en vitest; src/lib/sync/outbox.ts las re-exporta.
 */

/** Prefijo de los ids locales de adjuntos pendientes (`local:<id de la bandeja>`). */
export const LOCAL_ATTACHMENT_PREFIX = 'local:'

export function localAttachmentId(outboxId: number): string {
  return `${LOCAL_ATTACHMENT_PREFIX}${outboxId}`
}

export function parseLocalAttachmentId(id: string): number | null {
  if (!id.startsWith(LOCAL_ATTACHMENT_PREFIX)) return null
  const n = Number(id.slice(LOCAL_ATTACHMENT_PREFIX.length))
  return Number.isFinite(n) ? n : null
}

/**
 * true si el fallo huele a red (sin conexión, fetch abortado) y no a un rechazo
 * del servidor. `online` permite inyectar navigator.onLine en tests.
 */
export function isNetworkFailure(err: unknown, online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine): boolean {
  if (!online) return true
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return err instanceof TypeError || /fetch|network|load failed|connection/i.test(msg)
}

export function storagePathFor(itrId: string, itemId: string | null, fileName: string, now: number = Date.now()): string {
  const ext = fileName.split('.').pop() ?? 'jpg'
  return `${itrId}/${itemId ?? 'general'}/${now}-${Math.random().toString(36).slice(2)}.${ext}`
}

// ── Política de reintentos de la bandeja ──────────────────────────────

export type OutboxKind = 'photo' | 'punch' | 'signature'

/**
 * Intentos máximos ante un rechazo lógico del servidor (no de red) antes de
 * descartar la entrada dejando rastro en sync_conflicts.
 * Fotos y punches: 3 (un permiso o validación transitoria puede corregirse).
 * Firmas: 1 — si el servidor la rechaza es porque el ITR cambió de estado
 * (rechazado, ya firmado, aprobado) y reintentar no la haría válida.
 */
export const OUTBOX_MAX_ATTEMPTS: Record<OutboxKind, number> = { photo: 3, punch: 3, signature: 1 }

export function outboxPolicy(kind: OutboxKind, attemptsSoFar: number): 'retry' | 'drop' {
  return attemptsSoFar + 1 >= OUTBOX_MAX_ATTEMPTS[kind] ? 'drop' : 'retry'
}

// ── Estado local del ITR (espejo de upsertResponse en el servidor) ─────

export type LocalItrStatus = 'not_started' | 'in_progress' | 'completed' | 'rejected'

/**
 * Calcula progreso y estado con las respuestas locales, igual que el servidor:
 * pct = respuestas / ítems de la plantilla (todos, no solo los visibles);
 * 100 % con algún crítico fallado → rejected, si no → completed.
 * Permite decidir si se puede firmar sin red antes de que el servidor lo sepa.
 */
export function localItrStatus(
  items: ReadonlyArray<{ id: string; is_critical: boolean }>,
  responses: Readonly<Record<string, { is_passed?: boolean | null } | undefined>>,
): { pct: number; status: LocalItrStatus } {
  const total = items.length
  const done = items.filter(i => responses[i.id] !== undefined).length
  const pct = total ? Math.round((done / total) * 100) : 0
  const hasCriticalFail = items.some(i => i.is_critical && responses[i.id]?.is_passed === false)
  const status: LocalItrStatus = pct === 0 ? 'not_started' : pct < 100 ? 'in_progress' : hasCriticalFail ? 'rejected' : 'completed'
  return { pct, status }
}
