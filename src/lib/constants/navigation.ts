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
  /** N1: últimos proyectos abiertos (ids, más reciente primero) para el selector. */
  recentProjects: 'commup:nav:recentProjects',
  /** N1: «Más…» abierto o cerrado (decisión: se recuerda). */
  moreOpen: 'commup:nav:moreOpen',
  /** A19 · C: prefijo (sessionStorage) de las fases de la org del proyecto, para no pedirlas en cada página. */
  menuPhases: 'commup:nav:menuPhases:',
  /** A19 · C (D2): prefijo (localStorage) de las fases que el usuario dejó abiertas en ese proyecto. */
  openPhases: 'commup:nav:openPhases:',
  /** A19 · C: «Configuración del proyecto» y «Por fase» abiertos o cerrados. */
  configOpen: 'commup:nav:configOpen',
  byPhaseOpen: 'commup:nav:byPhaseOpen',
} as const
