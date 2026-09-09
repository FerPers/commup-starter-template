import { evaluateItrCompletion, type CompletionItem, type CompletionResponse, type CompletionAttachment } from '../itr/completion'

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

/** Shared capture validation; technical acceptance remains a separate gate. */
export function localItrStatus(
  items: ReadonlyArray<CompletionItem & { is_critical: boolean }>,
  responses: Readonly<Record<string, Partial<CompletionResponse> & { is_passed?: boolean | null } | undefined>>,
  attachments: readonly CompletionAttachment[] = [],
): { pct: number; status: LocalItrStatus } {
  const answers = Object.entries(responses).flatMap(([item_id, response]) => response ? [{
    item_id, value_text: response.value_text ?? null, value_numeric: response.value_numeric ?? null,
    value_bool: response.value_bool ?? null, value_option: response.value_option ?? null, remarks: response.remarks ?? null,
  }] : [])
  const result = evaluateItrCompletion(items, answers, attachments)
  const applicable = new Set(result.applicableItemIds)
  const rejected = result.rejectedItemIds.length > 0 || items.some(item => applicable.has(item.id) && item.is_critical && responses[item.id]?.is_passed === false)
  const status: LocalItrStatus = rejected ? 'rejected' : result.isComplete ? 'completed' : result.completedCount > 0 ? 'in_progress' : 'not_started'
  return { pct: result.progressPct, status }
}
