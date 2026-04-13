'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: m } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!m) return null
  return { supabase, orgId: m.org_id as string, userId: user.id, role: m.role as string }
}

export async function bulkUpdateItrStatus(
  ids: string[],
  status: string
): Promise<{ error?: string }> {
  if (!ids.length) return {}
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('itrs')
    .update({ status })
    .in('id', ids)

  if (error) return { error: error.message }
  revalidatePath('/itrs')
  return {}
}

export async function bulkUpdatePunchStatus(
  ids: string[],
  status: string
): Promise<{ error?: string }> {
  if (!ids.length) return {}
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('punches')
    .update({ status })
    .in('id', ids)

  if (error) return { error: error.message }
  revalidatePath('/punch-list')
  return {}
}

export async function bulkUpdateTagStatus(
  ids: string[],
  status: string
): Promise<{ error?: string }> {
  if (!ids.length) return {}
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('tags')
    .update({ status })
    .in('id', ids)

  if (error) return { error: error.message }
  revalidatePath('/tags')
  return {}
}

export async function bulkApproveItrs(
  ids: string[],
  projectId: string,
): Promise<{ approved: number; error?: string }> {
  if (!ids.length) return { approved: 0 }
  const ctx = await getCtx()
  if (!ctx) return { approved: 0, error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { approved: 0, error: 'Sin permisos' }

  // Only approve ITRs that are 'completed' and belong to this project
  const { data, error } = await ctx.supabase
    .from('itrs')
    .update({ status: 'approved' })
    .in('id', ids)
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .select('id')

  if (error) return { approved: 0, error: error.message }

  const approved = data?.length ?? 0
  if (approved > 0) revalidatePath(`/projects/${projectId}/itrs`)
  return { approved }
}

export async function bulkAssignItrs(
  ids: string[],
  userId: string,
  role: 'executor' | 'supervisor' | 'client'
): Promise<{ error?: string }> {
  if (!ids.length) return {}
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  // Upsert: delete existing assignment for that role, then insert new ones
  const { error: delErr } = await ctx.supabase
    .from('itr_assignments')
    .delete()
    .in('itr_id', ids)
    .eq('role', role)

  if (delErr) return { error: delErr.message }

  const rows = ids.map(itr_id => ({ itr_id, user_id: userId, role }))
  const { error: insErr } = await ctx.supabase
    .from('itr_assignments')
    .insert(rows)

  if (insErr) return { error: insErr.message }
  revalidatePath('/itrs')
  return {}
}