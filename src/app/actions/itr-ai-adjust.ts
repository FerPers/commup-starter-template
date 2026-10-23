'use server'

import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { AI_NOT_CONFIGURED, isAiConfigured } from '@/lib/ai/claude'
import { aiCostUsd } from '@/lib/ai/pricing'
import { runAi } from '@/lib/ai/run'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAdjustCandidates } from '@/lib/itr/ai-adjust-server'
import {
  ADJUST_RULES, AdjustOutput, SIGNATURES_PER_CALL, buildAdjustPrompt, catalogPrompt, reconcileAdjust,
  type AiSignaturePage,
} from '@/lib/itr/ai-adjust'

// R4 (plan referente; decisiones de Luis 2026-10-23): ajustes con IA por firma. Correr la IA = Propietario,
// Administrador o Arquitecto (gasta Opus; escribe revisiones y propuestas con service role). Aceptar o rechazar =
// Líder en adelante, por la RPC decide_tag_itr_ai_proposal (crea excepciones source 'ai' sin pisar las manuales).

/** Revisa con la IA el siguiente lote de firmas sin revisar o desactualizadas. */
export const runItrAdjustBatch = withAuth(
  { role: PRIVILEGED_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string }): Promise<{ error?: string; reviewed?: number; proposals?: number; remaining?: number; costUsd?: number }> => {
    if (!isAiConfigured()) return { error: AI_NOT_CONFIGURED }
    const { data, error } = await ctx.supabase.rpc('tag_ai_signatures', { p_project_id: input.projectId, p_status: 'pending', p_limit: SIGNATURES_PER_CALL, p_offset: 0 })
    if (error) return { error: error.message }
    const page = data as unknown as AiSignaturePage
    if (!page.groups.length) return { reviewed: 0, proposals: 0, remaining: 0, costUsd: 0 }

    const candidates = await loadAdjustCandidates(ctx.supabase, ctx.orgId, input.projectId)
    if (!candidates.length) return { error: 'No hay plantillas activas dentro del alcance de disciplinas del proyecto.' }
    const { data: phases } = await ctx.supabase.from('project_phases').select('code, name, order_index').eq('org_id', ctx.orgId).order('order_index').limit(100)

    const run = await runAi({ orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId, feature: 'itr_adjust' }, (client, model) =>
      client.messages.parse({
        model,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: zodOutputFormat(AdjustOutput) },
        system: [
          { type: 'text', text: ADJUST_RULES },
          {
            type: 'text',
            text: `Fases: ${(phases ?? []).map(p => `${p.code} = ${p.name}`).join('; ')}\n\nCATÁLOGO (código | título | disciplina | fase):\n${catalogPrompt(candidates)}`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: buildAdjustPrompt(page.groups) }],
      }))
    if (!run.response) return { error: run.error }
    const parsed = run.response.parsed_output
    if (!parsed) return { error: 'La respuesta de la IA no pudo interpretarse. Intenta de nuevo.' }
    const model = run.response.model
    const adjusts = reconcileAdjust(parsed, page.groups, new Set(candidates.map(c => c.code.toUpperCase())))

    // Una revisión por firma (la base que vio la IA). Desactualizada: se actualiza y sus propuestas abiertas se
    // reemplazan; lo aceptado o rechazado queda como historia (y lo rechazado no se vuelve a proponer).
    const admin = createAdminClient()
    let proposals = 0
    for (const [i, g] of page.groups.entries()) {
      let q = admin.from('tag_itr_ai_reviews').select('id')
        .eq('project_id', input.projectId).eq('equipment_type_id', g.equipment_type_id).eq('prefix', g.prefix).eq('desc_norm', g.desc_norm)
      q = g.discipline_id ? q.eq('discipline_id', g.discipline_id) : q.is('discipline_id', null)
      const { data: existing } = await q.maybeSingle()
      let reviewId = existing?.id
      if (reviewId) {
        const { error: upErr } = await admin.from('tag_itr_ai_reviews')
          .update({ base_codes: g.base, model, created_by: ctx.userId, created_at: new Date().toISOString() }).eq('id', reviewId)
        if (upErr) return { error: upErr.message }
        await admin.from('tag_itr_ai_proposals').delete().eq('review_id', reviewId).eq('status', 'proposed')
      } else {
        const { data: created, error: insErr } = await admin.from('tag_itr_ai_reviews').insert({
          org_id: ctx.orgId, project_id: input.projectId, equipment_type_id: g.equipment_type_id, prefix: g.prefix,
          discipline_id: g.discipline_id, desc_norm: g.desc_norm, base_codes: g.base, model, created_by: ctx.userId,
        }).select('id').single()
        if (insErr) return { error: insErr.message }
        reviewId = created.id
      }
      const list = adjusts.get(i) ?? []
      if (list.length) {
        const { error: pErr } = await admin.from('tag_itr_ai_proposals').upsert(
          list.map(p => ({ org_id: ctx.orgId, project_id: input.projectId, review_id: reviewId!, template_code: p.code, action: p.action, confidence: p.confidence, reason: p.reason })),
          { onConflict: 'review_id,template_code,action', ignoreDuplicates: true },
        )
        if (pErr) return { error: pErr.message }
        proposals += list.length
      }
    }

    const remaining = page.pending + page.stale - page.groups.length
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'tag.itr_ai_reviewed', entityType: 'project', entityId: input.projectId,
      payload: { model, signatures: page.groups.length, proposals, remaining },
    })
    revalidatePath(`/projects/${input.projectId}/itrs/requirements/ai`)
    return { reviewed: page.groups.length, proposals, remaining: Math.max(0, remaining), costUsd: aiCostUsd(model, run.response.usage) }
  },
)

const DECIDE_ERRORS = ['already_decided', 'out_of_scope', 'template_not_found', 'template_by_source', 'proposal_not_found'] as const

/** Acepta o rechaza propuestas (una por llamada a la RPC; cada una en su transacción). */
export const decideItrAdjust = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string; proposalIds: string[]; decision: 'accept' | 'reject' }): Promise<{ error?: string; applied?: number; skipped?: number; decided?: number }> => {
    const ids = [...new Set(input.proposalIds)].slice(0, 50)
    // Solo propuestas de este proyecto (la RPC vuelve a verificar membresía y rol).
    const { data: own } = await ctx.supabase.from('tag_itr_ai_proposals').select('id').eq('project_id', input.projectId).in('id', ids)
    let applied = 0, skipped = 0, decided = 0
    for (const { id } of own ?? []) {
      const { data, error } = await ctx.supabase.rpc('decide_tag_itr_ai_proposal', { p_proposal_id: id, p_decision: input.decision })
      if (error) return { error: DECIDE_ERRORS.find(c => error.message.includes(c)) ?? error.message, applied, skipped, decided }
      const r = data as unknown as { applied: number; skipped: number }
      applied += r.applied; skipped += r.skipped; decided++
    }
    revalidatePath(`/projects/${input.projectId}/itrs/requirements`, 'layout')
    return { applied, skipped, decided }
  },
)
