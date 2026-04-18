'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ADMIN_ROLES = ['owner', 'admin', 'architect']

export type ApiScope =
  | 'tags:read'   | 'tags:write'
  | 'itrs:read'   | 'itrs:write'
  | 'punches:read'| 'punches:write'
  | 'certificates:read'
  | 'systems:read'
  | 'events:read'
  | '*'

export const API_SCOPES: { value: ApiScope; label: string; description: string }[] = [
  { value: 'tags:read',          label: 'tags:read',          description: 'Listar y leer tags con métricas 360°' },
  { value: 'tags:write',         label: 'tags:write',         description: 'Crear y actualizar tags' },
  { value: 'itrs:read',          label: 'itrs:read',          description: 'Listar ITR instances' },
  { value: 'itrs:write',         label: 'itrs:write',         description: 'Crear y actualizar ITRs' },
  { value: 'punches:read',       label: 'punches:read',       description: 'Listar punches' },
  { value: 'punches:write',      label: 'punches:write',      description: 'Crear y actualizar punches' },
  { value: 'certificates:read',  label: 'certificates:read',  description: 'Listar certificados' },
  { value: 'systems:read',       label: 'systems:read',       description: 'Leer jerarquía areas→systems→subsystems' },
  { value: 'events:read',        label: 'events:read',        description: 'Polling de domain_events para sincronización' },
  { value: '*',                  label: '* (superscope)',     description: 'Acceso total — usar solo para integraciones de confianza' },
]

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: m } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!m) return null
  return { supabase, orgId: m.org_id as string, userId: user.id, role: m.role as string }
}

export type CreateApiKeyInput = {
  name: string
  scopes: ApiScope[]
  expiresAt?: string | null
}

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<{ error?: string; id?: string; token?: string; keyPrefix?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  if (!input.name?.trim()) return { error: 'Nombre requerido' }
  if (!input.scopes || input.scopes.length === 0) return { error: 'Al menos un scope es requerido' }

  const { data, error } = await ctx.supabase.rpc('create_api_key', {
    p_org_id:     ctx.orgId,
    p_name:       input.name.trim(),
    p_scopes:     input.scopes,
    p_expires_at: input.expiresAt ?? null,
  })

  if (error) return { error: error.message }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { error: 'Respuesta vacía del RPC' }

  revalidatePath('/admin/api-keys')
  return {
    id:        row.id as string,
    token:     row.token as string,
    keyPrefix: row.key_prefix as string,
  }
}

export async function revokeApiKey(keyId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase.rpc('revoke_api_key', { p_key_id: keyId })
  if (error) return { error: error.message }

  revalidatePath('/admin/api-keys')
  return {}
}
