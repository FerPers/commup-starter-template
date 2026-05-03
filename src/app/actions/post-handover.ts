'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { revalidatePath } from 'next/cache'

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
