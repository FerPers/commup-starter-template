'use server'

import { revalidatePath } from 'next/cache'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { normalizePidRef } from '@/lib/excel/normalize'

// Antes no exigían rol — política 2026-05-24: gestión de P&IDs → EDITOR.
// F-27 (S02): subir y borrar el PDF exige owner/admin/architect en storage (pid_docs_storage_*) y la UI
// solo los ofrece a esos roles, así que las actions de documento quedan en PRIVILEGED. Ubicar tags en
// el plano (pid-hotspots) sigue siendo EDITOR.
export const registerPidDocument = withAuth(
  {
    role: PRIVILEGED_ROLES,
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

  // Mismo criterio que la columna P&ID de los importadores: así el plano
  // subido coincide con lo que referencian tags y señales.
  const drawingNumber = normalizePidRef(data.drawing_number)
  if (!drawingNumber) return { error: 'El número de plano es requerido' }

  if (!data.file_path?.startsWith(`${data.project_id}/`)) return { error: 'Ruta de archivo no válida' }

  const { data: row, error } = await ctx.supabase
    .from('pid_documents')
    .upsert(
      {
        project_id: data.project_id,
        drawing_number: drawingNumber,
        title: data.title,
        file_path: data.file_path,
        file_name: data.file_name,
        file_size: data.file_size,
        uploaded_by: ctx.userId,
      },
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
    role: PRIVILEGED_ROLES,
    guards: [{ resource: 'project', field: 'projectId' }],
  },
  async (
    ctx,
    { id, projectId }: { id: string; projectId: string; filePath?: string },
  ): Promise<{ error?: string }> => {

  // F-27: la ruta del archivo sale de la fila (del proyecto verificado), nunca del cliente.
  const { data: doc } = await ctx.supabase
    .from('pid_documents')
    .select('id, file_path')
    .eq('id', id)
    .eq('project_id', projectId)
    .maybeSingle()
  if (!doc) return { error: 'Documento no encontrado' }

  const { error } = await ctx.supabase
    .from('pid_documents')
    .delete()
    .eq('id', doc.id)
    .eq('project_id', projectId)
  if (error) return { error: error.message }

  // Después de borrar la fila: si falla el storage queda un archivo huérfano, no una fila rota.
  if (doc.file_path) await ctx.supabase.storage.from('pid-documents').remove([doc.file_path])

  revalidatePath(`/projects/${projectId}/tags`)
  revalidatePath(`/projects/${projectId}/pid-documents`)
  return {}
  },
)
