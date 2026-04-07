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