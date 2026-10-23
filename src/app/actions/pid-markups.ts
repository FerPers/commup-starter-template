'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { normalizeRotation, type Pt } from '@/lib/pid/geometry'
import { MARKUP_KINDS, MAX_LABEL_LENGTH, toStoredPoints, validMarkupPoints, type MarkupKind } from '@/lib/pid/markups'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'

// P2: marcas LOSH (línea resaltada, límite, etiqueta) sobre una revisión de un P&ID. Dibujan los editores (Líder en
// adelante y Arquitecto), igual que los pines. La BD vuelve a comprobar todo: pid_hotspot_guard (revisión de un P&ID
// del proyecto), guard_same_project + pid_markup_stamp (sistemas del proyecto), pid_markup_points_ok (puntos) y la
// RLS (solo capa 'losh'). Si el sistema tiene una liberación aprobada, el cambio no se bloquea: pid_markup_audit lo
// deja en activity_log.

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

function cleanLabel(raw: string | null | undefined): string | null | { error: string } {
  const label = raw?.trim() ? raw.trim() : null
  if (label && label.length > MAX_LABEL_LENGTH) return { error: `La etiqueta admite hasta ${MAX_LABEL_LENGTH} caracteres` }
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
    if (!MARKUP_KINDS.includes(input.kind)) return { error: 'Tipo de marca no válido' }
    if (!Number.isInteger(input.page_num) || input.page_num < 1) return { error: 'Página no válida' }
    if (!validMarkupPoints(input.kind, input.points)) return { error: 'Puntos de la marca no válidos' }
    if (!(input.page_width > 0) || !(input.page_height > 0)) return { error: 'Tamaño de página no válido' }
    const other = input.kind === 'limit' ? input.other_system_id ?? null : null
    if (other && other === input.system_id) return { error: 'Los dos lados del límite deben ser sistemas distintos' }
    const label = cleanLabel(input.label)
    if (label && typeof label === 'object') return label

    const documentId = await pidRevisionDocument(ctx.supabase, input.revision_id, input.project_id)
    if (!documentId) return { error: 'Revisión del P&ID no encontrada en el proyecto' }

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
    },
  ): Promise<{ error?: string }> => {
    const { data: current } = await ctx.supabase
      .from('pid_markups')
      .select('kind, system_id, other_system_id, revision_id')
      .eq('id', input.markup_id)
      .eq('project_id', input.project_id)
      .maybeSingle()
    if (!current) return { error: 'Marca no encontrada' }
    const kind = current.kind as MarkupKind

    const patch: Database['public']['Tables']['pid_markups']['Update'] = {}
    if ('system_id' in input && input.system_id) patch.system_id = input.system_id
    if ('other_system_id' in input) {
      if (kind !== 'limit' && input.other_system_id) return { error: 'Solo un límite tiene sistema del otro lado' }
      patch.other_system_id = input.other_system_id ?? null
    }
    const sys = patch.system_id ?? current.system_id
    const other = 'other_system_id' in patch ? patch.other_system_id : current.other_system_id
    if (other && other === sys) return { error: 'Los dos lados del límite deben ser sistemas distintos' }
    if ('label' in input) {
      const label = cleanLabel(input.label)
      if (label && typeof label === 'object') return label
      patch.label = label
    }
    if ('points' in input && input.points) {
      if (!validMarkupPoints(kind, input.points)) return { error: 'Puntos de la marca no válidos' }
      if (!((input.page_width ?? 0) > 0) || !((input.page_height ?? 0) > 0)) return { error: 'Tamaño de página no válido' }
      patch.points = toStoredPoints(input.points)
      patch.page_width = Math.round(input.page_width! * 100) / 100
      patch.page_height = Math.round(input.page_height! * 100) / 100
      patch.page_rotation = normalizeRotation(input.page_rotation ?? 0)
      patch.needs_review = false
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
    const documentId = await pidRevisionDocument(ctx.supabase, input.revision_id, input.project_id)
    if (!documentId) return { error: 'Revisión del P&ID no encontrada en el proyecto' }
    let q = ctx.supabase.from('pid_markups').update({ needs_review: false })
      .eq('project_id', input.project_id).eq('revision_id', input.revision_id).eq('needs_review', true)
    if (input.markup_ids?.length) q = q.in('id', input.markup_ids.slice(0, 500))
    const { data, error } = await q.select('id')
    if (error) return { error: error.message }
    revalidatePath(viewerPath(input.project_id, documentId))
    return { count: data?.length ?? 0 }
  },
)
