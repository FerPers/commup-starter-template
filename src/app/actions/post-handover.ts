'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

export async function transferPunchToOpsAction(input: {
  punchId: string
  transferredTo: string
  opsTargetDate?: string | null
  notes?: string | null
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Not authenticated' }

  const { error } = await ctx.supabase.rpc('transfer_punch_to_ops', {
    p_punch_id:        input.punchId,
    p_transferred_to:  input.transferredTo,
    p_ops_target_date: input.opsTargetDate ?? null,
    p_notes:           input.notes ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/ops/punches')
  return {}
}

export async function updatePunchOpsStatusAction(input: {
  punchId: string
  newStatus: string
  notes?: string | null
  targetDate?: string | null
}): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Not authenticated' }

  const { error } = await ctx.supabase.rpc('update_punch_ops_status', {
    p_punch_id:    input.punchId,
    p_new_status:  input.newStatus,
    p_notes:       input.notes ?? null,
    p_target_date: input.targetDate ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/ops/punches')
  return {}
}
