'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyItrAssignmentChanged, type ItrAssignmentChange } from '@/lib/notifications/itr-assignment'
import { batchItrId, createItrRecord, isRequestId, type CreatedItr } from '@/lib/itr/create'
import { assignmentIssue, requiredForTemplate, type SigningRole } from '@/lib/itr/signatures'

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
  clientId?: string | null
  /** A03: UUID que genera el modal al abrirse; reintentar el mismo lote no duplica. */
  requestId?: string
}

type Signer = { role: SigningRole; userId: string }

type GenerateResult = { created: number; errors: string[]; error?: string }

const MAX_BATCH = 200

async function prepare(ctx: { supabase: SupabaseClient<Database>; orgId: string }, input: GenerateInput, source: 'loop_signals' | 'ce_effects') {
  const t = await getTranslations('ActionErrors')
  if (!input.ids.length) return { error: t('sourceItrs.nothing') }
  if (input.requestId !== undefined && !isRequestId(input.requestId)) return { error: t('sourceItrs.invalidRequest') }
  if (input.ids.length > MAX_BATCH) return { error: t('sourceItrs.maxBatch', { max: MAX_BATCH }) }
  const [{ data: template }, { data: sourceItem }, { data: members }] = await Promise.all([
    ctx.supabase.from('itr_templates').select('id, code, phase_id, is_active, required_signatures, project_phases(itr_client_signature)').eq('id', input.templateId).eq('org_id', ctx.orgId).maybeSingle(),
    ctx.supabase.from('itr_template_items').select('id').eq('template_id', input.templateId).eq('item_type', 'table').eq('options->rows->>source', source).limit(1).maybeSingle(),
    ctx.supabase.from('org_members').select('user_id').eq('org_id', ctx.orgId).in('user_id', [input.inspectorId, input.supervisorId, input.clientId].filter((v): v is string => !!v)),
  ])
  if (!template) return { error: t('sourceItrs.templateNotFound') }
  if (!template.is_active) return { error: t('sourceItrs.templateDraft') }
  if (!sourceItem) return { error: source === 'loop_signals' ? t('sourceItrs.noLoopTable') : t('sourceItrs.noCeTable') }
  const memberIds = new Set((members ?? []).map(m => m.user_id))
  if (!memberIds.has(input.inspectorId)) return { error: t('sourceItrs.notMember', { role: 'executor' }) }
  if (input.supervisorId && !memberIds.has(input.supervisorId)) return { error: t('sourceItrs.notMember', { role: 'supervisor' }) }
  if (input.clientId && !memberIds.has(input.clientId)) return { error: t('sourceItrs.notMember', { role: 'client' }) }
  // S04 (D4/D6): una persona distinta por cada firma que exige la plantilla (la BD congela el conjunto en el ITR).
  // ctx.supabase sin tipar: la relación a uno llega tipada como arreglo.
  const phase = template.project_phases
  const required = requiredForTemplate(template.required_signatures, phase?.itr_client_signature)
  const people: Record<SigningRole, string | null | undefined> = { executor: input.inspectorId, supervisor: input.supervisorId, client: input.clientId }
  const invalid = assignmentIssue(required, people)
  if (invalid) return { error: t(`itrAssign.${invalid.code}`, invalid) }
  return { template, signers: required.map(role => ({ role, userId: people[role]! })) }
}

async function insertItr(
  ctx: { supabase: SupabaseClient<Database> },
  input: GenerateInput,
  template: { id: string },
  row: { subsystem_id: string; tag_id: string; baseNumber: string; loop_id?: string; ce_cause_id?: string },
  signers: Signer[],
): Promise<CreatedItr | { error: string }> {
  // S05 (C-15): la BD agrega « Rn» de forma atómica si la base ya existe (assign_itr_number).
  // A03: ITR y firmantes en una transacción; con `requestId` el id sale de la solicitud y la fuente (reintentar el
  // lote devuelve los mismos ITR en vez de crear revisiones).
  const sourceKey = `${template.id}:${row.loop_id ? `loop:${row.loop_id}` : `cause:${row.ce_cause_id}`}`
  return createItrRecord(ctx.supabase, {
    id: input.requestId ? batchItrId(input.requestId, sourceKey) : crypto.randomUUID(),
    projectId: input.projectId, tagId: row.tag_id, subsystemId: row.subsystem_id, templateId: template.id, baseNumber: row.baseNumber,
    signers: Object.fromEntries(signers.map(s => [s.role, s.userId])), loopId: row.loop_id ?? null, ceCauseId: row.ce_cause_id ?? null,
  })
}

async function notify(ctx: { orgId: string; userId: string }, input: GenerateInput, made: Array<{ id: string; itr_number: string; tag_id: string }>, signers: Signer[]) {
  if (!made.length) return
  const changes: ItrAssignmentChange[] = made.flatMap(itr => signers.map(s => (
    { itrId: itr.id, itrNumber: itr.itr_number, projectId: input.projectId, tagId: itr.tag_id, role: s.role, recipientUserId: s.userId, changeType: 'added' as const }
  )))
  await notifyItrAssignmentChanged(createAdminClient(), ctx.orgId, ctx.userId, changes)
}

/** Un ITR de loop check por lazo. Tag de referencia: el instrumento del lazo (o el de su primera señal). */
export const generateLoopItrs = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }, { resource: 'template', field: 'templateId' }] },
  async (ctx, input: GenerateInput): Promise<GenerateResult> => {
    const t = await getTranslations('ActionErrors')
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
      if (!signals.length) { errors.push(t('sourceItrs.loopNoSignals', { code: loop.loop_number })); continue }
      if (!tagId) { errors.push(t('sourceItrs.loopNoInstrument', { code: loop.loop_number })); continue }
      const res = await insertItr(ctx, input, prep.template, { subsystem_id: loop.subsystem_id, tag_id: tagId, baseNumber: `${prep.template.code}/${loop.loop_number}`, loop_id: loop.id }, prep.signers)
      if ('error' in res) errors.push(`${loop.loop_number}: ${res.error}`)
      else if (res.created) made.push({ id: res.id, itr_number: res.itr_number, tag_id: tagId })
    }
    await notify(ctx, input, made, prep.signers)
    revalidatePath(`/projects/${input.projectId}/loops`)
    revalidatePath(`/projects/${input.projectId}/itrs`)
    return { created: made.length, errors }
  },
)

/** Un ITR de prueba por causa C&E. Tag de referencia: el iniciador de la causa (o el elemento final del primer efecto). */
export const generateCauseItrs = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }, { resource: 'template', field: 'templateId' }] },
  async (ctx, input: GenerateInput): Promise<GenerateResult> => {
    const t = await getTranslations('ActionErrors')
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
      if (!effects.length) { errors.push(t('sourceItrs.causeNoEffects', { code: cause.code })); continue }
      const firstEffect = effects.find(e => e.tag_id)
      const tagId = cause.tag_id ?? firstEffect?.tag_id
      const subsystemId = cause.tags?.subsystem_id ?? firstEffect?.tags?.subsystem_id
      if (!tagId || !subsystemId) { errors.push(t('sourceItrs.causeNoTag', { code: cause.code })); continue }
      const res = await insertItr(ctx, input, prep.template, { subsystem_id: subsystemId, tag_id: tagId, baseNumber: `${prep.template.code}/${cause.ce_matrices?.code ?? 'C&E'}/${cause.code}`, ce_cause_id: cause.id }, prep.signers)
      if ('error' in res) errors.push(`${cause.code}: ${res.error}`)
      else if (res.created) made.push({ id: res.id, itr_number: res.itr_number, tag_id: tagId })
    }
    await notify(ctx, input, made, prep.signers)
    const matrixIds = [...new Set((causes ?? []).map(c => c.matrix_id))]
    for (const id of matrixIds) revalidatePath(`/projects/${input.projectId}/ce-matrices/${id}`)
    revalidatePath(`/projects/${input.projectId}/ce-matrices`)
    revalidatePath(`/projects/${input.projectId}/itrs`)
    return { created: made.length, errors }
  },
)
