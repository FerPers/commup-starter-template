'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { revalidatePath } from 'next/cache'

// Antes no exigían rol — política 2026-05-24: posicionar tags en P&ID → EDITOR
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
    input: {
      pid_document_id: string
      tag_id: string
      project_id: string
      page_num: number
      x_pct: number
      y_pct: number
    },
  ): Promise<{ id?: string; error?: string }> => {

  const { data, error } = await ctx.supabase
    .from('pid_hotspots')
    .upsert({
      pid_document_id: input.pid_document_id,
      tag_id: input.tag_id,
      project_id: input.project_id,
      org_id: ctx.orgId,
      page_num: input.page_num,
      x_pct: input.x_pct,
      y_pct: input.y_pct,
      created_by: ctx.userId,
    }, { onConflict: 'pid_document_id,tag_id,page_num' })
    .select('id')
    .single()

  if (error) return { error: error.message }

    revalidatePath(`/projects/${input.project_id}/pid-documents/${input.pid_document_id}/viewer`)
    return { id: data.id }
  },
)

// Sin role tier: el delete lo gobierna RLS (created_by = user OR privileged)
export const deleteHotspot = withAuth(
  { guards: [{ resource: 'project', field: 'project_id' }] },
  async (
    ctx,
    input: {
      hotspot_id: string
      project_id: string
      pid_document_id: string
    },
  ): Promise<{ error?: string }> => {

  // RLS policy allows delete if created_by = user OR user is privileged
  const { error } = await ctx.supabase
    .from('pid_hotspots')
    .delete()
    .eq('id', input.hotspot_id)
    .eq('project_id', input.project_id)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.project_id}/pid-documents/${input.pid_document_id}/viewer`)
  return {}
  },
)
