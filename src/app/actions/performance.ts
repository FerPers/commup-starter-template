'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth/withAuth'
import type { Json } from '@/types/supabase.generated'
import {
  DISTURBANCE_KINDS, PERF_RESULTS, checkContent, toPayload, type ContentDraft, type DisturbanceKind, type Evaluation, type PerfResult,
} from '@/lib/performance/catalog'

// Prueba de desempeño (fase 7 plan readiness, sesión 1). Toda escritura pasa por RPC SECURITY DEFINER
// (migración 20261019120000), que aplica roles, «otra persona» al aprobar, un intento vivo, ventanas de
// tiempo y el congelado de datos. Aquí: guards del wrapper, validación previa y revalidación.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const base = (projectId: string) => `/projects/${projectId}/startup/performance`

type Table = 'performance_tests' | 'performance_test_revisions' | 'performance_runs' | 'performance_disturbances'

function revalidate(projectId: string, path?: string) {
  revalidatePath(base(projectId))
  if (path) revalidatePath(`${base(projectId)}/${path}`)
}

async function owned(db: SupabaseClient, table: Table, id: string, projectId: string) {
  const { data } = await db.from(table).select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  return !!data
}

const iso = (v: string | null | undefined) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined)

// ── Definición ───────────────────────────────────────────────────────────
export const createPerformanceTest = withAuth(
  { guards: [...projectGuard, { resource: 'system' as const, field: 'systemId', scopeField: 'projectId' }] },
  async (ctx, input: { projectId: string; title: string; systemId: string }): Promise<{ id?: string; error?: string }> => {
    if (!input.title?.trim()) return { error: 'El título es obligatorio' }
    const { data, error } = await ctx.supabase.rpc('create_performance_test', {
      p_project_id: input.projectId, p_title: input.title.trim().slice(0, 200), p_primary_system_id: input.systemId,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const updatePerformanceTest = withAuth(
  { guards: [...projectGuard, { resource: 'system' as const, field: 'systemId', scopeField: 'projectId' }] },
  async (ctx, input: { projectId: string; testId: string; title: string; systemId: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_tests', input.testId, input.projectId))) return { error: 'Prueba no encontrada' }
    const { error } = await ctx.supabase.rpc('update_performance_test', {
      p_test_id: input.testId, p_title: input.title.trim().slice(0, 200), p_primary_system_id: input.systemId,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.testId)
    return {}
  },
)

export const savePerformanceRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; testId: string; revisionId: string; content: ContentDraft; changeReason?: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_test_revisions', input.revisionId, input.projectId))) return { error: 'Revisión no encontrada' }
    const problem = checkContent(input.content)
    if (problem) return { error: problem }
    const { error } = await ctx.supabase.rpc('save_performance_revision', {
      p_revision_id: input.revisionId,
      p_content: toPayload(input.content) as unknown as Json,
      p_change_reason: input.changeReason?.trim() ? input.changeReason.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.testId)
    return {}
  },
)

export const transitionPerformanceRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; testId: string; revisionId: string; to: 'in_review' | 'draft' | 'approved'; comment?: string }): Promise<{ error?: string }> => {
    if (!['in_review', 'draft', 'approved'].includes(input.to)) return { error: 'Transición no válida' }
    if (!(await owned(ctx.supabase, 'performance_test_revisions', input.revisionId, input.projectId))) return { error: 'Revisión no encontrada' }
    const { error } = await ctx.supabase.rpc('transition_performance_revision', {
      p_revision_id: input.revisionId, p_to: input.to, p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.testId)
    return {}
  },
)

export const newPerformanceRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; testId: string; reason: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_tests', input.testId, input.projectId))) return { error: 'Prueba no encontrada' }
    const { error } = await ctx.supabase.rpc('new_performance_revision', { p_test_id: input.testId, p_reason: input.reason.slice(0, 2000) })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.testId)
    return {}
  },
)

export const deletePerformanceTest = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; testId: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_tests', input.testId, input.projectId))) return { error: 'Prueba no encontrada' }
    const { error } = await ctx.supabase.rpc('delete_performance_test_draft', { p_test_id: input.testId })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

/** S11 (E-14): retirar una prueba que ya no aplica (líder+, motivo ≥ 10): deja de contar para el gate. */
export const withdrawPerformanceTest = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; testId: string; reason: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_tests', input.testId, input.projectId))) return { error: 'Prueba no encontrada' }
    const { error } = await ctx.supabase.rpc('withdraw_performance_test', { p_test_id: input.testId, p_reason: (input.reason ?? '').trim().slice(0, 2000) })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    revalidatePath(`/projects/${input.projectId}/startup/performance/${input.testId}`)
    return {}
  },
)

// ── Ejecución ────────────────────────────────────────────────────────────
export const startPerformanceRun = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; testId: string }): Promise<{ id?: string; error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_tests', input.testId, input.projectId))) return { error: 'Prueba no encontrada' }
    const { data, error } = await ctx.supabase.rpc('start_performance_run', { p_test_id: input.testId })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.testId)
    return { id: data as string }
  },
)

export const advancePerformanceRun = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; to: 'stabilizing' | 'formal'; at?: string | null; comment?: string }): Promise<{ error?: string }> => {
    if (!['stabilizing', 'formal'].includes(input.to)) return { error: 'Transición no válida' }
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { error } = await ctx.supabase.rpc('advance_performance_run', {
      p_run_id: input.runId, p_to: input.to, p_at: iso(input.at),
      p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

export const closePerformanceRun = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; at?: string | null; reason?: string }): Promise<{ rows?: number; error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { data, error } = await ctx.supabase.rpc('close_performance_run', {
      p_run_id: input.runId, p_at: iso(input.at), p_reason: input.reason?.trim() ? input.reason.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return { rows: data as number }
  },
)

export const refreezePerformanceRun = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string }): Promise<{ rows?: number; error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { data, error } = await ctx.supabase.rpc('refreeze_performance_run', { p_run_id: input.runId })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return { rows: data as number }
  },
)

export const abortPerformanceRun = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; reason: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { error } = await ctx.supabase.rpc('abort_performance_run', { p_run_id: input.runId, p_reason: input.reason.slice(0, 2000) })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

export const recordPerformanceDisturbance = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; kind: DisturbanceKind; description: string; startedAt: string; endedAt?: string | null }): Promise<{ error?: string }> => {
    if (!DISTURBANCE_KINDS.includes(input.kind)) return { error: 'Tipo de perturbación no válido' }
    if (!iso(input.startedAt)) return { error: 'Hora de inicio no válida' }
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { error } = await ctx.supabase.rpc('record_performance_disturbance', {
      p_run_id: input.runId, p_kind: input.kind, p_description: input.description.trim().slice(0, 2000),
      p_started_at: iso(input.startedAt)!, p_ended_at: iso(input.endedAt),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

export const endPerformanceDisturbance = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; disturbanceId: string; endedAt?: string | null }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_disturbances', input.disturbanceId, input.projectId))) return { error: 'Perturbación no encontrada' }
    const { error } = await ctx.supabase.rpc('end_performance_disturbance', { p_disturbance_id: input.disturbanceId, p_ended_at: iso(input.endedAt) })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

export const setPerformanceDisturbanceExclusion = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; disturbanceId: string; excluded: boolean; reason: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_disturbances', input.disturbanceId, input.projectId))) return { error: 'Perturbación no encontrada' }
    const { error } = await ctx.supabase.rpc('set_performance_disturbance_exclusion', {
      p_disturbance_id: input.disturbanceId, p_excluded: input.excluded, p_reason: input.reason.slice(0, 2000),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

export const addPerformanceManualReading = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; variableId: string; at: string; value: string }): Promise<{ error?: string }> => {
    const value = Number(input.value.replace(',', '.'))
    if (input.value.trim() === '' || !Number.isFinite(value)) return { error: 'Valor no válido' }
    if (!iso(input.at)) return { error: 'Hora no válida' }
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { error } = await ctx.supabase.rpc('add_performance_manual_reading', {
      p_run_id: input.runId, p_variable_id: input.variableId, p_at: iso(input.at)!, p_value: value,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

export const deletePerformanceManualReading = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; variableId: string; bucket: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { error } = await ctx.supabase.rpc('delete_performance_manual_reading', {
      p_run_id: input.runId, p_variable_id: input.variableId, p_bucket: input.bucket,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

// ── Evaluación y resultado (sesión 2) ────────────────────────────────────
/** Evaluación en vivo de un intento cerrado (o la congelada si ya tiene resultado). La calcula la BD. */
export const evaluatePerformanceRun = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string }): Promise<{ data?: Evaluation; error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { data, error } = await ctx.supabase.rpc('evaluate_performance_run', { p_run_id: input.runId })
    if (error) return { error: error.message }
    return { data: data as unknown as Evaluation }
  },
)

export const recordPerformanceResult = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; result: PerfResult; reason?: string }): Promise<{ actionId?: string | null; error?: string }> => {
    if (!PERF_RESULTS.includes(input.result)) return { error: 'Resultado no válido' }
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { data, error } = await ctx.supabase.rpc('record_performance_result', {
      p_run_id: input.runId, p_result: input.result,
      p_reason: input.reason?.trim() ? input.reason.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    revalidatePath(`/projects/${input.projectId}/daily`)
    revalidatePath('/my-work')
    revalidatePath('/control-tower', 'layout')
    return { actionId: (data as string | null) ?? null }
  },
)

// ── Certificado PTC (sesión 2b) ───────────────────────────────────────────
async function ownedCertificate(db: SupabaseClient, id: string, projectId: string) {
  const { data } = await db.from('performance_certificates').select('id, run_id').eq('id', id).eq('project_id', projectId).maybeSingle()
  return data as { id: string; run_id: string } | null
}

function revalidateCertificate(projectId: string, runId: string) {
  revalidate(projectId, `runs/${runId}`)
  revalidatePath('/my-work')
  revalidatePath('/control-tower', 'layout')
}

/** Emite el PTC de un intento aceptado; quien emite firma como Comisionamiento. */
export const issuePerformanceCertificate = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string }): Promise<{ id?: string; error?: string }> => {
    if (!(await owned(ctx.supabase, 'performance_runs', input.runId, input.projectId))) return { error: 'Intento no encontrado' }
    const { data, error } = await ctx.supabase.rpc('issue_performance_certificate', { p_run_id: input.runId })
    if (error) return { error: error.message }
    revalidateCertificate(input.projectId, input.runId)
    return { id: data as string }
  },
)

export const signPerformanceCertificate = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; certificateId: string; capacity: 'operations' | 'client' }): Promise<{ status?: string; error?: string }> => {
    if (!['operations', 'client'].includes(input.capacity)) return { error: 'Capacidad no válida' }
    const cert = await ownedCertificate(ctx.supabase, input.certificateId, input.projectId)
    if (!cert) return { error: 'Certificado no encontrado' }
    const { data, error } = await ctx.supabase.rpc('sign_performance_certificate', { p_certificate_id: input.certificateId, p_capacity: input.capacity })
    if (error) return { error: error.message }
    revalidateCertificate(input.projectId, cert.run_id)
    return { status: data as string }
  },
)

export const revokePerformanceCertificate = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; certificateId: string; reason: string }): Promise<{ error?: string }> => {
    const cert = await ownedCertificate(ctx.supabase, input.certificateId, input.projectId)
    if (!cert) return { error: 'Certificado no encontrado' }
    const { error } = await ctx.supabase.rpc('revoke_performance_certificate', { p_certificate_id: input.certificateId, p_reason: input.reason.slice(0, 2000) })
    if (error) return { error: error.message }
    revalidateCertificate(input.projectId, cert.run_id)
    return {}
  },
)
