'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { revalidatePath } from 'next/cache'

const EDITOR_ROLES = ['owner', 'admin', 'architect', 'leader']

export async function bulkAssignItrs(
  ids: string[],
  userId: string,
  role: 'executor' | 'supervisor' | 'client',
): Promise<{ error?: string }> {
  if (!ids.length) return {}
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!EDITOR_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

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
