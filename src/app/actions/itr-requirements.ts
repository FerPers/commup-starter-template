'use server'

import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'

// R2a (maquetas M): excepciones al requisito base de un tag. Única escritura = RPC set_tag_itr_override (Líder en
// adelante): agregar un código dentro del alcance de disciplinas, excluir con motivo ≥ 10 o quitar la excepción.
// Errores con código para la UI: reason_required · out_of_scope · template_not_found · invalid_override.
const CODES = ['reason_required', 'out_of_scope', 'template_not_found', 'invalid_override'] as const

export const setTagItrOverride = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }, { resource: 'tag', field: 'tagId', scopeField: 'projectId' }] },
  async (
    ctx,
    input: { projectId: string; tagId: string; code: string; action: 'add' | 'exclude' | 'clear'; reason?: string | null },
  ): Promise<{ error?: string }> => {
    const why = input.reason?.trim()
    const { error } = await ctx.supabase.rpc('set_tag_itr_override', {
      p_tag_id: input.tagId,
      p_template_code: input.code,
      p_action: input.action,
      ...(why ? { p_reason: why } : {}),
    })
    if (error) return { error: CODES.find(c => error.message.includes(c)) ?? error.message }
    revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}`)
    revalidatePath(`/projects/${input.projectId}/itrs/requirements`)
    return {}
  },
)
