import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations } from 'next-intl/server'
import { aiNotConfigured, createClaudeClient, isAiConfigured } from './claude'
import { AI_MODELS, aiCostUsd, type AiFeature } from './pricing'

// S15 (A-13 / I-19 / C-43): toda llamada a Claude pasa por aquí. Antes de llamar revisa la cuota diaria de la org
// (organizations.settings.ai.daily_budget_usd, por defecto 20 USD/día UTC; RPC ai_quota_status); elige el modelo de
// la tarea (AI_MODELS); después registra tokens, coste y stop_reason en ai_usage (service role, no falsificable).
// Los errores del SDK se traducen a un mensaje uniforme.

export type AiMeta = { orgId: string; userId: string; projectId?: string | null; feature: AiFeature }

export async function checkAiQuota(orgId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc('ai_quota_status', { p_org_id: orgId })
  if (error) return null // la cuota no debe tumbar la función si falla la lectura; queda el registro
  const row = (data ?? [])[0] as { used_usd: number; budget_usd: number } | undefined
  if (row && Number(row.used_usd) >= Number(row.budget_usd)) {
    const t = await getTranslations('ActionErrors')
    return t('ai.quota', { budget: Number(row.budget_usd).toFixed(2) })
  }
  return null
}

async function recordAiUsage(meta: AiMeta, model: string, usage: Anthropic.Usage | null, stopReason: string | null, ok: boolean) {
  const { error } = await createAdminClient().from('ai_usage').insert({
    org_id: meta.orgId, project_id: meta.projectId ?? null, user_id: meta.userId, feature: meta.feature, model,
    input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0,
    cache_read_tokens: usage?.cache_read_input_tokens ?? 0, cache_write_tokens: usage?.cache_creation_input_tokens ?? 0,
    cost_usd: usage ? aiCostUsd(model, usage) : 0, stop_reason: stopReason, ok,
  })
  if (error) console.error('[ai_usage] no se pudo registrar:', error.message)
}

export async function aiErrorMessage(err: unknown): Promise<string> {
  const t = await getTranslations('ActionErrors')
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return t('ai.badKey')
  if (err instanceof Anthropic.RateLimitError) return t('ai.rateLimited')
  if (err instanceof Anthropic.BadRequestError) return t('ai.badRequest')
  return t('ai.failed')
}

/** Ejecuta la llamada con el modelo de la tarea; registra uso y traduce errores. La rechaza si se pasó la cuota. */
export async function runAi<T extends Anthropic.Message>(
  meta: AiMeta,
  call: (client: Anthropic, model: string) => Promise<T>,
): Promise<{ response: T; error?: undefined } | { response?: undefined; error: string }> {
  if (!isAiConfigured()) return { error: await aiNotConfigured() }
  const quota = await checkAiQuota(meta.orgId)
  if (quota) return { error: quota }
  const model = AI_MODELS[meta.feature]
  let response: T
  try {
    response = await call(createClaudeClient(), model)
  } catch (err) {
    console.error(`[ai:${meta.feature}] Claude error:`, err)
    await recordAiUsage(meta, model, null, 'error', false)
    return { error: await aiErrorMessage(err) }
  }
  await recordAiUsage(meta, response.model ?? model, response.usage, response.stop_reason, response.stop_reason !== 'refusal')
  if (response.stop_reason === 'refusal') {
    const t = await getTranslations('ActionErrors')
    return { error: t('ai.refused') }
  }
  return { response }
}
