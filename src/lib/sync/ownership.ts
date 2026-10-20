/**
 * S18 (C-08/E-01/G-02/A-09) — de quién es cada captura sin red. Reglas puras (sin Next ni Supabase) para vitest.
 *
 * Cada entrada de las bandejas (respuestas, fotos/punch/firmas, arranque) guarda `capturedBy` = usuario en sesión
 * al capturar. El replay solo envía las del usuario en sesión: así lo que A capturó nunca sale a nombre de B en una
 * tablet compartida. Decisiones de Luis (2026-10-20):
 *   - Cerrar sesión con pendientes: «sincronizar o descartar»; al salir se vacían las bandejas y las cachés.
 *   - Entradas de antes de esta versión (sin `capturedBy`): retenidas hasta que quien está en sesión confirme
 *     «son mías» (se le asignan) o las descarte (queda rastro en sync_conflicts).
 */

export type Owned = { capturedBy?: string | null }
export type Ownership = 'mine' | 'legacy' | 'other'

export function ownershipOf(entry: Owned, userId: string | null): Ownership {
  if (!entry.capturedBy) return 'legacy'
  return userId !== null && entry.capturedBy === userId ? 'mine' : 'other'
}

/** Solo lo que el replay puede enviar con la sesión actual. Sin sesión, nada. */
export function sendableBy<T extends Owned>(rows: readonly T[], userId: string | null): T[] {
  return userId ? rows.filter(r => ownershipOf(r, userId) === 'mine') : []
}

export type OwnerCounts = { mine: number; legacy: number; other: number }

export function countByOwner(rows: readonly Owned[], userId: string | null): OwnerCounts {
  const out: OwnerCounts = { mine: 0, legacy: 0, other: 0 }
  for (const r of rows) out[ownershipOf(r, userId)]++
  return out
}

export const totalOwned = (c: OwnerCounts): number => c.mine + c.legacy + c.other
