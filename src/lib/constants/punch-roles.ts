/**
 * Quién levanta punch, comenta y adjunta fotos (C-03, revisión 2026-10-19): los editores y el
 * inspector, que es quien encuentra la deficiencia en campo. El cliente no. Cancelar, reasignar,
 * borrar y revisar categoría siguen en EDITOR_ROLES. Vive aquí (no en permissions.ts) porque lo
 * usan también componentes cliente.
 */
import { ROLE_TIERS } from '@/lib/constants/roles'
export const PUNCH_RAISE_ROLES: readonly string[] = ['owner', 'admin', 'architect', 'leader', 'inspector']

export function canRaisePunch(role: string | null | undefined): boolean {
  return !!role && PUNCH_RAISE_ROLES.includes(role)
}

/**
 * Quién cancela y recategoriza (S06, D8): un supervisor (leader+), espejo de `cancel_punch` y
 * `review_punch_category`. Aquí por la misma razón: lo usan componentes cliente.
 */
export const PUNCH_SUPERVISOR_ROLES: readonly string[] = ROLE_TIERS.editor

export function canSupervisePunch(role: string | null | undefined): boolean {
  return !!role && PUNCH_SUPERVISOR_ROLES.includes(role)
}
