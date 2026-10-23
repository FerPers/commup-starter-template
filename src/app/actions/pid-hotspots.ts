'use server'

import { getTranslations } from 'next-intl/server'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { clampPct } from '@/lib/pid/geometry'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'

// N2d: un pin es de una REVISIÓN de un documento P&ID (doc_type = 'pid'). El trigger pid_hotspot_guard comprueba en
// la BD que la revisión sea de un P&ID del mismo proyecto; aquí se adelanta para dar un mensaje claro.
// Ubicar tags en el plano = EDITOR (política 2026-05-24).

async function pidRevision(
  supabase: SupabaseClient<Database>,
  revisionId: string,
  projectId: string,
): Promise<{ documentId: string } | null> {
  const { data } = await supabase
    .from('document_revisions')
    .select('id, document_id, documents!document_revisions_document_id_fkey(doc_type)')
    .eq('id', revisionId)
    .eq('project_id', projectId)
    .maybeSingle()
  const docType = (data?.documents as unknown as { doc_type: string } | null)?.doc_type
  return data && docType === 'pid' ? { documentId: data.document_id } : null
}

const viewerPath = (projectId: string, documentId: string) => `/projects/${projectId}/documents/${documentId}/viewer`

export const upsertHotspot = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'project_id' },
      { resource: 'tag', field: 'tag_id', scopeField: 'project_id' },
    ],
  },
  async (
    ctx,
    input: { revision_id: string; tag_id: string; project_id: string; page_num: number; x_pct: number; y_pct: number },
  ): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const rev = await pidRevision(ctx.supabase, input.revision_id, input.project_id)
    if (!rev) return { error: t('pidHotspots.revisionNotFound') }
    if (!Number.isInteger(input.page_num) || input.page_num < 1) return { error: t('pidHotspots.invalidPage') }

    // Ubicar (o mover) un pin lo deja revisado: alguien lo puso en su lugar sobre esta revisión.
    const { data, error } = await ctx.supabase
      .from('pid_hotspots')
      .upsert({
        revision_id: input.revision_id,
        tag_id: input.tag_id,
        project_id: input.project_id,
        org_id: ctx.orgId,
        page_num: input.page_num,
        // P1: un clic en el borde da 100 (antes desbordaba numeric(6,4)); 0..100 = CHECK pid_hotspots_pct_range.
        x_pct: clampPct(input.x_pct),
        y_pct: clampPct(input.y_pct),
        created_by: ctx.userId,
        needs_review: false,
      }, { onConflict: 'revision_id,tag_id,page_num' })
      .select('id')
      .single()
    if (error) return { error: error.message }

    revalidatePath(viewerPath(input.project_id, rev.documentId))
    return { id: data.id }
  },
)

/** N2d: confirma la posición de pines copiados de la revisión anterior (uno, o todos los de la revisión). */
export const confirmHotspots = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'project_id' }] },
  async (ctx, input: { project_id: string; revision_id: string; hotspot_ids?: string[] }): Promise<{ error?: string; count?: number }> => {
    const t = await getTranslations('ActionErrors')
    const rev = await pidRevision(ctx.supabase, input.revision_id, input.project_id)
    if (!rev) return { error: t('pidHotspots.revisionNotFound') }
    let q = ctx.supabase.from('pid_hotspots').update({ needs_review: false })
      .eq('project_id', input.project_id).eq('revision_id', input.revision_id).eq('needs_review', true)
    if (input.hotspot_ids?.length) q = q.in('id', input.hotspot_ids.slice(0, 500))
    const { data, error } = await q.select('id')
    if (error) return { error: error.message }
    revalidatePath(viewerPath(input.project_id, rev.documentId))
    return { count: data?.length ?? 0 }
  },
)

// Sin role tier: el delete lo gobierna RLS (created_by = user OR editor)
export const deleteHotspot = withAuth(
  { guards: [{ resource: 'project', field: 'project_id' }] },
  async (ctx, input: { hotspot_id: string; project_id: string; document_id: string }): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('pid_hotspots')
      .delete()
      .eq('id', input.hotspot_id)
      .eq('project_id', input.project_id)
    if (error) return { error: error.message }
    revalidatePath(viewerPath(input.project_id, input.document_id))
    return {}
  },
)
