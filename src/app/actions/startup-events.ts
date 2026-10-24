'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { withAuth } from '@/lib/auth/withAuth'
import type { Json } from '@/types/supabase.generated'
import { EVENT_CATEGORIES, MILESTONES, type EventCategory, type Milestone } from '@/lib/startup/catalog'

// Bitácora de arranque (fase 6 plan readiness, sesión 2). Escritura por RPC SECURITY DEFINER (migración
// 20261018120000): unicidad del hito, bloqueo duro de primer arranque / primer HC, foto IIoT en la BD y
// testigo distinto con la capacidad del hito. Aquí: guards, validación de entradas y revalidación.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]

function revalidate(projectId: string, eventId?: string) {
  revalidatePath(`/projects/${projectId}/startup`)
  if (eventId) revalidatePath(`/projects/${projectId}/startup/events/${eventId}`)
  revalidatePath('/my-work')
  revalidatePath('/projects/[id]', 'layout')
}

async function owned(db: SupabaseClient<Database>, id: string, projectId: string) {
  const { data } = await db.from('startup_events').select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  return !!data
}

export type RecordEventInput = {
  projectId: string
  systemId: string
  kind: 'milestone' | 'free'
  code: Milestone | EventCategory
  occurredAt: string
  title: string
  description?: string
  tagIds?: string[]
  runId?: string | null
  signalIds?: string[]
  manual?: { label: string; value: string; unit?: string }[]
  /** S25 (E-16): obligatorio si el evento es de hace más de 7 días (solo líder+). */
  backdateReason?: string
}

export const recordStartupEvent = withAuth(
  { guards: [...projectGuard, { resource: 'system' as const, field: 'systemId', scopeField: 'projectId' }] },
  async (ctx, input: RecordEventInput): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const okCode = input.kind === 'milestone' ? MILESTONES.includes(input.code as Milestone) : EVENT_CATEGORIES.includes(input.code as EventCategory)
    if (!okCode) return { error: t('startupEvents.eventKindInvalid') }
    if (Number.isNaN(Date.parse(input.occurredAt))) return { error: t('startupEvents.timeInvalid') }
    if (!input.title?.trim()) return { error: t('startupEvents.titleRequired') }
    const manual = (input.manual ?? []).filter(m => m.label?.trim() && m.value?.trim()).slice(0, 50)
      .map(m => ({ label: m.label.trim().slice(0, 100), value: m.value.trim().slice(0, 200), unit: m.unit?.trim().slice(0, 30) ?? '' }))
    const { data, error } = await ctx.supabase.rpc('record_startup_event', {
      p_project_id: input.projectId,
      p_system_id: input.systemId,
      p_kind: input.kind,
      p_code: input.code,
      p_occurred_at: new Date(input.occurredAt).toISOString(),
      p_title: input.title.trim().slice(0, 200),
      p_description: input.description?.trim() ? input.description.trim().slice(0, 8000) : undefined,
      p_tag_ids: input.tagIds?.length ? input.tagIds.slice(0, 200) : undefined,
      p_run_id: (input.runId ?? '') === '' ? undefined : input.runId!,
      p_signal_ids: input.signalIds?.length ? input.signalIds.slice(0, 50) : undefined,
      p_manual: manual.length ? (manual as Json) : undefined,
      p_backdate_reason: input.backdateReason?.trim() ? input.backdateReason.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const addStartupEventParam = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; eventId: string; label: string; value: string; unit?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, input.eventId, input.projectId))) return { error: t('startupEvents.eventNotFound') }
    const { error } = await ctx.supabase.rpc('add_startup_event_param', {
      p_event_id: input.eventId, p_label: input.label.slice(0, 100), p_value: input.value.slice(0, 200),
      p_unit: input.unit?.trim() ? input.unit.trim().slice(0, 30) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.eventId)
    return {}
  },
)

export const witnessStartupEvent = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; eventId: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, input.eventId, input.projectId))) return { error: t('startupEvents.eventNotFound') }
    const { error } = await ctx.supabase.rpc('witness_startup_event', { p_event_id: input.eventId })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.eventId)
    return {}
  },
)

export const voidStartupEvent = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; eventId: string; reason: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, input.eventId, input.projectId))) return { error: t('startupEvents.eventNotFound') }
    const { error } = await ctx.supabase.rpc('void_startup_event', { p_event_id: input.eventId, p_reason: input.reason.slice(0, 2000) })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.eventId)
    return {}
  },
)

/** Prerrequisitos de arranque del sistema (para avisar antes de intentar registrar primer arranque / HC). */
export const getStartupPrerequisites = withAuth(
  { guards: [...projectGuard, { resource: 'system' as const, field: 'systemId', scopeField: 'projectId' }] },
  async (ctx, input: { projectId: string; systemId: string }): Promise<{ data?: { gate_ok: boolean; gate_code: string | null; gate_status: string; pssr_ok: boolean; pssr_number: string | null; pssr_status: string }; error?: string }> => {
    const { data, error } = await ctx.supabase.rpc('startup_prerequisites', { p_system_id: input.systemId })
    if (error) return { error: error.message }
    return { data: data as never }
  },
)
