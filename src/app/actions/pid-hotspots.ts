'use server'

import { getActiveMembership } from '@/lib/supabase/membership'
import { revalidatePath } from 'next/cache'

export async function upsertHotspot(input: {
  pid_document_id: string
  tag_id: string
  project_id: string
  page_num: number
  x_pct: number
  y_pct: number
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id, org_id')
    .eq('id', input.project_id)
    .eq('org_id', ctx.orgId)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const { data, error } = await ctx.supabase
    .from('pid_hotspots')
    .upsert({
      pid_document_id: input.pid_document_id,
      tag_id: input.tag_id,
      project_id: input.project_id,
      org_id: project.org_id,
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
}

export async function deleteHotspot(input: {
  hotspot_id: string
  project_id: string
  pid_document_id: string
}): Promise<{ error?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('id', input.project_id)
    .eq('org_id', ctx.orgId)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  // RLS policy allows delete if created_by = user OR user is privileged
  const { error } = await ctx.supabase
    .from('pid_hotspots')
    .delete()
    .eq('id', input.hotspot_id)
    .eq('project_id', input.project_id)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${input.project_id}/pid-documents/${input.pid_document_id}/viewer`)
  return {}
}
