'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { revalidatePath } from 'next/cache'

// Antes no exigían rol — política 2026-05-24: operaciones de transferencia y
// estado post-handover son acciones de gestión → EDITOR. Los RPCs subyacentes
// (SECURITY DEFINER) además verifican is_project_member internamente.

export const transferPunchToOpsAction = withAuth(
  { role: EDITOR_ROLES },
  async (
    ctx,
    input: {
      punchId: string
      transferredTo: string
      opsTargetDate?: string | null
      notes?: string | null
    },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('transfer_punch_to_ops', {
      p_punch_id:        input.punchId,
      p_transferred_to:  input.transferredTo,
      p_ops_target_date: input.opsTargetDate ?? undefined,
      p_notes:           input.notes ?? undefined,
    })
    if (error) return { error: error.message }

    revalidatePath('/ops/punches')
    return {}
  },
)

export const updatePunchOpsStatusAction = withAuth(
  { role: EDITOR_ROLES },
  async (
    ctx,
    input: {
      punchId: string
      newStatus: string
      notes?: string | null
      targetDate?: string | null
    },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('update_punch_ops_status', {
      p_punch_id:    input.punchId,
      p_new_status:  input.newStatus,
      p_notes:       input.notes ?? undefined,
      p_target_date: input.targetDate ?? undefined,
    })
    if (error) return { error: error.message }

    revalidatePath('/ops/punches')
    return {}
  },
)
