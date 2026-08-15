'use server'

import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'

// Antes no exigían rol — política 2026-05-24: gestión de P&IDs → EDITOR
export const registerPidDocument = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'project_id' }],
  },
  async (
    ctx,
    data: {
      project_id: string
      drawing_number: string
      title: string | null
      file_path: string
      file_name: string
      file_size: number
    },
  ): Promise<{ error?: string; id?: string }> => {

  const { data: row, error } = await ctx.supabase
    .from('pid_documents')
    .upsert(
      { ...data, uploaded_by: ctx.userId },
      { onConflict: 'project_id,drawing_number' }
    )
    .select('id')
    .single()

  if (error) return { error: error.message }

    revalidatePath(`/projects/${data.project_id}/tags`)
    revalidatePath(`/projects/${data.project_id}/pid-documents`)
    return { id: row?.id }
  },
)

export const deletePidDocument = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    { id, projectId, filePath }: { id: string; projectId: string; filePath: string },
  ): Promise<{ error?: string }> => {

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
  },
)
