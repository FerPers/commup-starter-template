'use server'

import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { revalidatePath } from 'next/cache'

export type CreateWebhookInput = {
  name: string
  endpointUrl: string
  projectId?: string | null
  eventTypes: string[]
}

export const createWebhookSubscription = withAuth(
  {
    role: PRIVILEGED_ROLES,
    guards: [{ resource: 'project', field: 'projectId', optional: true }],
  },
  async (
    ctx,
    input: CreateWebhookInput,
  ): Promise<{ error?: string; id?: string; secret?: string }> => {
    if (!input.name?.trim()) return { error: 'Nombre requerido' }
    if (!input.endpointUrl?.trim()) return { error: 'URL requerida' }
    if (!input.endpointUrl.startsWith('https://')) return { error: 'La URL debe usar https' }
    if (!input.eventTypes || input.eventTypes.length === 0) {
      return { error: 'Al menos un event type es requerido' }
    }

    const { data, error } = await ctx.supabase.rpc('create_webhook_subscription', {
      p_org_id:       ctx.orgId,
      p_project_id:   input.projectId ?? undefined,
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
  },
)

export const setWebhookEnabled = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, subId: string, enabled: boolean): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('set_webhook_enabled', {
      p_sub_id:  subId,
      p_enabled: enabled,
    })
    if (error) return { error: error.message }

    revalidatePath('/admin/webhooks')
    return {}
  },
)

export const deleteWebhookSubscription = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, subId: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase.rpc('delete_webhook_subscription', { p_sub_id: subId })
    if (error) return { error: error.message }

    revalidatePath('/admin/webhooks')
    return {}
  },
)
