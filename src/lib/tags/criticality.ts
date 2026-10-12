/**
 * Criticidad de tags (fase 1 del plan readiness, 2026-10-12).
 *
 * Un tag crítico bloquea su gate aunque el avance sea alto ("98 % pero falta la ESD", libro 9.29):
 * el criterio `critical_tags_ready` de `compute_system_gates` exige sus ITRs aprobados y ningún
 * punch Cat A/B abierto sobre él. Si el tag tiene SIL se sugiere 'safety'.
 */

export const CRITICALITY_LEVELS = ['safety', 'process', 'normal'] as const
export type Criticality = (typeof CRITICALITY_LEVELS)[number]

export function isCriticality(v: unknown): v is Criticality {
  return typeof v === 'string' && (CRITICALITY_LEVELS as readonly string[]).includes(v)
}

const strip = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s_\-/.]+/g, ' ').trim()

const SAFETY = new Set(['SAFETY', 'SEGURIDAD', 'SAFETY CRITICAL', 'CRITICO SEGURIDAD', 'CRITICO DE SEGURIDAD', 'SC', 'SCE'])
const PROCESS = new Set(['PROCESS', 'PROCESO', 'PROCESS CRITICAL', 'CRITICO PROCESO', 'CRITICO DE PROCESO', 'CRITICO', 'CRITICAL', 'PC'])
const NORMAL = new Set(['NORMAL', 'NO', 'NINGUNA', 'NONE', 'NO CRITICO', 'NON CRITICAL'])

/**
 * Texto de Excel → criticidad; vacío o desconocido → undefined (no se toca el valor existente).
 * Sin abreviaturas de una letra: «S» puede ser «Sí» y no «Safety».
 */
export function parseCriticality(text: string | null | undefined): Criticality | undefined {
  if (!text) return undefined
  const v = strip(text)
  if (!v) return undefined
  if (SAFETY.has(v)) return 'safety'
  if (PROCESS.has(v)) return 'process'
  if (NORMAL.has(v)) return 'normal'
  return undefined
}

/** Normaliza el SIL de Excel ("SIL 2", "2", "sil-3") a 'SIL1'…'SIL3' o 'None'; vacío → undefined. */
export function parseSilLevel(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  const v = strip(text).replace(/\s+/g, '')
  if (!v) return undefined
  const m = /^(?:SIL)?([1-4])$/.exec(v)
  if (m) return `SIL${m[1]}`
  if (['NONE', 'NO', 'N/A', 'NA', '0', 'SIL0', '-'].includes(v)) return 'None'
  return undefined
}

/** ¿El SIL declarado indica un tag instrumentado de seguridad? */
export function hasSil(silLevel: string | null | undefined): boolean {
  return !!silLevel && /^SIL[1-4]$/i.test(silLevel.replace(/\s+/g, ''))
}

/** Sugerencia: con SIL declarado → 'safety'; si no, no hay sugerencia. */
export function suggestCriticality(silLevel: string | null | undefined): Criticality | null {
  return hasSil(silLevel) ? 'safety' : null
}
