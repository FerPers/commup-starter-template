'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyItrAssignmentChanged, type ItrAssignmentChange } from '@/lib/notifications/itr-assignment'
import type { TablesInsert } from '@/types/supabase.generated'

// ITR generados desde un lazo (loop check) o desde una causa C&E (prueba por causa) — fase 4 · bloque D,
// sesión 2 (decisiones §10.21–10.24). Las filas de la tabla las toma el trigger itr_source_rows_guard
// (foto inmutable); aquí solo se elige la plantilla, el tag de referencia, el subsistema y el número.
// Si ya hubo un ITR para ese lazo/causa con la misma plantilla, el nuevo es una revisión (R2, R3…).

type GenerateInput = {
  projectId: string
  templateId: string
  ids: string[]
  inspectorId: string
  supervisorId?: string | null
}

type GenerateResult = { created: number; errors: string[]; error?: string }

const MAX_BATCH = 200

async function prepare(ctx: { supabase: SupabaseClient; orgId: string }, input: GenerateInput, source: 'loop_signals' | 'ce_effects') {
  if (!input.ids.length) return { error: 'Nada que generar' }
  if (input.ids.length > MAX_BATCH) return { error: `Máximo ${MAX_BATCH} por vez` }
  const [{ data: template }, { data: sourceItem }, { data: members }] = await Promise.all([
    ctx.supabase.from('itr_templates').select('id, code, phase_id, is_active').eq('id', input.templateId).eq('org_id', ctx.orgId).maybeSingle(),
    ctx.supabase.from('itr_template_items').select('id').eq('template_id', input.templateId).eq('item_type', 'table').eq('options->rows->>source', source).limit(1).maybeSingle(),
    ctx.supabase.from('org_members').select('user_id').eq('org_id', ctx.orgId).in('user_id', [input.inspectorId, input.supervisorId].filter((v): v is string => !!v)),
  ])
  if (!template) return { error: 'Plantilla no encontrada' }
  if (!template.is_active) return { error: 'La plantilla es un borrador: actívala antes de generar ITRs' }
  if (!sourceItem) return { error: source === 'loop_signals' ? 'La plantilla no tiene tabla de señales del lazo' : 'La plantilla no tiene tabla de efectos de la matriz C&E' }
  const memberIds = new Set((members ?? []).map(m => m.user_id))
  if (!memberIds.has(input.inspectorId)) return { error: 'El inspector no es miembro de la organización' }
  if (input.supervisorId && !memberIds.has(input.supervisorId)) return { error: 'El supervisor no es miembro de la organización' }
  return { template }
}

async function insertItr(
  ctx: { supabase: SupabaseClient },
  input: GenerateInput,
  template: { id: string; code: string; phase_id: string },
  row: { subsystem_id: string; tag_id: string; baseNumber: string; loop_id?: string; ce_cause_id?: string },
): Promise<{ id: string; itr_number: string } | { error: string }> {
  const link = row.loop_id ? { column: 'loop_id', id: row.loop_id } : { column: 'ce_cause_id', id: row.ce_cause_id! }
  const { count } = await ctx.supabase.from('itrs').select('id', { count: 'exact', head: true }).eq(link.column, link.id).eq('template_id', template.id)
  const itrNumber = (count ?? 0) === 0 ? row.baseNumber : `${row.baseNumber} R${(count ?? 0) + 1}`
  const payload: TablesInsert<'itrs'> = {
    template_id: template.id, tag_id: row.tag_id, subsystem_id: row.subsystem_id, project_id: input.projectId,
    phase_id: template.phase_id, itr_number: itrNumber, status: 'not_started', progress_pct: 0,
    loop_id: row.loop_id ?? null, ce_cause_id: row.ce_cause_id ?? null,
  }
  const { data: itr, error } = await ctx.supabase.from('itrs').insert(payload).select('id').single()
  if (error || !itr) return { error: error?.message ?? 'No se pudo crear el ITR' }
  const assignments: TablesInsert<'itr_assignments'>[] = [{ itr_id: itr.id, user_id: input.inspectorId, role: 'executor' }]
  if (input.supervisorId) assignments.push({ itr_id: itr.id, user_id: input.supervisorId, role: 'supervisor' })
  const { error: assignErr } = await ctx.supabase.from('itr_assignments').insert(assignments)
  if (assignErr) return { error: assignErr.message }
  return { id: itr.id, itr_number: itrNumber }
}

async function notify(ctx: { orgId: string; userId: string }, input: GenerateInput, made: Array<{ id: string; itr_number: string; tag_id: string }>) {
  if (!made.length) return
  const changes: ItrAssignmentChange[] = made.flatMap(itr => [
    { itrId: itr.id, itrNumber: itr.itr_number, projectId: input.projectId, tagId: itr.tag_id, role: 'executor' as const, recipientUserId: input.inspectorId, changeType: 'added' as const },
    ...(input.supervisorId ? [{ itrId: itr.id, itrNumber: itr.itr_number, projectId: input.projectId, tagId: itr.tag_id, role: 'supervisor' as const, recipientUserId: input.supervisorId, changeType: 'added' as const }] : []),
  ])
  await notifyItrAssignmentChanged(createAdminClient(), ctx.orgId, ctx.userId, changes)
}

/** Un ITR de loop check por lazo. Tag de referencia: el instrumento del lazo (o el de su primera señal). */
export const generateLoopItrs = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }, { resource: 'template', field: 'templateId' }] },
  async (ctx, input: GenerateInput): Promise<GenerateResult> => {
    const prep = await prepare(ctx, input, 'loop_signals')
    if ('error' in prep) return { created: 0, errors: [], error: prep.error }
    const { data: loops, error } = await ctx.supabase
      .from('loops')
      .select('id, loop_number, subsystem_id, loop_tags(tag_id, role_in_loop), signals(tag_id, signal_tag, active)')
      .eq('project_id', input.projectId)
      .in('id', input.ids)
    if (error) return { created: 0, errors: [], error: error.message }
    const errors: string[] = []
    const made: Array<{ id: string; itr_number: string; tag_id: string }> = []
    for (const loop of loops ?? []) {
      const signals = (loop.signals ?? []).filter(s => s.active).sort((a, b) => a.signal_tag.localeCompare(b.signal_tag))
      const tags = loop.loop_tags ?? []
      const tagId = tags.find(t => t.role_in_loop === 'instrument')?.tag_id ?? tags[0]?.tag_id ?? signals[0]?.tag_id
      if (!signals.length) { errors.push(`${loop.loop_number}: el lazo no tiene señales activas`); continue }
      if (!tagId) { errors.push(`${loop.loop_number}: el lazo no tiene instrumento asociado`); continue }
      const res = await insertItr(ctx, input, prep.template, { subsystem_id: loop.subsystem_id, tag_id: tagId, baseNumber: `${prep.template.code}/${loop.loop_number}`, loop_id: loop.id })
      if ('error' in res) errors.push(`${loop.loop_number}: ${res.error}`)
      else made.push({ ...res, tag_id: tagId })
    }
    await notify(ctx, input, made)
    revalidatePath(`/projects/${input.projectId}/loops`)
    revalidatePath(`/projects/${input.projectId}/itrs`)
    return { created: made.length, errors }
  },
)

/** Un ITR de prueba por causa C&E. Tag de referencia: el iniciador de la causa (o el elemento final del primer efecto). */
export const generateCauseItrs = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }, { resource: 'template', field: 'templateId' }] },
  async (ctx, input: GenerateInput): Promise<GenerateResult> => {
    const prep = await prepare(ctx, input, 'ce_effects')
    if ('error' in prep) return { created: 0, errors: [], error: prep.error }
    const { data: causes, error } = await ctx.supabase
      .from('ce_causes')
      .select('id, code, matrix_id, tag_id, tags(subsystem_id), ce_matrices(code), ce_links(ce_effects(seq, code, tag_id, tags(subsystem_id)))')
      .eq('project_id', input.projectId)
      .in('id', input.ids)
    if (error) return { created: 0, errors: [], error: error.message }
    const errors: string[] = []
    const made: Array<{ id: string; itr_number: string; tag_id: string }> = []
    for (const cause of causes ?? []) {
      const effects = (cause.ce_links ?? []).map(l => l.ce_effects).filter((e): e is NonNullable<typeof e> => !!e).sort((a, b) => a.seq - b.seq || a.code.localeCompare(b.code))
      if (!effects.length) { errors.push(`${cause.code}: la causa no tiene efectos marcados en la matriz`); continue }
      const firstEffect = effects.find(e => e.tag_id)
      const tagId = cause.tag_id ?? firstEffect?.tag_id
      const subsystemId = cause.tags?.subsystem_id ?? firstEffect?.tags?.subsystem_id
      if (!tagId || !subsystemId) { errors.push(`${cause.code}: indica el tag iniciador de la causa (o el elemento final de un efecto)`); continue }
      const res = await insertItr(ctx, input, prep.template, { subsystem_id: subsystemId, tag_id: tagId, baseNumber: `${prep.template.code}/${cause.ce_matrices?.code ?? 'C&E'}/${cause.code}`, ce_cause_id: cause.id })
      if ('error' in res) errors.push(`${cause.code}: ${res.error}`)
      else made.push({ ...res, tag_id: tagId })
    }
    await notify(ctx, input, made)
    const matrixIds = [...new Set((causes ?? []).map(c => c.matrix_id))]
    for (const id of matrixIds) revalidatePath(`/projects/${input.projectId}/ce-matrices/${id}`)
    revalidatePath(`/projects/${input.projectId}/ce-matrices`)
    revalidatePath(`/projects/${input.projectId}/itrs`)
    return { created: made.length, errors }
  },
)
