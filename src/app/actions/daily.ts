'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { withAuth } from '@/lib/auth/withAuth'
import {
  ACTION_PRIORITIES,
  ACTION_SOURCES,
  DECISION_SOURCES,
  ESCALATION_LEVELS,
  IMPACT_KINDS,
  EVIDENCE_KINDS,
  TQ_ADDRESSEES,
  VERIFICATION_METHODS,
  type ActionPriority,
  type EvidenceKind,
  type ActionSource,
  type ActionStatus,
  type ConstraintStatus,
  type DecisionSource,
  type ImpactKind,
  type MgmtKind,
  type TqAddressee,
  type TqStatus,
  type VerificationMethod,
} from '@/lib/daily/catalog'
import { sqlArg } from '@/lib/supabase/casts'

type T = Awaited<ReturnType<typeof getTranslations<'ActionErrors'>>>

// Gestión diaria (fase 5 plan readiness, sesión 1). Toda escritura pasa por RPC SECURITY DEFINER
// (migración 20261017120000), que aplica rol, ciclo de vida, «otra persona» y pertenencia de los ids.
// Aquí: guards del wrapper, validación de enums y revalidación de rutas.

const projectGuard = [{ resource: 'project' as const, field: 'projectId' }]
const systemGuard = { resource: 'system' as const, field: 'systemId', scopeField: 'projectId', optional: true }

// Los tipos generados no admiten null en parámetros de RPC sin DEFAULT, aunque SQL sí (null = quitar).
const nullable = (v: string | null | undefined) => sqlArg<string>(((v ?? '') === '' ? null : v))
/** '' / null → undefined (parámetro con DEFAULT en la RPC). */
const opt = <T extends string>(v: T | null | undefined) => ((v ?? '') === '' ? undefined : (v as T))
const text = (v: string | null | undefined, max: number) => (v ?? '').trim().slice(0, max)

const TABLE: Record<MgmtKind, 'actions' | 'project_constraints' | 'technical_queries' | 'decisions'> = {
  action: 'actions', constraint: 'project_constraints', tq: 'technical_queries', decision: 'decisions',
}

function revalidate(projectId: string, kind?: MgmtKind, id?: string) {
  revalidatePath(`/projects/${projectId}/daily`)
  if (kind && id) revalidatePath(`/projects/${projectId}/daily/${kind}/${id}`)
  revalidatePath('/my-work')
  revalidatePath('/projects/[id]', 'layout')
}

/** El registro existe y es del proyecto indicado (RLS ya limita a la org del usuario). */
async function belongs(db: SupabaseClient<Database>, kind: MgmtKind, id: string, projectId: string): Promise<boolean> {
  const { data } = await db.from(TABLE[kind]).select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  return !!data
}

// ── Acciones ────────────────────────────────────────────────────────────
type ActionInput = {
  projectId: string
  title: string
  ownerId: string
  description?: string
  systemId?: string | null
  dueDate?: string | null
  priority: ActionPriority
  verificationMethod: VerificationMethod
  sourceRef?: string
}

function badAction(input: Pick<ActionInput, 'priority' | 'verificationMethod' | 'title' | 'ownerId'>, t: T): string | null {
  if (!ACTION_PRIORITIES.includes(input.priority)) return t('daily.invalidPriority')
  if (!VERIFICATION_METHODS.includes(input.verificationMethod)) return t('daily.invalidVerificationMethod')
  if (!input.title?.trim()) return t('daily.titleRequired')
  if (!input.ownerId) return t('daily.ownerRequired')
  return null
}

export const createAction = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (ctx, input: ActionInput & { sourceKind?: ActionSource; sourceId?: string | null }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const bad = badAction(input, t)
    if (bad) return { error: bad }
    const sourceKind = input.sourceKind ?? 'manual'
    // S23 (D-12): las acciones de origen «gate» las crea la BD al aprobar un gate con condiciones.
    if (!ACTION_SOURCES.includes(sourceKind) || sourceKind === 'gate') return { error: t('daily.invalidSource') }
    const { data, error } = await ctx.supabase.rpc('create_action', {
      p_project_id: input.projectId,
      p_title: text(input.title, 200),
      p_owner_id: input.ownerId,
      p_description: opt(text(input.description, 4000)),
      p_source_kind: sourceKind,
      p_source_id: opt(input.sourceId),
      p_source_ref: opt(text(input.sourceRef, 200)),
      p_system_id: opt(input.systemId),
      p_due_date: opt(input.dueDate),
      p_priority: input.priority,
      p_verification_method: input.verificationMethod,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    if (input.sourceId && (sourceKind === 'constraint' || sourceKind === 'tq')) {
      revalidatePath(`/projects/${input.projectId}/daily/${sourceKind}/${input.sourceId}`)
    }
    return { id: data as string }
  },
)

export const updateAction = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (ctx, input: ActionInput & { actionId: string; reason?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const bad = badAction(input, t)
    if (bad) return { error: bad }
    if (!(await belongs(ctx.supabase, 'action', input.actionId, input.projectId))) return { error: t('daily.actionNotFound') }
    const { error } = await ctx.supabase.rpc('update_action', {
      p_action_id: input.actionId,
      p_title: text(input.title, 200),
      p_description: nullable(text(input.description, 4000)),
      p_owner_id: input.ownerId,
      p_system_id: nullable(input.systemId),
      p_due_date: nullable(input.dueDate),
      p_priority: input.priority,
      p_verification_method: input.verificationMethod,
      p_source_ref: opt(text(input.sourceRef, 200)),
      p_reason: opt(text(input.reason, 2000)),  // S11 (D-15): replanificar exige motivo
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, 'action', input.actionId)
    return {}
  },
)

export const transitionAction = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; actionId: string; to: ActionStatus; comment?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await belongs(ctx.supabase, 'action', input.actionId, input.projectId))) return { error: t('daily.actionNotFound') }
    const { error } = await ctx.supabase.rpc('transition_action', {
      p_action_id: input.actionId, p_to: input.to, p_comment: opt(text(input.comment, 2000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, 'action', input.actionId)
    return {}
  },
)

// ── Restricciones ───────────────────────────────────────────────────────
type ConstraintInput = {
  projectId: string
  title: string
  description: string
  systemId: string
  ownerId: string
  needDate: string
  impactKind: ImpactKind
  impact?: string
  gateId?: string | null
  recoveryPlan?: string
}

function badConstraint(input: ConstraintInput, t: T): string | null {
  if (!IMPACT_KINDS.includes(input.impactKind)) return t('daily.invalidImpactKind')
  if (!input.title?.trim() || !input.description?.trim()) return t('daily.constraintFieldsRequired')
  if (!input.systemId || !input.ownerId || !input.needDate) return t('daily.constraintScopeRequired')
  return null
}

export const createConstraint = withAuth(
  { guards: [...projectGuard, { ...systemGuard, optional: false }] },
  async (ctx, input: ConstraintInput & { level?: number }): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const bad = badConstraint(input, t)
    if (bad) return { error: bad }
    const level = input.level ?? 1
    if (!ESCALATION_LEVELS.includes(level as 1)) return { error: t('daily.invalidEscalationLevel') }
    const { data, error } = await ctx.supabase.rpc('create_constraint', {
      p_project_id: input.projectId,
      p_title: text(input.title, 200),
      p_description: text(input.description, 4000),
      p_system_id: input.systemId,
      p_owner_id: input.ownerId,
      p_need_date: input.needDate,
      p_impact_kind: input.impactKind,
      p_impact: opt(text(input.impact, 4000)),
      p_gate_id: opt(input.gateId),
      p_recovery_plan: opt(text(input.recoveryPlan, 4000)),
      p_level: level,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const updateConstraint = withAuth(
  { guards: [...projectGuard, { ...systemGuard, optional: false }] },
  async (ctx, input: ConstraintInput & { constraintId: string; reason?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const bad = badConstraint(input, t)
    if (bad) return { error: bad }
    if (!(await belongs(ctx.supabase, 'constraint', input.constraintId, input.projectId))) return { error: t('daily.constraintNotFound') }
    const { error } = await ctx.supabase.rpc('update_constraint', {
      p_constraint_id: input.constraintId,
      p_title: text(input.title, 200),
      p_description: text(input.description, 4000),
      p_system_id: input.systemId,
      p_gate_id: nullable(input.gateId),
      p_owner_id: input.ownerId,
      p_need_date: input.needDate,
      p_impact_kind: input.impactKind,
      p_impact: nullable(text(input.impact, 4000)),
      p_recovery_plan: nullable(text(input.recoveryPlan, 4000)),
      p_reason: opt(text(input.reason, 2000)),  // S11 (D-14): mover de gate/sistema o cambiar la fecha exige motivo
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, 'constraint', input.constraintId)
    return {}
  },
)

export const escalateConstraint = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; constraintId: string; level: number; reason: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!ESCALATION_LEVELS.includes(input.level as 1)) return { error: t('daily.invalidEscalationLevel') }
    if (!(await belongs(ctx.supabase, 'constraint', input.constraintId, input.projectId))) return { error: t('daily.constraintNotFound') }
    const { error } = await ctx.supabase.rpc('escalate_constraint', {
      p_constraint_id: input.constraintId, p_level: input.level, p_reason: text(input.reason, 2000),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, 'constraint', input.constraintId)
    return {}
  },
)

export const transitionConstraint = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; constraintId: string; to: ConstraintStatus; comment?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await belongs(ctx.supabase, 'constraint', input.constraintId, input.projectId))) return { error: t('daily.constraintNotFound') }
    const { error } = await ctx.supabase.rpc('transition_constraint', {
      p_constraint_id: input.constraintId, p_to: input.to, p_comment: opt(text(input.comment, 2000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, 'constraint', input.constraintId)
    return {}
  },
)

// ── TQ ──────────────────────────────────────────────────────────────────
type TqInput = {
  projectId: string
  subject: string
  question: string
  addressedTo: TqAddressee
  addressedToName?: string
  disciplineId?: string | null
  systemId?: string | null
  requiredBy?: string | null
  tagIds?: string[]
}

function badTq(input: TqInput, t: T): string | null {
  if (!TQ_ADDRESSEES.includes(input.addressedTo)) return t('daily.invalidAddressee')
  if (!input.subject?.trim() || !input.question?.trim()) return t('daily.tqFieldsRequired')
  return null
}

// tagIds es una lista: el guard de tag solo admite un id; tq_set_tags valida que sean del proyecto.
const tqGuards = [
  ...projectGuard,
  systemGuard,
  { resource: 'discipline' as const, field: 'disciplineId', optional: true },
]

export const createTq = withAuth(
  { guards: tqGuards },
  async (ctx, input: TqInput): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const bad = badTq(input, t)
    if (bad) return { error: bad }
    const { data, error } = await ctx.supabase.rpc('create_tq', {
      p_project_id: input.projectId,
      p_subject: text(input.subject, 200),
      p_question: text(input.question, 8000),
      p_addressed_to: input.addressedTo,
      p_addressed_to_name: opt(text(input.addressedToName, 200)),
      p_discipline_id: opt(input.disciplineId),
      p_system_id: opt(input.systemId),
      p_required_by: opt(input.requiredBy),
      p_tag_ids: (input.tagIds ?? []).slice(0, 500),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return { id: data as string }
  },
)

export const updateTq = withAuth(
  { guards: tqGuards },
  async (ctx, input: TqInput & { tqId: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const bad = badTq(input, t)
    if (bad) return { error: bad }
    if (!(await belongs(ctx.supabase, 'tq', input.tqId, input.projectId))) return { error: t('daily.tqNotFound') }
    const { error } = await ctx.supabase.rpc('update_tq', {
      p_tq_id: input.tqId,
      p_subject: text(input.subject, 200),
      p_question: text(input.question, 8000),
      p_addressed_to: input.addressedTo,
      p_addressed_to_name: nullable(text(input.addressedToName, 200)),
      p_discipline_id: nullable(input.disciplineId),
      p_system_id: nullable(input.systemId),
      p_required_by: nullable(input.requiredBy),
      p_tag_ids: input.tagIds ? input.tagIds.slice(0, 500) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, 'tq', input.tqId)
    return {}
  },
)

export const answerTq = withAuth(
  { guards: projectGuard },
  async (
    ctx,
    input: { projectId: string; tqId: string; response: string; respondedByName?: string; designChange?: boolean; mocRef?: string },
  ): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!input.response?.trim()) return { error: t('daily.responseRequired') }
    if (!(await belongs(ctx.supabase, 'tq', input.tqId, input.projectId))) return { error: t('daily.tqNotFound') }
    const { error } = await ctx.supabase.rpc('answer_tq', {
      p_tq_id: input.tqId,
      p_response: text(input.response, 8000),
      p_responded_by_name: opt(text(input.respondedByName, 200)),
      p_design_change: !!input.designChange,
      p_moc_ref: opt(text(input.mocRef, 100)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, 'tq', input.tqId)
    return {}
  },
)

export const transitionTq = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; tqId: string; to: TqStatus; comment?: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!(await belongs(ctx.supabase, 'tq', input.tqId, input.projectId))) return { error: t('daily.tqNotFound') }
    const { error } = await ctx.supabase.rpc('transition_tq', {
      p_tq_id: input.tqId, p_to: input.to, p_comment: opt(text(input.comment, 2000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, 'tq', input.tqId)
    return {}
  },
)

// ── Decisiones ──────────────────────────────────────────────────────────
export const recordDecision = withAuth(
  { guards: [...projectGuard, systemGuard] },
  async (
    ctx,
    input: {
      projectId: string
      title: string
      decision: string
      context?: string
      rationale?: string
      decidedBy?: string | null
      attendees?: string
      decidedAt?: string | null
      sourceKind?: DecisionSource
      sourceId?: string | null
      sourceRef?: string
      systemId?: string | null
      supersedesId?: string | null
      supersedeReason?: string
    },
  ): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const sourceKind = input.sourceKind ?? 'other'
    if (!DECISION_SOURCES.includes(sourceKind)) return { error: t('daily.invalidSource') }
    if (!input.title?.trim() || !input.decision?.trim()) return { error: t('daily.decisionFieldsRequired') }
    if (input.supersedesId && !(await belongs(ctx.supabase, 'decision', input.supersedesId, input.projectId))) {
      return { error: t('daily.supersededNotFound') }
    }
    const { data, error } = await ctx.supabase.rpc('record_decision', {
      p_project_id: input.projectId,
      p_title: text(input.title, 200),
      p_decision: text(input.decision, 8000),
      p_context: opt(text(input.context, 8000)),
      p_rationale: opt(text(input.rationale, 8000)),
      p_decided_by: opt(input.decidedBy),
      p_attendees: opt(text(input.attendees, 2000)),
      p_decided_at: opt(input.decidedAt),
      p_source_kind: sourceKind,
      p_source_id: opt(input.sourceId),
      p_source_ref: opt(text(input.sourceRef, 200)),
      p_system_id: opt(input.systemId),
      p_supersedes_id: opt(input.supersedesId),
      p_supersede_reason: opt(text(input.supersedeReason, 2000)),
    })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    if (input.supersedesId) revalidatePath(`/projects/${input.projectId}/daily/decision/${input.supersedesId}`)
    if (input.sourceId && sourceKind !== 'meeting' && sourceKind !== 'other') {
      revalidatePath(`/projects/${input.projectId}/daily/${sourceKind}/${input.sourceId}`)
    }
    return { id: data as string }
  },
)

// ── Evidencia y borrado ─────────────────────────────────────────────────
/** Registra un archivo que el navegador ya subió a mgmt-evidence (<project>/<kind>/<entity>/…). */
export const addMgmtAttachment = withAuth(
  { guards: projectGuard },
  async (
    ctx,
    input: { projectId: string; kind: EvidenceKind; entityId: string; filePath: string; fileName: string; mimeType?: string; sizeBytes?: number },
  ): Promise<{ id?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!EVIDENCE_KINDS.includes(input.kind)) return { error: t('daily.invalidKind') }
    if (!input.filePath.startsWith(`${input.projectId}/${input.kind}/${input.entityId}/`)) return { error: t('daily.invalidEvidencePath') }
    const { data, error } = await ctx.supabase.rpc('add_mgmt_attachment', {
      p_entity_kind: input.kind,
      p_entity_id: input.entityId,
      p_file_path: input.filePath,
      p_file_name: text(input.fileName, 255),
      p_mime_type: opt(input.mimeType?.slice(0, 100)),
      p_size_bytes: input.sizeBytes ?? undefined,
    })
    if (error) return { error: error.message }
    if (input.kind === 'vendor_report' || input.kind === 'vendor_activity') revalidatePath(`/projects/${input.projectId}/vendors`, 'layout')
    else revalidate(input.projectId, input.kind, input.entityId)
    return { id: data as string }
  },
)

/** URL firmada (5 min) de una evidencia del proyecto. */
export const getMgmtEvidenceUrl = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; path: string }): Promise<{ url?: string; error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!input.path.startsWith(`${input.projectId}/`)) return { error: t('daily.invalidEvidencePath') }
    const { data, error } = await ctx.supabase.storage.from('mgmt-evidence').createSignedUrl(input.path, 300)
    if (error || !data) return { error: error?.message ?? t('daily.fileOpenFailed') }
    return { url: data.signedUrl }
  },
)

export const deleteMgmtItem = withAuth(
  { guards: projectGuard },
  async (ctx, input: { projectId: string; kind: Exclude<MgmtKind, 'decision'>; entityId: string }): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    if (!['action', 'constraint', 'tq'].includes(input.kind)) return { error: t('daily.notDeletable') }
    if (!(await belongs(ctx.supabase, input.kind, input.entityId, input.projectId))) return { error: t('daily.recordNotFound') }
    const { error } = await ctx.supabase.rpc('delete_mgmt_item', { p_entity_kind: input.kind, p_entity_id: input.entityId })
    if (error) return { error: error.message }
    revalidate(input.projectId)
    return {}
  },
)
