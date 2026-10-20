import { cookies } from 'next/headers'
import { createClient } from './server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { inactiveState, isActiveMembership } from '@/lib/members/catalog'

export { isActiveMembership }

export const ACTIVE_ORG_COOKIE = 'active_org_id'

export type InactiveMembership = { orgId: string; orgName: string; role: string; state: 'invited' | 'suspended' | 'expired'; reason: string | null }

/** Membresías que no dan acceso (invitaciones por aceptar, suspendidas o vencidas) para /access y el aviso. */
export async function listInactiveMemberships(): Promise<InactiveMembership[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('org_members')
    .select('org_id, role, status, access_expires_at, suspend_reason, organizations(name)')
    .eq('user_id', user.id)
  return (data ?? []).filter(m => !isActiveMembership(m)).map(m => {
    const org = m.organizations as { name: string } | { name: string }[] | null
    return {
      orgId: m.org_id,
      orgName: Array.isArray(org) ? (org[0]?.name ?? '') : (org?.name ?? ''),
      role: m.role,
      state: inactiveState(m) ?? 'expired',
      reason: m.suspend_reason,
    }
  })
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

export async function getActiveMembership(): Promise<ActiveContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: rows } = await supabase
    .from('org_members')
    .select('org_id, role, joined_at, status, access_expires_at')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  // S15 (I-21): solo membresías activas y no vencidas (= SQL get_my_org_ids).
  const memberships = (rows ?? []).filter(m => isActiveMembership(m))
  if (memberships.length === 0) return null

  const cookieStore = await cookies()
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value

  const active = (activeOrgId ? memberships.find(m => m.org_id === activeOrgId) : undefined) ?? memberships[0]

  return {
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    orgId: active.org_id as string,
    role: active.role as string,
  }
}

export async function listMemberships(): Promise<Array<Membership & { orgName: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('org_members')
    .select('org_id, role, joined_at, status, access_expires_at, organizations(name)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  if (!data) return []

  return data.filter(m => isActiveMembership(m)).map(m => {
    const orgRel = m.organizations as { name: string } | { name: string }[] | null
    const orgName = Array.isArray(orgRel) ? (orgRel[0]?.name ?? '') : (orgRel?.name ?? '')
    return {
      orgId: m.org_id as string,
      role: m.role as string,
      orgName,
    }
  })
}
