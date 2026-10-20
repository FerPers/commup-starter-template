// Estado de membresía (S15, I-21; migración 20261110120000). Puro: lo usan membership.ts (servidor), el layout de
// setup y las pantallas. Una membresía da acceso solo si está activa y no venció
// (= SQL get_my_org_ids / is_org_member: status = 'active' AND (access_expires_at IS NULL OR > now())).

export const MEMBER_STATUSES = ['invited', 'active', 'suspended'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export function isActiveMembership(m: { status: string; access_expires_at: string | null }, now: Date = new Date()): boolean {
  return m.status === 'active' && (!m.access_expires_at || new Date(m.access_expires_at) > now)
}

/** Por qué una membresía no da acceso (o null si lo da). */
export function inactiveState(m: { status: string; access_expires_at: string | null }, now: Date = new Date()): 'invited' | 'suspended' | 'expired' | null {
  if (isActiveMembership(m, now)) return null
  return m.status === 'invited' ? 'invited' : m.status === 'suspended' ? 'suspended' : 'expired'
}
