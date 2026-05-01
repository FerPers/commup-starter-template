'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const ADMIN_ROLES = ['owner', 'admin', 'architect']

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

export type CreateWebhookInput = {
  name: string
  endpointUrl: string
  projectId?: string | null
  eventTypes: string[]
}

export async function createWebhookSubscription(
  input: CreateWebhookInput,
): Promise<{ error?: string; id?: string; secret?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  if (!input.name?.trim()) return { error: 'Nombre requerido' }
  if (!input.endpointUrl?.trim()) return { error: 'URL requerida' }
  if (!input.endpointUrl.startsWith('https://')) return { error: 'La URL debe usar https' }
  if (!input.eventTypes || input.eventTypes.length === 0) {
    return { error: 'Al menos un event type es requerido' }
  }

  const { data, error } = await ctx.supabase.rpc('create_webhook_subscription', {
    p_org_id:       ctx.orgId,
    p_project_id:   input.projectId ?? null,
    p_name:         input.name.trim(),
    p_endpoint_url: input.endpointUrl.trim(),
    p_event_types:  input.eventTypes,
  })

  if (error) return { error: error.message }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { error: 'Respuesta vacía del RPC' }

  revalidatePath('/admin/webhooks')
  return {
    id:     row.id as string,
    secret: row.secret as string,
  }
}

export async function setWebhookEnabled(
  subId: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase.rpc('set_webhook_enabled', {
    p_sub_id:  subId,
    p_enabled: enabled,
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/webhooks')
  return {}
}

export async function deleteWebhookSubscription(subId: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase.rpc('delete_webhook_subscription', { p_sub_id: subId })
  if (error) return { error: error.message }

  revalidatePath('/admin/webhooks')
  return {}
}
