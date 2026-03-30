'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function registerPidDocument(data: {
  project_id: string
  drawing_number: string
  title: string | null
  file_path: string
  file_name: string
  file_size: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { error } = await supabase
    .from('pid_documents')
    .upsert(
      { ...data, uploaded_by: user.id },
      { onConflict: 'project_id,drawing_number' }
    )

  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${data.project_id}/tags`)
  revalidatePath(`/projects/${data.project_id}/pid-documents`)
}

export async function deletePidDocument({
  id,
  projectId,
  filePath,
}: {
  id: string
  projectId: string
  filePath: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  // Delete from storage first
  const { error: storageError } = await supabase.storage
    .from('pid-documents')
    .remove([filePath])
  if (storageError) throw new Error(storageError.message)

  // Delete from database
  const { error } = await supabase
    .from('pid_documents')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${projectId}/tags`)
  revalidatePath(`/projects/${projectId}/pid-documents`)
}
