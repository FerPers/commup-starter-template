'use server'

import { getTranslations } from 'next-intl/server'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { normalizeRotation, type Pt } from '@/lib/pid/geometry'
import { MARKUP_KINDS, MAX_LABEL_LENGTH, toStoredPoints, validMarkupPoints, type MarkupKind } from '@/lib/pid/markups'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'

type T = Awaited<ReturnType<typeof getTranslations<'ActionErrors'>>>

// P2: marcas LOSH (línea resaltada, límite, etiqueta) sobre una revisión de un P&ID. Dibujan los editores (Líder en
// adelante y Arquitecto), igual que los pines. La BD vuelve a comprobar todo: pid_hotspot_guard (revisión de un P&ID
// del proyecto), guard_same_project + pid_markup_stamp (sistemas del proyecto), pid_markup_points_ok (puntos) y la
// RLS (solo capa 'losh'). Si el sistema tiene una liberación aprobada, el cambio no se bloquea: pid_markup_audit lo
// deja en activity_log.
// P4: el conector lleva la hoja destino (otro P&ID del proyecto, o el mismo en otra página); pid_markup_stamp lo
// vuelve a comprobar.

type MarkupInput = {
  project_id: string
  revision_id: string
  page_num: number
  kind: MarkupKind
  system_id: string
  other_system_id?: string | null
  points: Pt[]
  page_width: number
  page_height: number
  page_rotation: number
  label?: string | null
  target_document_id?: string | null
  target_page?: number | null
}

async function pidRevisionDocument(supabase: SupabaseClient<Database>, revisionId: string, projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from('document_revisions')
    .select('document_id, documents!document_revisions_document_id_fkey(doc_type)')
    .eq('id', revisionId)
    .eq('project_id', projectId)
    .maybeSingle()
  const docType = (data?.documents as unknown as { doc_type: string } | null)?.doc_type
  return data && docType === 'pid' ? data.document_id : null
}

const viewerPath = (projectId: string, documentId: string) => `/projects/${projectId}/documents/${documentId}/viewer`

/** Destino de un conector: P&ID del proyecto y página ≥ 1, distinto de la misma página de la misma hoja. */
async function connectorTarget(
  supabase: SupabaseClient<Database>, projectId: string, input: { target_document_id?: string | null; target_page?: number | null },
  here: { documentId: string; page: number }, t: T,
): Promise<{ target_document_id: string; target_page: number } | { error: string }> {
  const page = input.target_page ?? 1
  if (!input.target_document_id) return { error: t('pidMarkups.connectorTarget') }
  if (!Number.isInteger(page) || page < 1) return { error: t('pidMarkups.invalidPage') }
  if (input.target_document_id === here.documentId && page === here.page) return { error: t('pidMarkups.connectorSelf') }
  const { data } = await supabase.from('documents').select('id')
    .eq('id', input.target_document_id).eq('project_id', projectId).eq('doc_type', 'pid').maybeSingle()
  if (!data) return { error: t('pidMarkups.connectorTarget') }
  return { target_document_id: data.id, target_page: page }
}

function cleanLabel(raw: string | null | undefined, t: T): string | null | { error: string } {
  const label = raw?.trim() ? raw.trim() : null
  if (label && label.length > MAX_LABEL_LENGTH) return { error: t('pidMarkups.labelTooLong', { max: MAX_LABEL_LENGTH }) }
  return label
}

export const createMarkup = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'project_id' },
      { resource: 'system', field: 'system_id', scopeField: 'project_id' },
      { resource: 'system', field: 'other_system_id', scopeField: 'project_id', optional: true },
    ],
  },
  async (ctx, input: MarkupInput): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!MARKUP_KINDS.includes(input.kind)) return { error: t('pidMarkups.invalidKind') }
    if (!Number.isInteger(input.page_num) || input.page_num < 1) return { error: t('pidMarkups.invalidPage') }
    if (!validMarkupPoints(input.kind, input.points)) return { error: t('pidMarkups.invalidPoints') }
    if (!(input.page_width > 0) || !(input.page_height > 0)) return { error: t('pidMarkups.invalidPageSize') }
    const other = input.kind === 'limit' ? input.other_system_id ?? null : null
    if (other && other === input.system_id) return { error: t('pidMarkups.sameSystem') }
    const label = cleanLabel(input.label, t)
    if (label && typeof label === 'object') return label

    const documentId = await pidRevisionDocument(ctx.supabase, input.revision_id, input.project_id)
    if (!documentId) return { error: t('pidMarkups.revisionNotFound') }
    let target: { target_document_id: string | null; target_page: number | null } = { target_document_id: null, target_page: null }
    if (input.kind === 'connector') {
      const res = await connectorTarget(ctx.supabase, input.project_id, input, { documentId, page: input.page_num }, t)
      if ('error' in res) return res
      target = res
    }

    const { data, error } = await ctx.supabase
      .from('pid_markups')
      .insert({
        org_id: ctx.orgId,
        project_id: input.project_id,
        revision_id: input.revision_id,
        page_num: input.page_num,
        layer: 'losh',
        kind: input.kind,
        system_id: input.system_id,
        other_system_id: other,
        points: toStoredPoints(input.points),
        page_width: Math.round(input.page_width * 100) / 100,
        page_height: Math.round(input.page_height * 100) / 100,
        page_rotation: normalizeRotation(input.page_rotation),
        label,
        ...target,
        created_by: ctx.userId,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    revalidatePath(viewerPath(input.project_id, documentId))
    return { id: data.id }
  },
)

/**
 * Cambio parcial de una marca: sistema(s), etiqueta o puntos (redibujar). Cambiar los puntos la deja revisada,
 * como mover un pin.
 */
export const updateMarkup = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'project_id' },
      { resource: 'system', field: 'system_id', scopeField: 'project_id', optional: true },
      { resource: 'system', field: 'other_system_id', scopeField: 'project_id', optional: true },
    ],
  },
  async (
    ctx,
    input: {
      project_id: string
      markup_id: string
      system_id?: string
      other_system_id?: string | null
      label?: string | null
      points?: Pt[]
      page_width?: number
      page_height?: number
      page_rotation?: number
      target_document_id?: string | null
      target_page?: number | null
    },
  ): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const { data: current } = await ctx.supabase
      .from('pid_markups')
      .select('kind, system_id, other_system_id, revision_id, page_num')
      .eq('id', input.markup_id)
      .eq('project_id', input.project_id)
      .maybeSingle()
    if (!current) return { error: t('pidMarkups.markupNotFound') }
    const kind = current.kind as MarkupKind

    const patch: Database['public']['Tables']['pid_markups']['Update'] = {}
    if ('system_id' in input && input.system_id) patch.system_id = input.system_id
    if ('other_system_id' in input) {
      if (kind !== 'limit' && input.other_system_id) return { error: t('pidMarkups.otherSideLimitOnly') }
      patch.other_system_id = input.other_system_id ?? null
    }
    const sys = patch.system_id ?? current.system_id
    const other = 'other_system_id' in patch ? patch.other_system_id : current.other_system_id
    if (other && other === sys) return { error: t('pidMarkups.sameSystem') }
    if ('label' in input) {
      const label = cleanLabel(input.label, t)
      if (label && typeof label === 'object') return label
      patch.label = label
    }
    if ('points' in input && input.points) {
      if (!validMarkupPoints(kind, input.points)) return { error: t('pidMarkups.invalidPoints') }
      if (!((input.page_width ?? 0) > 0) || !((input.page_height ?? 0) > 0)) return { error: t('pidMarkups.invalidPageSize') }
      patch.points = toStoredPoints(input.points)
      patch.page_width = Math.round(input.page_width! * 100) / 100
      patch.page_height = Math.round(input.page_height! * 100) / 100
      patch.page_rotation = normalizeRotation(input.page_rotation ?? 0)
      patch.needs_review = false
    }
    if ('target_document_id' in input || 'target_page' in input) {
      if (kind !== 'connector') return { error: t('pidMarkups.targetConnectorOnly') }
      const documentId = await pidRevisionDocument(ctx.supabase, current.revision_id, input.project_id)
      if (!documentId) return { error: t('pidMarkups.revisionNotFound') }
      const res = await connectorTarget(ctx.supabase, input.project_id, input, { documentId, page: current.page_num }, t)
      if ('error' in res) return res
      Object.assign(patch, res)
    }
    if (Object.keys(patch).length === 0) return {}

    const { error } = await ctx.supabase.from('pid_markups').update(patch).eq('id', input.markup_id).eq('project_id', input.project_id)
    if (error) return { error: error.message }
    const documentId = await pidRevisionDocument(ctx.supabase, current.revision_id, input.project_id)
    if (documentId) revalidatePath(viewerPath(input.project_id, documentId))
    return {}
  },
)

export const deleteMarkup = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'project_id' }] },
  async (ctx, input: { project_id: string; markup_id: string; document_id: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.from('pid_markups').delete().eq('id', input.markup_id).eq('project_id', input.project_id)
    if (error) return { error: error.message }
    revalidatePath(viewerPath(input.project_id, input.document_id))
    return {}
  },
)

/** Confirma marcas copiadas de la revisión anterior (una, o todas las de la revisión). */
export const confirmMarkups = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'project_id' }] },
  async (ctx, input: { project_id: string; revision_id: string; markup_ids?: string[] }): Promise<{ error?: string; count?: number }> => {
    const t = await getTranslations('ActionErrors')
    const documentId = await pidRevisionDocument(ctx.supabase, input.revision_id, input.project_id)
    if (!documentId) return { error: t('pidMarkups.revisionNotFound') }
    let q = ctx.supabase.from('pid_markups').update({ needs_review: false })
      .eq('project_id', input.project_id).eq('revision_id', input.revision_id).eq('needs_review', true)
    if (input.markup_ids?.length) q = q.in('id', input.markup_ids.slice(0, 500))
    const { data, error } = await q.select('id')
    if (error) return { error: error.message }
    revalidatePath(viewerPath(input.project_id, documentId))
    return { count: data?.length ?? 0 }
  },
)
