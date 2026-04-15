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

export type WorkflowActionType =
  | 'block_certificate'
  | 'notify_user'
  | 'create_punch'
  | 'change_system_state'
  | 'webhook_call'

export type WorkflowRuleInput = {
  name: string
  description?: string | null
  triggerEvent: string
  conditionJsonlogic: unknown
  actionType: WorkflowActionType
  actionPayload: Record<string, unknown>
  priority?: number
  enabled?: boolean
}

function validate(input: WorkflowRuleInput): string | null {
  if (!input.name?.trim()) return 'Nombre requerido'
  if (!input.triggerEvent?.trim()) return 'Evento requerido'
  if (!input.actionType) return 'Acción requerida'
  if (typeof input.conditionJsonlogic !== 'object' || input.conditionJsonlogic === null) {
    return 'Condición debe ser un objeto JsonLogic'
  }
  if (typeof input.actionPayload !== 'object' || input.actionPayload === null) {
    return 'Payload debe ser un objeto'
  }
  return null
}

export async function createWorkflowRule(
  input: WorkflowRuleInput,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const err = validate(input)
  if (err) return { error: err }

  const { data, error } = await ctx.supabase
    .from('workflow_rules')
    .insert({
      org_id: ctx.orgId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      trigger_event: input.triggerEvent.trim(),
      condition_jsonlogic: input.conditionJsonlogic,
      action_type: input.actionType,
      action_payload: input.actionPayload,
      priority: input.priority ?? 100,
      enabled: input.enabled ?? true,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/admin/workflows')
  return { id: data.id }
}

export async function updateWorkflowRule(
  id: string,
  input: WorkflowRuleInput,
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const err = validate(input)
  if (err) return { error: err }

  const { error } = await ctx.supabase
    .from('workflow_rules')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      trigger_event: input.triggerEvent.trim(),
      condition_jsonlogic: input.conditionJsonlogic,
      action_type: input.actionType,
      action_payload: input.actionPayload,
      priority: input.priority ?? 100,
      enabled: input.enabled ?? true,
    })
    .eq('id', id)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }
  revalidatePath('/admin/workflows')
  return {}
}

export async function toggleWorkflowRule(
  id: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('workflow_rules')
    .update({ enabled })
    .eq('id', id)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }
  revalidatePath('/admin/workflows')
  return {}
}

export async function deleteWorkflowRule(id: string): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'No autenticado' }
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: 'Sin permisos' }

  const { error } = await ctx.supabase
    .from('workflow_rules')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.orgId)

  if (error) return { error: error.message }
  revalidatePath('/admin/workflows')
  return {}
}
