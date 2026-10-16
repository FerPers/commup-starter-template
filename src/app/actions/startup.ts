'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth/withAuth'
import type { Json } from '@/types/supabase.generated'
import {
  HOLD_CAPACITIES, LINEUP_PURPOSES, PROCEDURE_KINDS, PROCEDURE_SECTIONS, VALVE_POSITIONS,
  type LineupPurpose, type ProcedureKind, type ProcedureSection, type StepDraft, type ValvePosition,
} from '@/lib/startup/catalog'

// Arranque (fase 6 plan readiness, sesión 1): procedimientos con hold points y line-ups. Toda escritura pasa
// por RPC SECURITY DEFINER (migración 20261017210000), que aplica roles, orden de pasos, «otra persona» y
// estados. Aquí: guards del wrapper, limpieza de entradas y revalidación.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const systemGuard = { resource: 'system' as const, field: 'systemId', scopeField: 'projectId', optional: true }
const base = (projectId: string) => `/projects/${projectId}/startup`

function revalidate(projectId: string, path?: string) {
  revalidatePath(base(projectId))
  if (path) revalidatePath(`${base(projectId)}/${path}`)
  revalidatePath('/my-work')
  revalidatePath('/control-tower', 'layout')
}

async function owned(db: SupabaseClient, table: 'procedures' | 'procedure_revisions' | 'procedure_runs' | 'lineup_sheets' | 'lineup_items', id: string, projectId: string) {
  const { data } = await db.from(table).select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  return !!data
}

const nullable = (v: string | null | undefined) => ((v ?? '') === '' ? null : v) as unknown as string

// ── Procedimientos ──────────────────────────────────────────────────────
export const createProcedure = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (ctx, input: { projectId: string; title: string; kind: ProcedureKind; systemId?: string | null }): Promise<{ id?: string; error?: string }> => {
    if (!PROCEDURE_KINDS.includes(input.kind)) return { error: 'Tipo de procedimiento no válido' }
    if (!input.title?.trim()) return { error: 'El título es obligatorio' }
    const { data, error } = await ctx.supabase.rpc('create_procedure', {
      p_project_id: input.projectId, p_title: input.title.trim().slice(0, 200), p_kind: input.kind,
      p_system_id: (input.systemId ?? '') === '' ? undefined : input.systemId!,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const updateProcedure = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (ctx, input: { projectId: string; procedureId: string; title: string; kind: ProcedureKind; systemId?: string | null }): Promise<{ error?: string }> => {
    if (!PROCEDURE_KINDS.includes(input.kind)) return { error: 'Tipo de procedimiento no válido' }
    if (!(await owned(ctx.supabase, 'procedures', input.procedureId, input.projectId))) return { error: 'Procedimiento no encontrado' }
    const { error } = await ctx.supabase.rpc('update_procedure', {
      p_procedure_id: input.procedureId, p_title: input.title.trim().slice(0, 200), p_kind: input.kind, p_system_id: nullable(input.systemId),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `procedures/${input.procedureId}`)
    return {}
  },
)

/** Guarda secciones y pasos de una revisión en borrador (reemplazo completo de los pasos). */
export const saveProcedureRevision = withAuth(
  { guards: projectGuard },
  async (
    ctx,
    input: { projectId: string; procedureId: string; revisionId: string; sections: Partial<Record<ProcedureSection, string>>; steps: StepDraft[]; changeReason?: string },
  ): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedure_revisions', input.revisionId, input.projectId))) return { error: 'Revisión no encontrada' }
    const sections = Object.fromEntries(
      PROCEDURE_SECTIONS.filter(k => typeof input.sections?.[k] === 'string' && input.sections[k]!.trim()).map(k => [k, input.sections[k]!.slice(0, 20000)]),
    )
    const steps = (input.steps ?? []).slice(0, 500).filter(s => s.action?.trim()).map(s => ({
      action: s.action.trim().slice(0, 4000),
      responsible: s.responsible?.trim().slice(0, 200) ?? '',
      expected_value: s.expected_value?.trim().slice(0, 500) ?? '',
      tag_id: s.tag_id ?? null,
      is_hold_point: !!s.is_hold_point,
      hold_capacity: HOLD_CAPACITIES.includes(s.hold_capacity) ? s.hold_capacity : 'operations',
      stop_criteria: s.stop_criteria?.trim().slice(0, 2000) ?? '',
    }))
    const { error } = await ctx.supabase.rpc('save_procedure_revision', {
      p_revision_id: input.revisionId, p_sections: sections as Json, p_steps: steps as Json,
      p_change_reason: input.changeReason?.trim() ? input.changeReason.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `procedures/${input.procedureId}`)
    return {}
  },
)

export const transitionProcedureRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; procedureId: string; revisionId: string; to: 'in_review' | 'draft' | 'approved'; comment?: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedure_revisions', input.revisionId, input.projectId))) return { error: 'Revisión no encontrada' }
    const { error } = await ctx.supabase.rpc('transition_procedure_revision', {
      p_revision_id: input.revisionId, p_to: input.to, p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `procedures/${input.procedureId}`)
    return {}
  },
)

export const fieldVerifyProcedure = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; procedureId: string; revisionId: string; note: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedure_revisions', input.revisionId, input.projectId))) return { error: 'Revisión no encontrada' }
    const { error } = await ctx.supabase.rpc('field_verify_procedure_revision', { p_revision_id: input.revisionId, p_note: input.note.slice(0, 4000) })
    if (error) return { error: error.message }
    revalidate(input.projectId, `procedures/${input.procedureId}`)
    return {}
  },
)

export const newProcedureRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; procedureId: string; reason: string }): Promise<{ id?: string; error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedures', input.procedureId, input.projectId))) return { error: 'Procedimiento no encontrado' }
    const { data, error } = await ctx.supabase.rpc('new_procedure_revision', { p_procedure_id: input.procedureId, p_reason: input.reason.slice(0, 2000) })
    if (error) return { error: error.message }
    revalidate(input.projectId, `procedures/${input.procedureId}`)
    return { id: data as string }
  },
)

/** Copia un procedimiento de otro proyecto de la org (la RPC verifica membresía en el origen). */
export const copyProcedure = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; sourceProcedureId: string }): Promise<{ id?: string; error?: string }> => {
    const { data, error } = await ctx.supabase.rpc('copy_procedure', { p_source_procedure_id: input.sourceProcedureId, p_target_project_id: input.projectId })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const deleteProcedureDraft = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; procedureId: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedures', input.procedureId, input.projectId))) return { error: 'Procedimiento no encontrado' }
    const { error } = await ctx.supabase.rpc('delete_procedure_draft', { p_procedure_id: input.procedureId })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)

// ── Ejecución ───────────────────────────────────────────────────────────
export const startProcedureRun = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (ctx, input: { projectId: string; procedureId: string; systemId?: string | null }): Promise<{ id?: string; error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedures', input.procedureId, input.projectId))) return { error: 'Procedimiento no encontrado' }
    const { data, error } = await ctx.supabase.rpc('start_procedure_run', {
      p_procedure_id: input.procedureId, p_system_id: (input.systemId ?? '') === '' ? undefined : input.systemId!,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `procedures/${input.procedureId}`)
    return { id: data as string }
  },
)

export const completeRunStep = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; stepId: string; actual?: string; comment?: string; na?: boolean }): Promise<{ status?: string; error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedure_runs', input.runId, input.projectId))) return { error: 'Ejecución no encontrada' }
    const { data, error } = await ctx.supabase.rpc('complete_run_step', {
      p_run_id: input.runId, p_step_id: input.stepId,
      p_actual: input.actual?.trim() ? input.actual.trim().slice(0, 500) : undefined,
      p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 2000) : undefined,
      p_na: !!input.na,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return { status: data as string }
  },
)

export const releaseHoldPoint = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; stepId: string; comment?: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedure_runs', input.runId, input.projectId))) return { error: 'Ejecución no encontrada' }
    const { error } = await ctx.supabase.rpc('release_hold_point', {
      p_run_id: input.runId, p_step_id: input.stepId, p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

export const transitionProcedureRun = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; to: 'stopped' | 'in_progress' | 'completed' | 'aborted'; comment?: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'procedure_runs', input.runId, input.projectId))) return { error: 'Ejecución no encontrada' }
    const { error } = await ctx.supabase.rpc('transition_procedure_run', {
      p_run_id: input.runId, p_to: input.to, p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return {}
  },
)

// ── Line-ups ────────────────────────────────────────────────────────────
export const createLineupSheet = withAuth(
  { guards: [...projectGuard, { ...systemGuard, optional: false }] },
  async (
    ctx,
    input: { projectId: string; systemId: string; title: string; purpose: LineupPurpose; procedureId?: string | null; generate: boolean },
  ): Promise<{ id?: string; error?: string }> => {
    if (!LINEUP_PURPOSES.includes(input.purpose)) return { error: 'Propósito no válido' }
    if (!input.title?.trim()) return { error: 'El título es obligatorio' }
    const { data, error } = await ctx.supabase.rpc('create_lineup_sheet', {
      p_project_id: input.projectId, p_system_id: input.systemId, p_title: input.title.trim().slice(0, 200), p_purpose: input.purpose,
      p_procedure_id: (input.procedureId ?? '') === '' ? undefined : input.procedureId!, p_generate: !!input.generate,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export type LineupItemDraft = { tag_id: string | null; label: string; required_position: ValvePosition | null; required_note: string; is_critical: boolean }

export const saveLineupItems = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; sheetId: string; items: LineupItemDraft[] }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'lineup_sheets', input.sheetId, input.projectId))) return { error: 'Hoja no encontrada' }
    const items = (input.items ?? []).slice(0, 1000).map(i => ({
      tag_id: i.tag_id ?? null,
      label: i.label?.trim().slice(0, 200) ?? '',
      required_position: i.required_position && VALVE_POSITIONS.includes(i.required_position) ? i.required_position : null,
      required_note: i.required_note?.trim().slice(0, 500) ?? '',
      is_critical: !!i.is_critical,
    })).filter(i => !!i.tag_id || !!i.label)
    const { error } = await ctx.supabase.rpc('save_lineup_items', { p_sheet_id: input.sheetId, p_items: items as Json })
    if (error) return { error: error.message }
    revalidate(input.projectId, `lineups/${input.sheetId}`)
    return {}
  },
)

export const transitionLineupSheet = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; sheetId: string; to: 'issued' | 'verified' | 'deleted' }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'lineup_sheets', input.sheetId, input.projectId))) return { error: 'Hoja no encontrada' }
    const { error } = input.to === 'issued'
      ? await ctx.supabase.rpc('issue_lineup_sheet', { p_sheet_id: input.sheetId })
      : input.to === 'verified'
        ? await ctx.supabase.rpc('complete_lineup_sheet', { p_sheet_id: input.sheetId })
        : await ctx.supabase.rpc('delete_lineup_sheet_draft', { p_sheet_id: input.sheetId })
    if (error) return { error: error.message }
    revalidate(input.projectId, `lineups/${input.sheetId}`)
    return {}
  },
)

export const setLineupItem = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; sheetId: string; itemId: string; found: ValvePosition; remarks?: string }): Promise<{ error?: string }> => {
    if (!VALVE_POSITIONS.includes(input.found)) return { error: 'Posición no válida' }
    if (!(await owned(ctx.supabase, 'lineup_items', input.itemId, input.projectId))) return { error: 'Fila no encontrada' }
    const { error } = await ctx.supabase.rpc('set_lineup_item', {
      p_item_id: input.itemId, p_found: input.found, p_remarks: input.remarks?.trim() ? input.remarks.trim().slice(0, 1000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `lineups/${input.sheetId}`)
    return {}
  },
)

export const verifyLineupItem = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; sheetId: string; itemId: string }): Promise<{ error?: string }> => {
    if (!(await owned(ctx.supabase, 'lineup_items', input.itemId, input.projectId))) return { error: 'Fila no encontrada' }
    const { error } = await ctx.supabase.rpc('verify_lineup_item', { p_item_id: input.itemId })
    if (error) return { error: error.message }
    revalidate(input.projectId, `lineups/${input.sheetId}`)
    return {}
  },
)
