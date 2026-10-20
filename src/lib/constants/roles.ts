// Niveles de rol de la org (S14, I-15): una sola fuente para servidor y cliente (sin imports de servidor).
// `src/lib/auth/permissions.ts` los reexporta para las acciones; las páginas, el sidebar y los catálogos los
// importan de aquí en lugar de repetir arrays. En SQL: is_org_admin (ADMIN), is_org_editor y
// document_is_controller (EDITOR). Quién firma por capacidad NO es un rol: ver ./capacities.ts.
//
//   OWNER       → solo el dueño de la org
//   ADMIN       → owner + admin (usuarios, configuración de la org, firmantes designados)
//   PRIVILEGED  → owner + admin + architect (plantillas, estructura, importaciones)
//   EDITOR      → owner + admin + architect + leader (decisiones de campo: aprobar, emitir, control documental)
//   inspector   → ejecuta en campo; client → representa al cliente (con capacidades, firma por él)

import type { OrgMemberRole } from '@/types/database'

export const ROLE_TIERS: Readonly<Record<'owner' | 'admin' | 'privileged' | 'editor', readonly string[]>> = {
  owner: ['owner'],
  admin: ['owner', 'admin'],
  privileged: ['owner', 'admin', 'architect'],
  editor: ['owner', 'admin', 'architect', 'leader'],
}

export const OWNER_ROLES: readonly string[] = ROLE_TIERS.owner
export const ADMIN_ROLES: readonly string[] = ROLE_TIERS.admin
export const PRIVILEGED_ROLES: readonly string[] = ROLE_TIERS.privileged
export const EDITOR_ROLES: readonly string[] = ROLE_TIERS.editor

export const hasTier = (tier: keyof typeof ROLE_TIERS, role: string | null | undefined): boolean =>
  !!role && ROLE_TIERS[tier].includes(role)

/** Copia tipada (OrgMemberRole[]) para APIs que exigen el enum (dashboard, colas, guards de certificados). */
export const tierRoles = (tier: keyof typeof ROLE_TIERS): OrgMemberRole[] => [...ROLE_TIERS[tier]] as OrgMemberRole[]
