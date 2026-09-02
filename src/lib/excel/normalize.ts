// Normalización de referencias que se comparan por texto entre módulos.
// Seguro para cliente y servidor (sin dependencias).

/**
 * Referencia de plano P&ID: mayúsculas, espacios colapsados. Tags, señales y
 * documentos P&ID se vinculan por este texto, así que "p&id-001 " y "P&ID-001"
 * deben coincidir.
 */
export function normalizePidRef(value: unknown): string | null {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
  return s.length ? s : null
}

/** Código de área / sistema / subsistema: mayúsculas, recortado, con fallback. */
export function normalizeCode(value: unknown, fallback: string): string {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
  return s.length ? s : fallback
}

/** Texto recortado o null si viene vacío/undefined (para columnas opcionales). */
export function textOrNull(value: unknown): string | null {
  const s = String(value ?? '').trim()
  return s.length ? s : null
}

/** Texto recortado o `fallback` si viene vacío/undefined. */
export function textOr(value: unknown, fallback: string): string {
  return textOrNull(value) ?? fallback
}
