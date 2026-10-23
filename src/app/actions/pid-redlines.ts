'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { normalizeRotation } from '@/lib/pid/geometry'
import { REJECT_MIN, toStoredMarks, validRedlineMarks, type RedlineMark } from '@/lib/pid/redlines'

// F-21a: red-line de campo sobre una revisión de un P&ID. Escritura SOLO por RPC (SECURITY DEFINER): crea y revisa
// Líder en adelante (revisa otra persona; rechazar exige motivo ≥ 10), comenta cualquier miembro del proyecto (también
// el cliente). Las fotos se suben al bucket redline-photos en <project_id>/<redline_id>/… y se registran por RPC.

const viewerPath = (projectId: string, documentId: string) => `/projects/${projectId}/documents/${documentId}/viewer`

export const createRedline = withAuth(
  {
    role: EDITOR_ROLES,
    guards: [
      { resource: 'project', field: 'project_id' },
      { resource: 'system', field: 'system_id', scopeField: 'project_id', optional: true },
      { resource: 'tag', field: 'tag_id', scopeField: 'project_id', optional: true },
    ],
  },
  async (
    ctx,
    input: {
      project_id: string
      document_id: string
      revision_id: string
      page_num: number
      description: string
      system_id?: string | null
      tag_id?: string | null
      marks: RedlineMark[]
      page_width: number
      page_height: number
      page_rotation: number
    },
  ): Promise<{ id?: string; number?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (input.description.trim().length < 3) return { error: t('pidRedlines.descriptionRequired') }
    if (!validRedlineMarks(input.marks)) return { error: t('pidRedlines.invalidMarks') }
    if (!(input.page_width > 0) || !(input.page_height > 0)) return { error: t('pidRedlines.invalidMarks') }
    const { data, error } = await ctx.supabase.rpc('create_pid_redline', {
      p_revision_id: input.revision_id,
      p_page_num: input.page_num,
      p_description: input.description,
      p_system_id: input.system_id ?? undefined,
      p_tag_id: input.tag_id ?? undefined,
      p_marks: toStoredMarks(input.marks),
      p_page_width: Math.round(input.page_width * 100) / 100,
      p_page_height: Math.round(input.page_height * 100) / 100,
      p_page_rotation: normalizeRotation(input.page_rotation),
    })
    if (error) return { error: error.message }
    const res = data as { id: string; number: string } | null
    if (!res?.id) return { error: t('pidRedlines.saveError') }
    revalidatePath(viewerPath(input.project_id, input.document_id))
    return { id: res.id, number: res.number }
  },
)

export const reviewRedline = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'project_id' }] },
  async (ctx, input: { project_id: string; document_id: string; redline_id: string; accept: boolean; note?: string | null }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const note = input.note?.trim() ?? ''
    if (!input.accept && note.length < REJECT_MIN) return { error: t('pidRedlines.reasonRequired', { min: REJECT_MIN }) }
    const { error } = await ctx.supabase.rpc('review_pid_redline', { p_id: input.redline_id, p_accept: input.accept, p_note: note })
    if (error) return { error: error.message === 'reason_required' ? t('pidRedlines.reasonRequired', { min: REJECT_MIN }) : error.message }
    revalidatePath(viewerPath(input.project_id, input.document_id))
    return {}
  },
)

export const addRedlineComment = withAuth(
  { guards: [{ resource: 'project', field: 'project_id' }] },
  async (ctx, input: { project_id: string; document_id: string; redline_id: string; body: string }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!input.body.trim()) return { error: t('pidRedlines.commentEmpty') }
    const { data, error } = await ctx.supabase.rpc('add_pid_redline_comment', { p_id: input.redline_id, p_body: input.body })
    if (error) return { error: error.message }
    revalidatePath(viewerPath(input.project_id, input.document_id))
    return { id: data ?? undefined }
  },
)

/** Registra una foto ya subida (el cliente sube al bucket y luego llama aquí). */
export const registerRedlinePhoto = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'project_id' }] },
  async (
    ctx,
    input: { project_id: string; document_id: string; redline_id: string; file_path: string; file_name: string; mime_type: string | null; size_bytes: number | null },
  ): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('add_pid_redline_photo', {
      p_id: input.redline_id, p_file_path: input.file_path, p_file_name: input.file_name,
      p_mime_type: input.mime_type ?? undefined, p_size_bytes: input.size_bytes ?? undefined,
    })
    if (error) return { error: error.message }
    revalidatePath(viewerPath(input.project_id, input.document_id))
    return {}
  },
)

/** URL firmadas (1 h) de las fotos de un red-line, para el panel. */
export const redlinePhotoUrls = withAuth(
  { guards: [{ resource: 'project', field: 'project_id' }] },
  async (ctx, input: { project_id: string; redline_id: string }): Promise<{ photos?: { id: string; url: string; name: string }[]; error?: string }> => {
    const { data, error } = await ctx.supabase
      .from('pid_redline_photos')
      .select('id, file_path, file_name')
      .eq('redline_id', input.redline_id)
      .eq('project_id', input.project_id)
      .order('created_at')
      .limit(50)
    if (error) return { error: error.message }
    if (!data?.length) return { photos: [] }
    const { data: signed, error: sErr } = await ctx.supabase.storage.from('redline-photos').createSignedUrls(data.map(p => p.file_path), 3600)
    if (sErr) return { error: sErr.message }
    const urlOf = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))
    return { photos: data.flatMap(p => (urlOf.get(p.file_path) ? [{ id: p.id, url: urlOf.get(p.file_path)!, name: p.file_name }] : [])) }
  },
)

/** F-21c: incorpora en la revisión vigente los red-lines elegidos; los demás pendientes pasan a esa revisión. */
export const incorporateRedlines = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'project_id' }] },
  async (ctx, input: { project_id: string; document_id: string; revision_id: string; ids: string[] }): Promise<{ incorporated?: number; carried?: number; error?: string }> => {
    const { data, error } = await ctx.supabase.rpc('incorporate_pid_redlines', { p_revision_id: input.revision_id, p_incorporate: input.ids.slice(0, 1000) })
    if (error) return { error: error.message }
    const res = data as { incorporated: number; carried: number } | null
    revalidatePath(`/projects/${input.project_id}/documents/${input.document_id}`)
    revalidatePath(viewerPath(input.project_id, input.document_id))
    return { incorporated: res?.incorporated ?? 0, carried: res?.carried ?? 0 }
  },
)
