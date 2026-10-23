'use server'

import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { aiNotConfigured, isAiConfigured } from '@/lib/ai/claude'
import { aiCostUsd } from '@/lib/ai/pricing'
import { runAi } from '@/lib/ai/run'
import { createAdminClient, emitImportSummary } from '@/lib/supabase/admin'
import type { ActiveContext } from '@/lib/supabase/membership'
import { defaultLineupFlags } from '@/lib/equipment-types'
import { TYPE_CHANGE_REASON_MIN, needsReason, type TagTypePreview } from '@/lib/tags/type-change'
import { cleanTypeCode, detectFree, learnedMap, signatureKey, type CatalogType, type LearnedPrefix, type TypeGroup } from '@/lib/tags/type-signature'
import { GROUPS_PER_CALL, TYPE_RULES, TypeClassification, buildTypePrompt, reconcileTypeProposals, type ClassifyGroup } from '@/lib/tags/type-ai'

// R3 (plan referente; decisiones de Luis 2026-10-23): tipo de equipo editable y clasificación de los tags sin tipo.
// Cambiar el tipo y aceptar o rechazar propuestas = Propietario, Administrador o Arquitecto (el guard de la BD lo
// exige también por REST). La vista previa (tag_type_change_preview) la ve cualquier miembro. Si el cambio deja ITR
// fuera de requisitos se pide un motivo ≥ 10; los ITR nunca se borran. La asignación masiva va en modo bulk (sin un
// evento por tag) con un resumen import.completed y un registro en activity_log.

export type TypeSignature = { prefix: string; disciplineId: string | null; descNorm: string }

const CHUNK = 500
const ERRORS = ['reason_required', 'type_exists', 'invalid_type', 'no_tags', 'equipment_type_not_found'] as const

type Db = ActiveContext['supabase']
// La RPC distingue «sin disciplina» / «quitar el tipo» con NULL explícito (sin DEFAULT en SQL).
const NULL_ID = null as unknown as string

async function resolveTags(
  supabase: Db,
  projectId: string,
  input: { tagIds?: string[]; signature?: TypeSignature },
): Promise<{ ids?: string[]; error?: string }> {
  if (input.signature) {
    const s = input.signature
    const { data, error } = await supabase.rpc('tag_type_group_tags', {
      p_project_id: projectId, p_prefix: s.prefix, p_desc_norm: s.descNorm, p_discipline_id: s.disciplineId ?? NULL_ID,
    })
    if (error) return { error: error.message }
    return { ids: data ?? [] }
  }
  const wanted = [...new Set(input.tagIds ?? [])].slice(0, 5000)
  if (!wanted.length) return { ids: [] }
  const ids: string[] = []
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const { data, error } = await supabase.from('tags').select('id').eq('project_id', projectId).in('id', wanted.slice(i, i + CHUNK))
    if (error) return { error: error.message }
    ids.push(...(data ?? []).map(r => r.id))
  }
  return { ids }
}

async function preview(
  supabase: Db,
  projectId: string, ids: string[], typeId: string | null,
): Promise<{ preview?: TagTypePreview; error?: string }> {
  const { data, error } = await supabase.rpc('tag_type_change_preview', {
    p_project_id: projectId, p_tag_ids: ids, p_type_id: typeId ?? NULL_ID,
  })
  if (error) return { error: ERRORS.find(c => error.message.includes(c)) ?? error.message }
  return { preview: data as unknown as TagTypePreview }
}

/** «Gana X, quedan fuera Y» de poner `typeId` (null = quitar el tipo) a los tags o a la firma. */
export const previewTagTypeChange = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }, { resource: 'equipment_type', field: 'typeId', optional: true }] },
  async (ctx, input: { projectId: string; typeId: string | null; tagIds?: string[]; signature?: TypeSignature }): Promise<{ preview?: TagTypePreview; error?: string }> => {
    const tags = await resolveTags(ctx.supabase, input.projectId, input)
    if (tags.error) return { error: tags.error }
    return preview(ctx.supabase, input.projectId, tags.ids ?? [], input.typeId)
  },
)

/** Vista previa de varios grupos en una sola llamada (las acciones del cliente corren de a una). Tope 60. */
export const previewTagTypeGroups = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { projectId: string; items: { key: string; signature: TypeSignature; typeId: string | null }[] },
  ): Promise<{ previews?: Record<string, TagTypePreview>; error?: string }> => {
    const items = input.items.slice(0, 60)
    const typeIds = [...new Set(items.map(i => i.typeId).filter((x): x is string => !!x))]
    if (typeIds.length) {
      const { data } = await ctx.supabase.from('equipment_types').select('id').eq('org_id', ctx.orgId).in('id', typeIds)
      if ((data ?? []).length !== typeIds.length) return { error: 'equipment_type_not_found' }
    }
    const out = await Promise.all(items.map(async i => {
      const tags = await resolveTags(ctx.supabase, input.projectId, { signature: i.signature })
      if (!tags.ids) return null
      const pv = await preview(ctx.supabase, input.projectId, tags.ids, i.typeId)
      return pv.preview ? ([i.key, pv.preview] as const) : null
    }))
    return { previews: Object.fromEntries(out.filter((x): x is NonNullable<typeof x> => !!x)) }
  },
)

/**
 * Pone el tipo a los tags (uno, varios o los que sigan sin tipo en una firma). `newType` crea antes el tipo en el
 * catálogo de la org (un tipo sin reglas es válido: el elemento pasa a «Sin regla»). Con `proposalId` la propuesta de
 * la IA queda aceptada.
 */
export const assignEquipmentType = withAuth(
  {
    role: PRIVILEGED_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }, { resource: 'equipment_type', field: 'typeId', optional: true }],
  },
  async (
    ctx,
    input: {
      projectId: string
      typeId?: string | null
      newType?: { code: string; name: string; category?: string | null }
      tagIds?: string[]
      signature?: TypeSignature
      reason?: string | null
      proposalId?: string | null
      source?: 'manual' | 'prefix' | 'learned' | 'name' | 'ai'
    },
  ): Promise<{ error?: string; updated?: number; typeId?: string; preview?: TagTypePreview }> => {
    const tags = await resolveTags(ctx.supabase, input.projectId, input)
    if (tags.error) return { error: tags.error }
    const ids = tags.ids ?? []
    if (!ids.length) return { error: 'no_tags' }

    let typeId = input.typeId ?? null
    if (input.newType) {
      const code = cleanTypeCode(input.newType.code)
      const name = input.newType.name?.trim().slice(0, 80)
      if (!code || !name) return { error: 'invalid_type' }
      const { data: dup } = await ctx.supabase.from('equipment_types').select('id').eq('org_id', ctx.orgId).eq('code', code).maybeSingle()
      if (dup) return { error: 'type_exists' }
      const category = (input.newType.category ?? '').trim().slice(0, 60) || null
      const { data: created, error } = await ctx.supabase.from('equipment_types')
        .insert({ org_id: ctx.orgId, code, name, category, ...defaultLineupFlags(code, category) })
        .select('id').single()
      if (error) return { error: error.message }
      typeId = created.id
    }

    const pv = await preview(ctx.supabase, input.projectId, ids, typeId)
    if (!pv.preview) return { error: pv.error }
    const reason = input.reason?.trim() ?? ''
    if (needsReason(pv.preview) && reason.length < TYPE_CHANGE_REASON_MIN) return { error: 'reason_required', preview: pv.preview }

    // Bulk: sin un evento por tag (20 mil tags = 20 mil eventos); el guard de la BD sigue exigiendo un tipo de la org.
    const admin = createAdminClient({ bulk: 'tag_types' })
    let updated = 0
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await admin.from('tags').update({ equipment_type_id: typeId })
        .eq('project_id', input.projectId).in('id', ids.slice(i, i + CHUNK)).select('id')
      if (error) return { error: error.message, updated }
      updated += data?.length ?? 0
    }

    if (input.proposalId) {
      await admin.from('tag_type_proposals')
        .update({ status: 'accepted', decided_by: ctx.userId, decided_at: new Date().toISOString(), ...(typeId ? { equipment_type_id: typeId } : {}) })
        .eq('id', input.proposalId).eq('project_id', input.projectId).eq('status', 'proposed')
    }
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'tag.type_assigned', entityType: 'project', entityId: input.projectId,
      payload: {
        equipment_type_id: typeId, created_type: input.newType ? typeId : null, tags: updated, source: input.source ?? 'manual',
        signature: input.signature ?? null, tag_ids: ids.length <= 50 ? ids : undefined, reason: reason || null,
        gain: pv.preview.gain, outside: pv.preview.outside, outside_signed: pv.preview.outside_signed,
      },
    })
    await emitImportSummary(admin, {
      orgId: ctx.orgId, projectId: input.projectId, actorId: ctx.userId, kind: 'tag_types',
      counts: { updated, gain: pv.preview.gain, outside: pv.preview.outside },
    })

    revalidatePath(`/projects/${input.projectId}/itrs/requirements`, 'layout')
    revalidatePath(`/projects/${input.projectId}/tags`, 'layout')
    return { updated, typeId: typeId ?? undefined, preview: pv.preview }
  },
)

/**
 * Corre la IA sobre las firmas sin detección gratis ni propuesta abierta (hasta GROUPS_PER_CALL por llamada; la
 * pantalla repite mientras `remaining` > 0). Las propuestas reemplazan solo las abiertas de esas firmas.
 */
export const classifyTagTypes = withAuth(
  { role: PRIVILEGED_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string }): Promise<{ error?: string; proposed?: number; remaining?: number; costUsd?: number }> => {
    const t = await getTranslations('ActionErrors')
    if (!isAiConfigured()) return { error: await aiNotConfigured() }
    const [groupsRes, { data: catalog }, { data: open }] = await Promise.all([
      ctx.supabase.rpc('tag_type_groups', { p_project_id: input.projectId }),
      // bounded: catálogo de tipos de una org (decenas a cientos)
      ctx.supabase.from('equipment_types').select('id, code, name, category').eq('org_id', ctx.orgId).order('code').limit(2000),
      // bounded: propuestas de un proyecto (una por firma, tope de grupos 500)
      ctx.supabase.from('tag_type_proposals').select('prefix, discipline_id, desc_norm, status, equipment_type_id, new_type')
        .eq('project_id', input.projectId).in('status', ['proposed', 'rejected']).limit(5000),
    ])
    if (groupsRes.error) return { error: groupsRes.error.message }
    const data = groupsRes.data as unknown as { groups: TypeGroup[]; learned: LearnedPrefix[] }
    const cat = (catalog ?? []) as CatalogType[]
    const learned = learnedMap(data.learned)
    const codeOf = new Map(cat.map(ty => [ty.id, ty.code]))

    const openKeys = new Set((open ?? []).filter(p => p.status === 'proposed').map(signatureKey))
    const rejectedBy = new Map<string, string[]>()
    for (const p of open ?? []) {
      if (p.status !== 'rejected') continue
      const code = p.equipment_type_id ? codeOf.get(p.equipment_type_id) : (p.new_type as { code?: string } | null)?.code
      if (code) rejectedBy.set(signatureKey(p), [...(rejectedBy.get(signatureKey(p)) ?? []), code])
    }
    const pending: ClassifyGroup[] = data.groups
      .filter(g => !openKeys.has(signatureKey(g)) && !detectFree(g, cat, learned))
      .map(g => ({ ...g, rejected: rejectedBy.get(signatureKey(g)) }))
    if (!pending.length) return { proposed: 0, remaining: 0 }
    const batch = pending.slice(0, GROUPS_PER_CALL)

    const examples = [...learned].map(([prefix, id]) => ({ prefix, code: codeOf.get(id) ?? '' })).filter(e => e.code && e.code !== e.prefix)
    const run = await runAi({ orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId, feature: 'tag_types' }, (client, model) =>
      client.messages.parse({
        model,
        max_tokens: 16000,
        output_config: { effort: 'low', format: zodOutputFormat(TypeClassification) },
        system: TYPE_RULES,
        messages: [{ role: 'user', content: buildTypePrompt(batch, cat, examples) }],
      }))
    if (!run.response) return { error: run.error }
    const parsed = run.response.parsed_output
    if (!parsed) return { error: t('tagTypes.aiUnparseable') }

    const proposals = reconcileTypeProposals(parsed, batch, cat)
    const rows = batch.map((g, i) => {
      const p = proposals.get(i) ?? { outcome: 'none' as const, confidence: 0, reason: 'Sin respuesta para esta firma' }
      return {
        org_id: ctx.orgId, project_id: input.projectId, prefix: g.prefix, discipline_id: g.discipline_id, desc_norm: g.desc_norm,
        outcome: p.outcome, equipment_type_id: p.outcome === 'type' ? p.typeId : null, new_type: p.outcome === 'new_type' ? p.newType : null,
        confidence: p.confidence, reason: p.reason, model: run.response.model, created_by: ctx.userId,
      }
    })
    const admin = createAdminClient()
    const { error } = await admin.from('tag_type_proposals').insert(rows)
    if (error) return { error: error.message }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'tag.type_ai_classified', entityType: 'project', entityId: input.projectId,
      payload: { model: run.response.model, groups: batch.length, remaining: pending.length - batch.length },
    })
    revalidatePath(`/projects/${input.projectId}/itrs/requirements/untyped`)
    return { proposed: rows.length, remaining: pending.length - batch.length, costUsd: aiCostUsd(run.response.model, run.response.usage) }
  },
)

/** Descarta una propuesta de la IA; la próxima clasificación de esa firma no vuelve a proponer ese tipo. */
export const rejectTagTypeProposal = withAuth(
  { role: PRIVILEGED_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string; proposalId: string }): Promise<{ error?: string }> => {
    const { error } = await createAdminClient().from('tag_type_proposals')
      .update({ status: 'rejected', decided_by: ctx.userId, decided_at: new Date().toISOString() })
      .eq('id', input.proposalId).eq('project_id', input.projectId).eq('status', 'proposed')
    if (error) return { error: error.message }
    revalidatePath(`/projects/${input.projectId}/itrs/requirements/untyped`)
    return {}
  },
)
