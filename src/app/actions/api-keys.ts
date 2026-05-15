'use server'

import { getActiveMembership as getCtx } from '@/lib/supabase/membership'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { revalidatePath } from 'next/cache'
import type { ApiScope } from '@/lib/constants/api-scopes'

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
  if (!PRIVILEGED_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

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
  if (!PRIVILEGED_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase.rpc('revoke_api_key', { p_key_id: keyId })
  if (error) return { error: error.message }

  revalidatePath('/admin/api-keys')
  return {}
}
