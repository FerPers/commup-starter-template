'use server'

import { revalidatePath } from 'next/cache'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { isCapacity, type Capacity } from '@/lib/constants/capacities'

// Firmantes designados por proyecto (S14, D14; migración 20261109120000). Solo owner/admin; las RPC vuelven a
// validar el rol, el piso de cada capacidad (client_rep = empresa operadora o rol client) y dejan auditoría.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max)

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/signatories`)
  revalidatePath(`/projects/${projectId}`, 'layout')
  revalidatePath('/my-work')
  revalidatePath('/projects/[id]', 'layout')
}

export const assignProjectCapacity = withAuth(
  { role: ADMIN_ROLES, guards: projectGuard },
  async (ctx, input: { projectId: string; userId: string; capacity: Capacity; note?: string }): Promise<{ error?: string }> => {
    if (!isCapacity(input.capacity)) return { error: 'Capacidad no válida' }
    const { error } = await ctx.supabase.rpc('assign_project_capacity', {
      p_project_id: input.projectId, p_user_id: input.userId, p_capacity: input.capacity,
      ...(txt(input.note, 500) ? { p_note: txt(input.note, 500) } : {}),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

export const revokeProjectCapacity = withAuth(
  { role: ADMIN_ROLES, guards: projectGuard },
  async (ctx, input: { projectId: string; id: string; reason: string }): Promise<{ error?: string }> => {
    const reason = txt(input.reason, 500)
    if (reason.length < 3) return { error: 'Indica el motivo' }
    const { data: row } = await ctx.supabase.from('project_capacities').select('id').eq('id', input.id).eq('project_id', input.projectId).maybeSingle()
    if (!row) return { error: 'Designación no encontrada' }
    const { error } = await ctx.supabase.rpc('revoke_project_capacity', { p_id: input.id, p_reason: reason })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)
