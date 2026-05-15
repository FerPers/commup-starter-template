/**
 * CommUp — Centralized auth/permission helpers for server actions and route handlers.
 *
 * Role tiers (least → most permissive):
 *   OWNER       → only org owner
 *   ADMIN       → owner + admin (user/billing/org management)
 *   PRIVILEGED  → owner + admin + architect (config, templates, structure)
 *   EDITOR      → owner + admin + architect + leader (field execution edits)
 *   any member  → owner + admin + architect + leader + viewer + …
 *
 * Anything below EDITOR is read-only by convention.
 */
import { getActiveMembership, type ActiveContext } from '@/lib/supabase/membership'

export { getActiveMembership } from '@/lib/supabase/membership'
export type { ActiveContext, Membership } from '@/lib/supabase/membership'

export const OWNER_ROLES: readonly string[] = ['owner']
export const ADMIN_ROLES: readonly string[] = ['owner', 'admin']
export const PRIVILEGED_ROLES: readonly string[] = ['owner', 'admin', 'architect']
export const EDITOR_ROLES: readonly string[] = ['owner', 'admin', 'architect', 'leader']

export function isOwner(role: string): boolean {
  return OWNER_ROLES.includes(role)
}

export function isAdmin(role: string): boolean {
  return ADMIN_ROLES.includes(role)
}

export function isPrivileged(role: string): boolean {
  return PRIVILEGED_ROLES.includes(role)
}

export function isEditor(role: string): boolean {
  return EDITOR_ROLES.includes(role)
}

export type AuthError = { error: string }
export type AuthResult = ActiveContext | AuthError

export function isAuthError(result: AuthResult): result is AuthError {
  return 'error' in result
}

/**
 * Require an authenticated user with an active org membership.
 * Returns the full ActiveContext (supabase client, userId, orgId, role) on success,
 * or `{ error }` on failure. Callers discriminate with `isAuthError(result)`.
 */
export async function requireAuth(): Promise<AuthResult> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }
  return ctx
}

/**
 * Require an authenticated user whose role is in the allowed set.
 * @param allowedRoles tuple or array of role names (use the exported constants)
 */
export async function requireRole(
  allowedRoles: readonly string[],
): Promise<AuthResult> {
  const ctx = await requireAuth()
  if (isAuthError(ctx)) return ctx
  if (!allowedRoles.includes(ctx.role)) return { error: 'Sin permisos' }
  return ctx
}

export function requireOwner(): Promise<AuthResult> {
  return requireRole(OWNER_ROLES)
}

export function requireAdmin(): Promise<AuthResult> {
  return requireRole(ADMIN_ROLES)
}

export function requirePrivileged(): Promise<AuthResult> {
  return requireRole(PRIVILEGED_ROLES)
}

export function requireEditor(): Promise<AuthResult> {
  return requireRole(EDITOR_ROLES)
}
