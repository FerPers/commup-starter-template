'use server'

import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
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

// R2b: código del cliente por plantilla. `level` = 'org' (defecto de la org, todos sus proyectos) o 'project' (este
// proyecto, gana sobre el defecto). Valor vacío = quitar. Única escritura = RPC set_template_client_codes
// (Propietario, Administrador, Arquitecto).
const CLIENT_CODE_ERRORS = ['template_not_found', 'client_code_too_long', 'invalid_client_codes'] as const

export const setTemplateClientCodes = withAuth(
  { role: PRIVILEGED_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string; level: 'org' | 'project'; codes: Record<string, string> }): Promise<{ error?: string; changed?: number }> => {
    const { data, error } = await ctx.supabase.rpc('set_template_client_codes', {
      p_project_id: input.projectId, p_level: input.level, p_codes: input.codes,
    })
    if (error) return { error: CLIENT_CODE_ERRORS.find(c => error.message.includes(c)) ?? error.message }
    revalidatePath(`/projects/${input.projectId}/scope`)
    revalidatePath(`/projects/${input.projectId}/itrs/requirements`)
    return { changed: data ?? 0 }
  },
)
