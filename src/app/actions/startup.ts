'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { withAuth } from '@/lib/auth/withAuth'
import type { Json } from '@/types/supabase.generated'
import type { LineupRemote } from '@/lib/sync/startup-outbox-utils'
import {
  DEFAULT_HOLD_CAPACITY, HOLD_CAPACITIES, LINEUP_PURPOSES, PROCEDURE_KINDS, PROCEDURE_SECTIONS, VALVE_POSITIONS,
  type LineupPurpose, type ProcedureKind, type ProcedureSection, type StepDraft, type ValvePosition,
} from '@/lib/startup/catalog'
import { sqlArg } from '@/lib/supabase/casts'

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
  revalidatePath('/projects/[id]', 'layout')
}

async function owned(db: SupabaseClient<Database>, table: 'procedures' | 'procedure_revisions' | 'procedure_runs' | 'lineup_sheets' | 'lineup_items', id: string, projectId: string) {
  const { data } = await db.from(table).select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  return !!data
}

const nullable = (v: string | null | undefined) => sqlArg<string>(((v ?? '') === '' ? null : v))

/** Hora de captura offline (ISO) → parámetro p_captured_at; la RPC la acota a [límite lógico, now()]. */
const capturedParam = (iso: string | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? iso : undefined)

// ── Procedimientos ──────────────────────────────────────────────────────
export const createProcedure = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (ctx, input: { projectId: string; title: string; kind: ProcedureKind; systemId?: string | null }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!PROCEDURE_KINDS.includes(input.kind)) return { error: t('startup.procedureKindInvalid') }
    if (!input.title?.trim()) return { error: t('startup.titleRequired') }
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
    const t = await getTranslations('ActionErrors')
    if (!PROCEDURE_KINDS.includes(input.kind)) return { error: t('startup.procedureKindInvalid') }
    if (!(await owned(ctx.supabase, 'procedures', input.procedureId, input.projectId))) return { error: t('startup.procedureNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedure_revisions', input.revisionId, input.projectId))) return { error: t('startup.revisionNotFound') }
    const sections = Object.fromEntries(
      PROCEDURE_SECTIONS.filter(k => typeof input.sections?.[k] === 'string' && input.sections[k]!.trim()).map(k => [k, input.sections[k]!.slice(0, 20000)]),
    )
    const steps = (input.steps ?? []).slice(0, 500).filter(s => s.action?.trim()).map(s => ({
      action: s.action.trim().slice(0, 4000),
      responsible: s.responsible?.trim().slice(0, 200) ?? '',
      expected_value: s.expected_value?.trim().slice(0, 500) ?? '',
      tag_id: s.tag_id ?? null,
      is_hold_point: !!s.is_hold_point,
      hold_capacity: HOLD_CAPACITIES.includes(s.hold_capacity) ? s.hold_capacity : DEFAULT_HOLD_CAPACITY,
      stop_criteria: s.stop_criteria?.trim().slice(0, 2000) ?? '',
      expected_min: s.expected_min?.trim().slice(0, 30) ?? '',
      expected_max: s.expected_max?.trim().slice(0, 30) ?? '',
      expected_unit: s.expected_unit?.trim().slice(0, 30) ?? '',
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
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedure_revisions', input.revisionId, input.projectId))) return { error: t('startup.revisionNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedure_revisions', input.revisionId, input.projectId))) return { error: t('startup.revisionNotFound') }
    const { error } = await ctx.supabase.rpc('field_verify_procedure_revision', { p_revision_id: input.revisionId, p_note: input.note.slice(0, 4000) })
    if (error) return { error: error.message }
    revalidate(input.projectId, `procedures/${input.procedureId}`)
    return {}
  },
)

export const newProcedureRevision = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; procedureId: string; reason: string }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedures', input.procedureId, input.projectId))) return { error: t('startup.procedureNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedures', input.procedureId, input.projectId))) return { error: t('startup.procedureNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedures', input.procedureId, input.projectId))) return { error: t('startup.procedureNotFound') }
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
  async (ctx, input: { projectId: string; runId: string; stepId: string; actual?: string; comment?: string; na?: boolean; capturedAt?: string }): Promise<{ status?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedure_runs', input.runId, input.projectId))) return { error: t('startup.runNotFound') }
    const { data, error } = await ctx.supabase.rpc('complete_run_step', {
      p_run_id: input.runId, p_step_id: input.stepId,
      p_actual: input.actual?.trim() ? input.actual.trim().slice(0, 500) : undefined,
      p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 2000) : undefined,
      p_na: !!input.na, p_captured_at: capturedParam(input.capturedAt),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, `runs/${input.runId}`)
    return { status: data as string }
  },
)

export const releaseHoldPoint = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; runId: string; stepId: string; comment?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedure_runs', input.runId, input.projectId))) return { error: t('startup.runNotFound') }
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
  async (ctx, input: { projectId: string; runId: string; to: 'stopped' | 'in_progress' | 'completed' | 'aborted'; comment?: string; capturedAt?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'procedure_runs', input.runId, input.projectId))) return { error: t('startup.runNotFound') }
    const { error } = await ctx.supabase.rpc('transition_procedure_run', {
      p_run_id: input.runId, p_to: input.to, p_comment: input.comment?.trim() ? input.comment.trim().slice(0, 2000) : undefined,
      p_captured_at: input.to === 'stopped' ? capturedParam(input.capturedAt) : undefined,
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
    const t = await getTranslations('ActionErrors')
    if (!LINEUP_PURPOSES.includes(input.purpose)) return { error: t('startup.purposeInvalid') }
    if (!input.title?.trim()) return { error: t('startup.titleRequired') }
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
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'lineup_sheets', input.sheetId, input.projectId))) return { error: t('startup.sheetNotFound') }
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
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'lineup_sheets', input.sheetId, input.projectId))) return { error: t('startup.sheetNotFound') }
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

/**
 * Fija la posición encontrada. Desde el replay offline llega con `capturedAt` y compare-and-set (`check` +
 * set_at/verified_at que vio el dispositivo): si la fila cambió en el servidor devuelve `conflict` con su
 * estado actual; si ya tenía la misma posición, `status: 'redundant'` (no se toca la verificación).
 */
export const setLineupItem = withAuth(
  { guards: projectGuard },
  async (
    ctx,
    input: {
      projectId: string; sheetId: string; itemId: string; found: ValvePosition; remarks?: string
      /** S25b (E-21): como se encontró (opcional), candado y sello (uno obligatorio si queda LO/LC). */
      asFound?: ValvePosition | null; lockNumber?: string | null; sealNumber?: string | null
      capturedAt?: string; check?: boolean; expectedSetAt?: string | null; expectedVerifiedAt?: string | null
    },
  ): Promise<{ status?: 'applied' | 'redundant'; error?: string; conflict?: LineupRemote }> => {
    const t = await getTranslations('ActionErrors')
    if (!VALVE_POSITIONS.includes(input.found)) return { error: t('startup.positionInvalid') }
    if (input.asFound && !VALVE_POSITIONS.includes(input.asFound)) return { error: t('startup.asFoundInvalid') }
    if (!(await owned(ctx.supabase, 'lineup_items', input.itemId, input.projectId))) return { error: t('startup.itemNotFound') }
    const { data, error } = await ctx.supabase.rpc('set_lineup_item', {
      p_item_id: input.itemId, p_found: input.found, p_remarks: input.remarks?.trim() ? input.remarks.trim().slice(0, 1000) : undefined,
      p_captured_at: capturedParam(input.capturedAt), p_check_expected: !!input.check,
      p_expected_set_at: input.expectedSetAt ?? undefined, p_expected_verified_at: input.expectedVerifiedAt ?? undefined,
      p_as_found: input.asFound ?? undefined, p_lock_number: input.lockNumber?.trim() ? input.lockNumber.trim().slice(0, 60) : undefined,
      p_seal_number: input.sealNumber?.trim() ? input.sealNumber.trim().slice(0, 60) : undefined,
    })
    if (error) {
      if (error.code !== 'CU409') return { error: error.message }
      const { data: row } = await ctx.supabase.from('lineup_items')
        .select('found_position, set_by, set_at, verified_by, verified_at').eq('id', input.itemId).maybeSingle()
      return {
        error: error.message,
        conflict: {
          found: (row?.found_position ?? null) as ValvePosition | null, setBy: row?.set_by ?? null, setAt: row?.set_at ?? null,
          verifiedBy: row?.verified_by ?? null, verifiedAt: row?.verified_at ?? null,
        },
      }
    }
    revalidate(input.projectId, `lineups/${input.sheetId}`)
    return { status: data === 'redundant' ? 'redundant' : 'applied' }
  },
)

export const verifyLineupItem = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; sheetId: string; itemId: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await owned(ctx.supabase, 'lineup_items', input.itemId, input.projectId))) return { error: t('startup.itemNotFound') }
    const { error } = await ctx.supabase.rpc('verify_lineup_item', { p_item_id: input.itemId })
    if (error) return { error: error.message }
    revalidate(input.projectId, `lineups/${input.sheetId}`)
    return {}
  },
)
