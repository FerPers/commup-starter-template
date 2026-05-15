'use server'

import { revalidatePath } from 'next/cache'
import { getActiveMembership } from '@/lib/supabase/membership'
import { checkProjectAccess } from '@/lib/auth/access'

export async function registerPidDocument(data: {
  project_id: string
  drawing_number: string
  title: string | null
  file_path: string
  file_name: string
  file_size: number
}): Promise<{ error?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }

  const access = await checkProjectAccess(ctx.supabase, ctx.orgId, data.project_id)
  if (!access.ok) return { error: access.error }

  const { error } = await ctx.supabase
    .from('pid_documents')
    .upsert(
      { ...data, uploaded_by: ctx.userId },
      { onConflict: 'project_id,drawing_number' }
    )

  if (error) return { error: error.message }

  revalidatePath(`/projects/${data.project_id}/tags`)
  revalidatePath(`/projects/${data.project_id}/pid-documents`)
  return {}
}

export async function deletePidDocument({
  id,
  projectId,
  filePath,
}: {
  id: string
  projectId: string
  filePath: string
}): Promise<{ error?: string }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }

  const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
  if (!access.ok) return { error: access.error }

  const { error: storageError } = await ctx.supabase.storage
    .from('pid-documents')
    .remove([filePath])
  if (storageError) return { error: storageError.message }

  const { error } = await ctx.supabase
    .from('pid_documents')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}/tags`)
  revalidatePath(`/projects/${projectId}/pid-documents`)
  return {}
}
