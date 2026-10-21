import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from './server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { inactiveState, isActiveMembership } from '@/lib/members/catalog'

export { isActiveMembership }

export const ACTIVE_ORG_COOKIE = 'active_org_id'

type MemberRow = {
  org_id: string; role: string; joined_at: string | null; status: string; access_expires_at: string | null
  suspend_reason: string | null; organizations: { name: string } | { name: string }[] | null
}

/**
 * S20 (G-07): una sola verificación de sesión (`getUser`) y una sola consulta de `org_members` por request, compartidas
 * por getActiveMembership, listMemberships y listInactiveMemberships (antes: 3 `getUser` + 3 consultas en cada
 * navegación y en cada `router.refresh()`). `cache()` memoiza durante el render; en una server action no memoiza, así
 * que el cambio de org (cookie) se ve en el render siguiente.
 */
const loadMembershipRows = cache(async (): Promise<{
  supabase: SupabaseClient<Database>; user: { id: string; email: string | null } | null; rows: MemberRow[]
}> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, rows: [] }
  const { data } = await supabase
    .from('org_members')
    .select('org_id, role, joined_at, status, access_expires_at, suspend_reason, organizations(name)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })
  return { supabase, user: { id: user.id, email: user.email ?? null }, rows: (data ?? []) as MemberRow[] }
})

function orgNameOf(rel: MemberRow['organizations']): string {
  return Array.isArray(rel) ? (rel[0]?.name ?? '') : (rel?.name ?? '')
}

export type InactiveMembership = { orgId: string; orgName: string; role: string; state: 'invited' | 'suspended' | 'expired'; reason: string | null }

/** Membresías que no dan acceso (invitaciones por aceptar, suspendidas o vencidas) para /access y el aviso. */
export async function listInactiveMemberships(): Promise<InactiveMembership[]> {
  const { rows } = await loadMembershipRows()
  return rows.filter(m => !isActiveMembership(m)).map(m => ({
    orgId: m.org_id,
    orgName: orgNameOf(m.organizations),
    role: m.role,
    state: inactiveState(m) ?? 'expired',
    reason: m.suspend_reason,
  }))
}

export type Membership = {
  orgId: string
  role: string
}

export type ActiveContext = {
  supabase: SupabaseClient<Database>
  userId: string
  userEmail: string | null
  orgId: string
  role: string
}

export const getActiveMembership = cache(async (): Promise<ActiveContext | null> => {
  const { supabase, user, rows } = await loadMembershipRows()
  if (!user) return null

  // S15 (I-21): solo membresías activas y no vencidas (= SQL get_my_org_ids).
  const memberships = rows.filter(m => isActiveMembership(m))
  if (memberships.length === 0) return null

  const cookieStore = await cookies()
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value

  const active = (activeOrgId ? memberships.find(m => m.org_id === activeOrgId) : undefined) ?? memberships[0]

  return {
    supabase,
    userId: user.id,
    userEmail: user.email,
    orgId: active.org_id,
    role: active.role,
  }
})

export async function listMemberships(): Promise<Array<Membership & { orgName: string }>> {
  const { rows } = await loadMembershipRows()
  return rows.filter(m => isActiveMembership(m)).map(m => ({
    orgId: m.org_id,
    role: m.role,
    orgName: orgNameOf(m.organizations),
  }))
}

/** S20 (G-07): contadores de «Mi trabajo» una vez por request (los piden el layout y la página /my-work). */
export const getMyWorkCounts = cache(async (orgId: string) => {
  const { supabase } = await loadMembershipRows()
  const { data } = await supabase.rpc('my_work_counts', { p_org_id: orgId })
  return data
})
