'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { CE_ACTIONS, CE_VOTINGS, normalizeCeCode, parseDelay, type CeAction, type CeVoting } from '@/lib/ce/matrix'
import { normalizeTag } from '@/lib/ce/import'

// Matriz causa-efecto (fase 4 · bloque D, sesión 1; migración 20261016210000). Escriben los roles
// de edición (RLS get_my_editor_project_ids); el trigger ce_guard deriva org/proyecto y valida que
// tags, señales y sistema sean del proyecto y que un cruce no salga de su matriz.

const txt = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max) || null

function revalidate(projectId: string, matrixId?: string) {
  revalidatePath(`/projects/${projectId}/ce-matrices`)
  if (matrixId) revalidatePath(`/projects/${projectId}/ce-matrices/${matrixId}`)
}

async function matrixInProject(supabase: SupabaseClient<Database>, projectId: string, matrixId: string) {
  const { data } = await supabase.from('ce_matrices').select('id').eq('id', matrixId).eq('project_id', projectId).maybeSingle()
  return !!data
}

/** «%» y «_» son comodines en ilike: se escapan para comparar el texto literal (S13, F-33). */
const ilikeLiteral = (v: string) => v.replace(/[\\%_]/g, c => `\\${c}`)

/** Tag por número dentro del proyecto (vacío = sin tag). S13 (F-15/F-33): por la clave normalizada `tag_key`. */
async function resolveTag(supabase: SupabaseClient<Database>, projectId: string, tagNumber: string | null | undefined): Promise<{ id: string | null } | { error: string }> {
  const t = await getTranslations('ActionErrors')
  const number = txt(tagNumber, 100)
  if (!number) return { id: null }
  const key = normalizeTag(number)
  if (!key) return { error: t('ceMatrix.tagNotFound', { tag: number }) }
  const { data } = await supabase.from('tags').select('id').eq('project_id', projectId).eq('tag_key', key).limit(2)
  if (!data?.length) return { error: t('ceMatrix.tagNotFound', { tag: number }) }
  if (data.length > 1) return { error: t('ceMatrix.tagAmbiguous', { tag: number }) }
  return { id: data[0].id }
}

/** Señal por tag de señal; si hay tag, dentro de ese instrumento. */
async function resolveSignal(supabase: SupabaseClient<Database>, projectId: string, tagId: string | null, signalTag: string | null | undefined): Promise<{ id: string | null } | { error: string }> {
  const t = await getTranslations('ActionErrors')
  const name = txt(signalTag, 100)
  if (!name) return { id: null }
  let q = supabase.from('signals').select('id, tag_id, tags!inner(project_id)').eq('tags.project_id', projectId).ilike('signal_tag', ilikeLiteral(name)).limit(2)
  if (tagId) q = q.eq('tag_id', tagId)
  const { data } = await q
  if (!data?.length) return { error: tagId ? t('ceMatrix.signalNotFoundInTag', { signal: name }) : t('ceMatrix.signalNotFound', { signal: name }) }
  if (data.length > 1) return { error: t('ceMatrix.signalAmbiguous', { signal: name }) }
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
    const t = await getTranslations('ActionErrors')
    const code = txt(input.code, 60)?.toUpperCase()
    const title = txt(input.title, 200)
    if (!code || !title) return { error: t('ceMatrix.codeTitleRequired') }
    const row = {
      code, title, system_id: txt(input.systemId, 40), revision: txt(input.revision, 30),
      source_document: txt(input.sourceDocument, 200), notes: txt(input.notes, 2000),
    }
    const q = input.id
      ? ctx.supabase.from('ce_matrices').update(row).eq('id', input.id).eq('project_id', input.projectId).select('id').single()
      : ctx.supabase.from('ce_matrices').insert({ ...row, project_id: input.projectId, org_id: ctx.orgId, source: 'manual' }).select('id').single()
    const { data, error } = await q
    if (error?.code === '23505') return { error: t('ceMatrix.matrixExists', { code }) }
    if (error || !data) return { error: error?.message ?? t('ceMatrix.matrixSaveFailed') }
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
    const t = await getTranslations('ActionErrors')
    if (!(await matrixInProject(ctx.supabase, input.projectId, input.matrixId))) return { error: t('ceMatrix.matrixNotFound') }
    const code = normalizeCeCode(input.code)
    const description = txt(input.description, 300)
    if (!code || !description) return { error: t('ceMatrix.codeDescriptionRequired') }
    if (input.voting && !CE_VOTINGS.includes(input.voting)) return { error: t('ceMatrix.votingInvalid') }
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
    if (error?.code === '23505') return { error: t('ceMatrix.causeExists', { code }) }
    if (error || !data) return { error: error?.message ?? t('ceMatrix.causeSaveFailed') }
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
    const t = await getTranslations('ActionErrors')
    if (!(await matrixInProject(ctx.supabase, input.projectId, input.matrixId))) return { error: t('ceMatrix.matrixNotFound') }
    const code = normalizeCeCode(input.code)
    const description = txt(input.description, 300)
    if (!code || !description) return { error: t('ceMatrix.codeDescriptionRequired') }
    if (!CE_ACTIONS.includes(input.action)) return { error: t('ceMatrix.actionInvalid') }
    const tag = await resolveTag(ctx.supabase, input.projectId, input.tagNumber)
    if ('error' in tag) return tag
    const row = { seq: Math.trunc(input.seq) || 0, code, description, tag_id: tag.id, action: input.action, notes: txt(input.notes, 1000) }
    const q = input.id
      ? ctx.supabase.from('ce_effects').update(row).eq('id', input.id).eq('matrix_id', input.matrixId).select('id').single()
      : ctx.supabase.from('ce_effects').insert({ ...row, matrix_id: input.matrixId, project_id: input.projectId }).select('id').single()
    const { data, error } = await q
    if (error?.code === '23505') return { error: t('ceMatrix.effectExists', { code }) }
    if (error || !data) return { error: error?.message ?? t('ceMatrix.effectSaveFailed') }
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
