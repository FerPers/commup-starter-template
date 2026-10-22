'use server'

import { ADMIN_ROLES, OWNER_ROLES, PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus } from '@/types/database'
import { isValidTimeZone } from '@/lib/time/zone'
import { LOGO_BUCKET, LOGO_MAX_BYTES, LOGO_MIME_EXT, clientLogoPath } from '@/lib/constants/logos'

export interface ProjectUpdatePayload {
  name?: string
  code?: string
  country?: string | null
  region?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: ProjectStatus
  /** S10 (D12): zona IANA del proyecto (la BD la valida con pg_timezone_names). */
  timezone?: string
  /** E2: nombre del cliente (sale junto a su logo en los PDF formales). */
  client?: string | null
}

const UPDATABLE = ['name', 'code', 'country', 'region', 'start_date', 'end_date', 'status', 'timezone', 'client'] as const

export const updateProject = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (
    ctx,
    projectId: string,
    payload: ProjectUpdatePayload,
  ): Promise<{ error?: string }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    if ('timezone' in payload && !isValidTimeZone(payload.timezone)) return { error: 'Zona horaria no válida' }
    // Solo los campos editables (el payload llega del cliente).
    const patch = Object.fromEntries(UPDATABLE.filter(k => k in payload).map(k => [k, payload[k]])) as ProjectUpdatePayload

    const { error } = await ctx.supabase
      .from('projects')
      .update(patch)
      .eq('id', projectId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }

    // La zona cambia «hoy» en todo el proyecto (S10): revalidar el árbol completo.
    revalidatePath(`/projects/${projectId}`, 'layout')
    return {}
  },
)

export const deleteProject = withAuthOnly(
  { role: OWNER_ROLES },
  async (ctx, projectId: string): Promise<{ error?: string }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    const { error } = await ctx.supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }

    revalidatePath('/projects')
    return {}
  },
)

/** Borra las variantes del logo del cliente (png/jpg/webp): al cambiar de formato no queda el anterior. */
async function removeClientLogoFiles(storage: { from: (b: string) => { remove: (paths: string[]) => Promise<unknown> } }, orgId: string, projectId: string) {
  await storage.from(LOGO_BUCKET).remove(Object.values(LOGO_MIME_EXT).map(ext => clientLogoPath(orgId, projectId, ext)))
}

/**
 * E2 (maquetas M): logo del cliente del proyecto para los PDF formales y el Portafolio. Como el logo de la org: bucket
 * público org-assets, solo PNG/JPG/WebP ≤ 2 MB, lo suben owner/admin (las políticas del bucket exigen lo mismo).
 */
export const uploadProjectClientLogo = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, projectId: string, formData: FormData): Promise<{ url?: string; error?: string }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    const file = formData.get('file') as File | null
    if (!file) return { error: 'No se adjuntó archivo' }
    if (file.size > LOGO_MAX_BYTES) return { error: 'El archivo supera 2 MB' }
    const ext = LOGO_MIME_EXT[file.type]
    if (!ext) return { error: 'El logo debe ser PNG, JPG o WebP' }

    await removeClientLogoFiles(ctx.supabase.storage, ctx.orgId, projectId)
    const path = clientLogoPath(ctx.orgId, projectId, ext)
    const { error: upErr } = await ctx.supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) return { error: upErr.message }

    const { data } = ctx.supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
    // misma ruta al reemplazar el logo: el parámetro evita que el navegador muestre el anterior
    const url = `${data.publicUrl}?v=${Date.now()}`
    const { error } = await ctx.supabase.from('projects').update({ client_logo_url: url }).eq('id', projectId).eq('org_id', ctx.orgId)
    if (error) return { error: error.message }

    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/dashboard')
    return { url }
  },
)

export const removeProjectClientLogo = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, projectId: string): Promise<{ error?: string }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    await removeClientLogoFiles(ctx.supabase.storage, ctx.orgId, projectId)
    const { error } = await ctx.supabase.from('projects').update({ client_logo_url: null }).eq('id', projectId).eq('org_id', ctx.orgId)
    if (error) return { error: error.message }

    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/dashboard')
    return {}
  },
)
