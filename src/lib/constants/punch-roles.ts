/**
 * Quién levanta punch, comenta y adjunta fotos (C-03, revisión 2026-10-19): los editores y el
 * inspector, que es quien encuentra la deficiencia en campo. El cliente no. Cancelar, reasignar,
 * borrar y revisar categoría siguen en EDITOR_ROLES. Vive aquí (no en permissions.ts) porque lo
 * usan también componentes cliente.
 */
export const PUNCH_RAISE_ROLES: readonly string[] = ['owner', 'admin', 'architect', 'leader', 'inspector']

export function canRaisePunch(role: string | null | undefined): boolean {
  return !!role && PUNCH_RAISE_ROLES.includes(role)
}
