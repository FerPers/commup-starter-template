import { cookies } from 'next/headers'
import { createClient } from './server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const ACTIVE_ORG_COOKIE = 'active_org_id'

export type Membership = {
  orgId: string
  role: string
}

export type ActiveContext = {
  supabase: SupabaseClient
  userId: string
  userEmail: string | null
  orgId: string
  role: string
}

export async function getActiveMembership(): Promise<ActiveContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, role, joined_at')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  if (!memberships || memberships.length === 0) return null

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
    .select('org_id, role, joined_at, organizations(name)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  if (!data) return []

  return data.map(m => {
    const orgRel = m.organizations as { name: string } | { name: string }[] | null
    const orgName = Array.isArray(orgRel) ? (orgRel[0]?.name ?? '') : (orgRel?.name ?? '')
    return {
      orgId: m.org_id as string,
      role: m.role as string,
      orgName,
    }
  })
}
