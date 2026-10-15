'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { CE_ACTIONS, CE_VOTINGS, normalizeCeCode, parseDelay, type CeAction, type CeVoting } from '@/lib/ce/matrix'

// Matriz causa-efecto (fase 4 · bloque D, sesión 1; migración 20261016210000). Escriben los roles
// de edición (RLS get_my_editor_project_ids); el trigger ce_guard deriva org/proyecto y valida que
// tags, señales y sistema sean del proyecto y que un cruce no salga de su matriz.

const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max) || null

function revalidate(projectId: string, matrixId?: string) {
  revalidatePath(`/projects/${projectId}/ce-matrices`)
  if (matrixId) revalidatePath(`/projects/${projectId}/ce-matrices/${matrixId}`)
}

async function matrixInProject(supabase: SupabaseClient, projectId: string, matrixId: string) {
  const { data } = await supabase.from('ce_matrices').select('id').eq('id', matrixId).eq('project_id', projectId).maybeSingle()
  return !!data
}

/** Tag por número dentro del proyecto (vacío = sin tag). */
async function resolveTag(supabase: SupabaseClient, projectId: string, tagNumber: string | null | undefined): Promise<{ id: string | null } | { error: string }> {
  const number = txt(tagNumber, 100)
  if (!number) return { id: null }
  const { data } = await supabase.from('tags').select('id').eq('project_id', projectId).ilike('tag_number', number).limit(2)
  if (!data?.length) return { error: `El tag ${number} no existe en el proyecto` }
  if (data.length > 1) return { error: `Hay más de un tag ${number}; usa el número exacto` }
  return { id: data[0].id }
}

/** Señal por tag de señal; si hay tag, dentro de ese instrumento. */
async function resolveSignal(supabase: SupabaseClient, projectId: string, tagId: string | null, signalTag: string | null | undefined): Promise<{ id: string | null } | { error: string }> {
  const name = txt(signalTag, 100)
  if (!name) return { id: null }
  let q = supabase.from('signals').select('id, tag_id, tags!inner(project_id)').eq('tags.project_id', projectId).ilike('signal_tag', name).limit(2)
  if (tagId) q = q.eq('tag_id', tagId)
  const { data } = await q
  if (!data?.length) return { error: `La señal ${name} no existe${tagId ? ' en ese instrumento' : ' en el proyecto'}` }
  if (data.length > 1) return { error: `La señal ${name} está en varios instrumentos; indica también el tag` }
  return { id: data[0].id }
}

export type CeMatrixInput = {
  projectId: string
  id?: string
  code: string
  title: string
  systemId?: string | null
  revision?: string | null
  sourceDocument?: string | null
  notes?: string | null
}

export const saveCeMatrix = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }, { resource: 'system', field: 'systemId', scopeField: 'projectId', optional: true }] },
  async (ctx, input: CeMatrixInput): Promise<{ id?: string; error?: string }> => {
    const code = txt(input.code, 60)?.toUpperCase()
    const title = txt(input.title, 200)
    if (!code || !title) return { error: 'Código y título son obligatorios' }
    const row = {
      code, title, system_id: txt(input.systemId, 40), revision: txt(input.revision, 30),
      source_document: txt(input.sourceDocument, 200), notes: txt(input.notes, 2000),
    }
    const q = input.id
      ? ctx.supabase.from('ce_matrices').update(row).eq('id', input.id).eq('project_id', input.projectId).select('id').single()
      : ctx.supabase.from('ce_matrices').insert({ ...row, project_id: input.projectId, org_id: ctx.orgId, source: 'manual' }).select('id').single()
    const { data, error } = await q
    if (error?.code === '23505') return { error: `Ya existe una matriz ${code} en el proyecto` }
    if (error || !data) return { error: error?.message ?? 'No se pudo guardar la matriz' }
    revalidate(input.projectId, data.id)
    return { id: data.id }
  },
)

export const deleteCeMatrix = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string; id: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('ce_matrices').delete().eq('id', input.id).eq('project_id', input.projectId)
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

export type CeCauseInput = {
  projectId: string
  matrixId: string
  id?: string
  seq: number
  code: string
  description: string
  tagNumber?: string | null
  signalTag?: string | null
  condition?: string | null
  setpoint?: string | null
  voting?: CeVoting | null
  notes?: string | null
}

export const saveCeCause = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: CeCauseInput): Promise<{ id?: string; error?: string }> => {
    if (!(await matrixInProject(ctx.supabase, input.projectId, input.matrixId))) return { error: 'Matriz no encontrada' }
    const code = normalizeCeCode(input.code)
    const description = txt(input.description, 300)
    if (!code || !description) return { error: 'Código (máx. 30) y descripción son obligatorios' }
    if (input.voting && !CE_VOTINGS.includes(input.voting)) return { error: 'Votación no válida' }
    const tag = await resolveTag(ctx.supabase, input.projectId, input.tagNumber)
    if ('error' in tag) return tag
    const signal = await resolveSignal(ctx.supabase, input.projectId, tag.id, input.signalTag)
    if ('error' in signal) return signal
    const row = {
      seq: Math.trunc(input.seq) || 0, code, description, tag_id: tag.id, signal_id: signal.id,
      condition: txt(input.condition, 100), setpoint: txt(input.setpoint, 100), voting: input.voting ?? null, notes: txt(input.notes, 1000),
    }
    const q = input.id
      ? ctx.supabase.from('ce_causes').update(row).eq('id', input.id).eq('matrix_id', input.matrixId).select('id').single()
      : ctx.supabase.from('ce_causes').insert({ ...row, matrix_id: input.matrixId, project_id: input.projectId }).select('id').single()
    const { data, error } = await q
    if (error?.code === '23505') return { error: `Ya existe la causa ${code} en esta matriz` }
    if (error || !data) return { error: error?.message ?? 'No se pudo guardar la causa' }
    revalidate(input.projectId, input.matrixId)
    return { id: data.id }
  },
)

export type CeEffectInput = {
  projectId: string
  matrixId: string
  id?: string
  seq: number
  code: string
  description: string
  tagNumber?: string | null
  action: CeAction
  notes?: string | null
}

export const saveCeEffect = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: CeEffectInput): Promise<{ id?: string; error?: string }> => {
    if (!(await matrixInProject(ctx.supabase, input.projectId, input.matrixId))) return { error: 'Matriz no encontrada' }
    const code = normalizeCeCode(input.code)
    const description = txt(input.description, 300)
    if (!code || !description) return { error: 'Código (máx. 30) y descripción son obligatorios' }
    if (!CE_ACTIONS.includes(input.action)) return { error: 'Acción no válida' }
    const tag = await resolveTag(ctx.supabase, input.projectId, input.tagNumber)
    if ('error' in tag) return tag
    const row = { seq: Math.trunc(input.seq) || 0, code, description, tag_id: tag.id, action: input.action, notes: txt(input.notes, 1000) }
    const q = input.id
      ? ctx.supabase.from('ce_effects').update(row).eq('id', input.id).eq('matrix_id', input.matrixId).select('id').single()
      : ctx.supabase.from('ce_effects').insert({ ...row, matrix_id: input.matrixId, project_id: input.projectId }).select('id').single()
    const { data, error } = await q
    if (error?.code === '23505') return { error: `Ya existe el efecto ${code} en esta matriz` }
    if (error || !data) return { error: error?.message ?? 'No se pudo guardar el efecto' }
    revalidate(input.projectId, input.matrixId)
    return { id: data.id }
  },
)

/** Borra una causa o un efecto (sus cruces caen en cascada). */
export const deleteCeRow = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string; matrixId: string; kind: 'cause' | 'effect'; id: string }): Promise<{ error?: string }> => {
    const table = input.kind === 'cause' ? 'ce_causes' : 'ce_effects'
    const { error } = await ctx.supabase.from(table).delete().eq('id', input.id).eq('matrix_id', input.matrixId).eq('project_id', input.projectId)
    if (error) return { error: error.message }
    revalidate(input.projectId, input.matrixId)
    return {}
  },
)

/** Fija una celda: delay null = sin cruce; '' = directo; número = con retardo (s). */
export const setCeLink = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string; matrixId: string; causeId: string; effectId: string; delay: string | null }): Promise<{ error?: string }> => {
    if (input.delay === null) {
      const { error } = await ctx.supabase.from('ce_links').delete().eq('cause_id', input.causeId).eq('effect_id', input.effectId).eq('project_id', input.projectId)
      if (error) return { error: error.message }
    } else {
      const parsed = parseDelay(input.delay)
      if ('error' in parsed) return parsed
      const { error } = await ctx.supabase.from('ce_links').upsert(
        { cause_id: input.causeId, effect_id: input.effectId, project_id: input.projectId, ...parsed },
        { onConflict: 'cause_id,effect_id' },
      )
      if (error) return { error: error.message }
    }
    revalidate(input.projectId, input.matrixId)
    return {}
  },
)
