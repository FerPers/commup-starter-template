'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanAssignment, scopeIds, type Assignment, type GenerationScope, type GenerationSummary } from '@/lib/itr/generation'
import { fromJson } from '@/lib/supabase/casts'

// S19 (C-14, decisión de Luis 2026-10-20): generar ITR por alcance × fase desde la matriz aprobada. La vista previa
// y cada lote los calcula la BD (SECURITY INVOKER: RLS, numeración atómica, firmas congeladas y guardas de
// asignación). La pantalla llama runItrGenerationBatch hasta que `remaining` = 0 (idempotente).

function rpcScope(input: GenerationScope) {
  return {
    p_project_id: input.projectId,
    p_phase_ids: scopeIds(input.phaseIds) ?? [],
    p_system_ids: scopeIds(input.systemIds) ?? undefined,
    p_subsystem_ids: scopeIds(input.subsystemIds) ?? undefined,
    p_tag_ids: scopeIds(input.tagIds) ?? undefined,
  }
}

export const previewItrGeneration = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: GenerationScope): Promise<{ summary?: GenerationSummary; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!scopeIds(input.phaseIds)) return { error: t('itrGeneration.phaseRequired') }
    const { data, error } = await ctx.supabase.rpc('itr_generation_summary', rpcScope(input))
    if (error) return { error: error.message }
    return { summary: fromJson<GenerationSummary>(data) }
  },
)

export const runItrGenerationBatch = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: GenerationScope & { assign: Assignment }): Promise<{ created?: number; remaining?: number; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!scopeIds(input.phaseIds)) return { error: t('itrGeneration.phaseRequired') }
    const clean = cleanAssignment(input.assign ?? {})
    if ('error' in clean) return { error: t('itrGeneration.samePerson') }

    const { data, error } = await ctx.supabase.rpc('generate_itrs', {
      ...rpcScope(input), p_assign: clean.assign, p_limit: 300,
    })
    if (error) return { error: error.message }
    const res = fromJson<{ created: number; remaining: number; assigned: Record<string, number> }>(data)

    // Un aviso por persona y lote (no uno por ITR).
    const rows = Object.entries(res.assigned ?? {})
      .filter(([uid, n]) => uid !== ctx.userId && n > 0)
      .map(([uid, n]) => ({
        org_id: ctx.orgId,
        recipient_user_id: uid,
        kind: 'itr_bulk_assigned',
        title: `Te asignaron ${n} ITR`,
        body: null,
        link_url: `/projects/${input.projectId}/itrs?assignee=me`,
        payload: { projectId: input.projectId, count: n },
      }))
    if (rows.length > 0) {
      const { error: notifErr } = await createAdminClient().from('notifications').insert(rows)
      if (notifErr) console.error('[notifications.insert itr_bulk_assigned]', notifErr)
    }

    if (res.created > 0) {
      revalidatePath(`/projects/${input.projectId}/itrs`)
      for (const tagId of scopeIds(input.tagIds) ?? []) revalidatePath(`/projects/${input.projectId}/tags/${tagId}`)
    }
    return { created: res.created, remaining: res.remaining }
  },
)
