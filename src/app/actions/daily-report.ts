'use server'

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getLocale } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { AI_NOT_CONFIGURED, CLAUDE_MODEL, createClaudeClient, isAiConfigured } from '@/lib/ai/claude'
import { REPORT_SECTIONS, reportFacts, type ReportData, type ReportSections } from '@/lib/daily/report'

// Reporte diario y relevo de turno (fase 5 plan readiness, sesión 3). Toda escritura pasa por RPC
// SECURITY DEFINER (migración 20261017180000). Los DATOS del reporte los arma la BD; aquí solo se pide a
// Claude la redacción de las 5 secciones a partir de esos datos (nunca pisa lo ya editado: lo hace la RPC).

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const ISO = /^\d{4}-\d{2}-\d{2}$/
const SHIFT_LABELS = ['day', 'night', 'other'] as const

function revalidate(projectId: string, id?: string, kind: 'reports' | 'handovers' = 'reports') {
  revalidatePath(`/projects/${projectId}/daily/${kind}`)
  if (id) revalidatePath(`/projects/${projectId}/daily/${kind}/${id}`)
  if (kind === 'handovers') revalidatePath('/my-work')
}

async function belongs(db: SupabaseClient, table: 'daily_reports' | 'shift_handovers', id: string, projectId: string) {
  const { data } = await db.from(table).select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  return !!data
}

// ── IA ──────────────────────────────────────────────────────────────────
const REPORT_RULES = (lang: string) => `Eres el gerente de comisionamiento de un proyecto industrial (Oil & Gas, energía). Redactas el reporte diario de avance para la gerencia del proyecto y el cliente.

Idioma: ${lang}. Tono técnico, directo, sin adjetivos de relleno.

Reglas estrictas:
- Usa SOLO los hechos del bloque DATOS. No inventes cifras, tags, números de registro, nombres ni fechas. Si algo no está, no lo menciones.
- Cita los números de registro tal cual (ITR, punch, RES-, ACC-, BYP-…) y el sistema entre corchetes cuando ayude.
- summary: 3 a 5 frases: avance ponderado (y su variación si existe), lo más relevante del día y el principal riesgo.
- key_events: viñetas «- » con lo que pasó hoy (ITR aprobados, gates aprobados, punch nuevos relevantes, TQ respondidos).
- issues: viñetas con fallas, regresiones de gate, punch Cat A, acciones vencidas. Vacío si no hay.
- constraints: viñetas con las restricciones de nivel ≥ 3 o vencidas y su plan de recuperación; menciona las escaladas hoy.
- next_day_plan: viñetas a partir de PRÓXIMOS 7 DÍAS y de lo pendiente; prioriza gates comprometidos y restricciones que vencen.
- Si un bloque no tiene hechos, devuelve una cadena vacía para esa sección.`

const ReportOutput = z.object({
  summary: z.string(),
  key_events: z.string(),
  issues: z.string(),
  constraints: z.string(),
  next_day_plan: z.string(),
})

// ── Reporte diario ──────────────────────────────────────────────────────
export const createDailyReportDraft = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; date: string; areaId?: string | null }): Promise<{ id?: string; error?: string }> => {
    if (!ISO.test(input.date)) return { error: 'Fecha no válida' }
    const { data, error } = await ctx.supabase.rpc('create_daily_report_draft', {
      p_project_id: input.projectId, p_date: input.date, p_area_id: (input.areaId ?? '') === '' ? undefined : input.areaId!,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, data as string)
    return { id: data as string }
  },
)

export const refreshDailyReportData = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; reportId: string }): Promise<{ error?: string }> => {
    if (!(await belongs(ctx.supabase, 'daily_reports', input.reportId, input.projectId))) return { error: 'Reporte no encontrado' }
    const { error } = await ctx.supabase.rpc('refresh_daily_report_data', { p_report_id: input.reportId })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.reportId)
    return {}
  },
)

/**
 * Pide a Claude la redacción a partir de los datos congelados del reporte. La RPC guarda la propuesta en
 * ai_draft y solo llena secciones vacías; con `replace` (confirmado en la UI) las reemplaza todas.
 */
export const generateDailyReportAi = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; reportId: string; replace?: boolean }): Promise<{ error?: string }> => {
    if (!isAiConfigured()) return { error: AI_NOT_CONFIGURED }
    const { data: report } = await ctx.supabase.from('daily_reports').select('id, status, data')
      .eq('id', input.reportId).eq('project_id', input.projectId).maybeSingle()
    if (!report) return { error: 'Reporte no encontrado' }
    if (report.status !== 'draft') return { error: 'El reporte ya fue emitido' }

    const locale = await getLocale()
    let response
    try {
      response = await createClaudeClient().messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 6000,
        output_config: { effort: 'medium', format: zodOutputFormat(ReportOutput) },
        system: REPORT_RULES(locale === 'en' ? 'English' : 'español'),
        messages: [{ role: 'user', content: `DATOS:\n\n${reportFacts(report.data as unknown as ReportData)}\n\nRedacta las 5 secciones del reporte diario.` }],
      })
    } catch (err) {
      console.error('[daily-report] Claude error:', err)
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return { error: 'La clave de la IA (ANTHROPIC_API_KEY) no es válida en este entorno. Pídele al administrador de la plataforma que la renueve.' }
      }
      if (err instanceof Anthropic.RateLimitError) return { error: 'La IA está saturada en este momento. Intenta de nuevo en unos minutos.' }
      return { error: 'No se pudo consultar la IA. Intenta de nuevo en unos minutos.' }
    }
    if (response.stop_reason === 'refusal') return { error: 'El modelo declinó la solicitud.' }
    const parsed = response.parsed_output
    if (!parsed) return { error: 'La respuesta de la IA no pudo interpretarse. Intenta de nuevo.' }

    // S10 (D-28): reemplazar es una sola RPC (antes vaciar + llenar en dos: si la segunda fallaba, se perdían las ediciones).
    const { error } = await ctx.supabase.rpc(input.replace ? 'replace_daily_report_ai_draft' : 'set_daily_report_ai_draft', {
      p_report_id: input.reportId, p_draft: parsed, p_model: response.model,
    })
    if (error) return { error: error.message }
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'daily_report.ai_drafted', entityType: 'project', entityId: input.projectId,
      payload: { report_id: input.reportId, model: response.model, replace: !!input.replace },
    })
    revalidate(input.projectId, input.reportId)
    return {}
  },
)

export const updateDailyReportSections = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; reportId: string; sections: Partial<ReportSections> }): Promise<{ error?: string }> => {
    if (!(await belongs(ctx.supabase, 'daily_reports', input.reportId, input.projectId))) return { error: 'Reporte no encontrado' }
    const sections = Object.fromEntries(
      REPORT_SECTIONS.filter(s => typeof input.sections?.[s] === 'string').map(s => [s, input.sections[s]!.slice(0, 8000)]),
    )
    const { error } = await ctx.supabase.rpc('update_daily_report_sections', { p_report_id: input.reportId, p_sections: sections })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.reportId)
    return {}
  },
)

export const issueDailyReport = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; reportId: string }): Promise<{ hash?: string; error?: string }> => {
    if (!(await belongs(ctx.supabase, 'daily_reports', input.reportId, input.projectId))) return { error: 'Reporte no encontrado' }
    const { data, error } = await ctx.supabase.rpc('issue_daily_report', { p_report_id: input.reportId })
    if (error) return { error: error.message }
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'daily_report.issued', entityType: 'project', entityId: input.projectId,
      payload: { report_id: input.reportId, hash: data },
    })
    revalidate(input.projectId, input.reportId)
    return { hash: data as string }
  },
)

export const reviseDailyReport = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; reportId: string; reason: string }): Promise<{ id?: string; error?: string }> => {
    if (!(await belongs(ctx.supabase, 'daily_reports', input.reportId, input.projectId))) return { error: 'Reporte no encontrado' }
    const { data, error } = await ctx.supabase.rpc('revise_daily_report', { p_report_id: input.reportId, p_reason: input.reason?.slice(0, 2000) ?? '' })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.reportId)
    return { id: data as string }
  },
)

export const deleteDailyReportDraft = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; reportId: string }): Promise<{ error?: string }> => {
    if (!(await belongs(ctx.supabase, 'daily_reports', input.reportId, input.projectId))) return { error: 'Reporte no encontrado' }
    const { error } = await ctx.supabase.rpc('delete_daily_report_draft', { p_report_id: input.reportId })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

// ── Relevo de turno ─────────────────────────────────────────────────────
export const openShiftHandover = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; shiftLabel: (typeof SHIFT_LABELS)[number]; shiftDate: string }): Promise<{ id?: string; error?: string }> => {
    if (!SHIFT_LABELS.includes(input.shiftLabel)) return { error: 'Turno no válido' }
    if (!ISO.test(input.shiftDate)) return { error: 'Fecha no válida' }
    const { data, error } = await ctx.supabase.rpc('open_shift_handover', {
      p_project_id: input.projectId, p_shift_label: input.shiftLabel, p_shift_date: input.shiftDate,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, data as string, 'handovers')
    return { id: data as string }
  },
)

export const updateShiftHandover = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; handoverId: string; pending: string; safety: string }): Promise<{ error?: string }> => {
    if (!(await belongs(ctx.supabase, 'shift_handovers', input.handoverId, input.projectId))) return { error: 'Relevo no encontrado' }
    const { error } = await ctx.supabase.rpc('update_shift_handover', {
      p_handover_id: input.handoverId, p_pending: input.pending.slice(0, 8000), p_safety: input.safety.slice(0, 8000),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.handoverId, 'handovers')
    return {}
  },
)

export const handOverShift = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; handoverId: string }): Promise<{ error?: string }> => {
    if (!(await belongs(ctx.supabase, 'shift_handovers', input.handoverId, input.projectId))) return { error: 'Relevo no encontrado' }
    const { error } = await ctx.supabase.rpc('hand_over_shift', { p_handover_id: input.handoverId })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.handoverId, 'handovers')
    return {}
  },
)

export const acceptShiftHandover = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; handoverId: string; comment?: string }): Promise<{ error?: string }> => {
    if (!(await belongs(ctx.supabase, 'shift_handovers', input.handoverId, input.projectId))) return { error: 'Relevo no encontrado' }
    const { error } = await ctx.supabase.rpc('accept_shift_handover', {
      p_handover_id: input.handoverId, p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 4000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.handoverId, 'handovers')
    return {}
  },
)

export const deleteShiftHandoverDraft = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; handoverId: string }): Promise<{ error?: string }> => {
    if (!(await belongs(ctx.supabase, 'shift_handovers', input.handoverId, input.projectId))) return { error: 'Relevo no encontrado' }
    const { error } = await ctx.supabase.rpc('delete_shift_handover_draft', { p_handover_id: input.handoverId })
    if (error) return { error: error.message }
    revalidate(input.projectId, undefined, 'handovers')
    return {}
  },
)
