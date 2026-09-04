import type { OrgMemberRole } from '@/types/database'

/**
 * Navegación (Sprint N, 2026-09-04).
 *
 * Roles «de campo»: entran por defecto a «Mi trabajo» (/my-work) en vez del Dashboard de la org.
 * El resto (owner, admin, architect, client) sigue entrando al Dashboard.
 */
export const FIELD_ROLES: readonly OrgMemberRole[] = ['inspector', 'leader']

export function homeForRole(role: string | null | undefined): '/my-work' | '/dashboard' {
  return role && (FIELD_ROLES as readonly string[]).includes(role) ? '/my-work' : '/dashboard'
}

/** Claves de localStorage del sidebar (solo UX; nunca datos sensibles). */
export const NAV_STORAGE = {
  lastProject: 'commup:nav:lastProject',
  adminOpen: 'commup:nav:adminOpen',
} as const
