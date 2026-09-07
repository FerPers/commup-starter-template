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
