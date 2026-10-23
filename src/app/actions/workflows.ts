'use server'

import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { revalidatePath } from 'next/cache'
import type { Enums, Json } from '@/types/supabase.generated'
import { isReflexiveRule } from '@/lib/workflows/rules'
import { getTranslations } from 'next-intl/server'

export type WorkflowActionType = Enums<'workflow_action_type'>

export type WorkflowRuleInput = {
  name: string
  description?: string | null
  triggerEvent: string
  conditionJsonlogic: Json
  actionType: WorkflowActionType
  actionPayload: { [key: string]: Json }
  priority?: number
  enabled?: boolean
}

async function validate(input: WorkflowRuleInput): Promise<string | null> {
  const t = await getTranslations('ActionErrors')
  if (!input.name?.trim()) return t('workflows.nameRequired')
  if (!input.triggerEvent?.trim()) return t('workflows.eventRequired')
  if (!input.actionType) return t('workflows.actionRequired')
  if (isReflexiveRule(input.triggerEvent, input.actionType)) return t('workflows.reflexive')
  if (typeof input.conditionJsonlogic !== 'object' || input.conditionJsonlogic === null) {
    return t('workflows.conditionObject')
  }
  if (typeof input.actionPayload !== 'object' || input.actionPayload === null) {
    return t('workflows.payloadObject')
  }
  return null
}

export const createWorkflowRule = withAuth(
  { role: PRIVILEGED_ROLES },
  async (ctx, input: WorkflowRuleInput): Promise<{ error?: string; id?: string }> => {
    const err = await validate(input)
    if (err) return { error: err }

    const { data, error } = await ctx.supabase
      .from('workflow_rules')
      .insert({
        org_id: ctx.orgId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
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
  },
)

export const updateWorkflowRule = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, id: string, input: WorkflowRuleInput): Promise<{ error?: string }> => {
    const err = await validate(input)
    if (err) return { error: err }

    const { error } = await ctx.supabase
      .from('workflow_rules')
      .update({
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
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
  },
)

export const toggleWorkflowRule = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, id: string, enabled: boolean): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('workflow_rules')
      .update({ enabled })
      .eq('id', id)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/workflows')
    return {}
  },
)

export const deleteWorkflowRule = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, id: string): Promise<{ error?: string }> => {
    const { error } = await ctx.supabase
      .from('workflow_rules')
      .delete()
      .eq('id', id)
      .eq('org_id', ctx.orgId)

    if (error) return { error: error.message }
    revalidatePath('/admin/workflows')
    return {}
  },
)
