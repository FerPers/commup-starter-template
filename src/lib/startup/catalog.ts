/**
 * Arranque (fase 6 del plan readiness, sesión 1 — 2026-10-16): procedimientos con hold points y line-ups.
 *
 * Catálogo fijo y lógica pura. La BD (migración 20261017210000) aplica las mismas reglas en las RPC:
 * mantener en sincronía `PROCEDURE_SECTIONS` con `procedure_section_keys()`. Quién libera / atestigua / firma lo
 * decide la capacidad del proyecto (S14, `src/lib/constants/capacities.ts` = SQL `has_capacity`). Tests en catalog.test.ts.
 */

import { CAPACITY_FALLBACK_ROLES, can, type MyCapacities } from '@/lib/constants/capacities'

/** Las 15 secciones del procedimiento (6.13 / 17.4.2), en orden. `sequence` se completa con la tabla de pasos. */
export const PROCEDURE_SECTIONS = [
  'purpose', 'scope', 'references', 'definitions', 'responsibilities', 'safety', 'prerequisites', 'isolations',
  'equipment', 'initial_lineup', 'sequence', 'stop_criteria', 'acceptance', 'reinstatement', 'records',
] as const
export type ProcedureSection = (typeof PROCEDURE_SECTIONS)[number]

export const PROCEDURE_KINDS = ['precommissioning', 'commissioning', 'startup', 'shutdown', 'emergency', 'normal_operation'] as const
export type ProcedureKind = (typeof PROCEDURE_KINDS)[number]

export type RevisionStatus = 'draft' | 'in_review' | 'approved' | 'superseded'
export type RunStatus = 'in_progress' | 'at_hold' | 'stopped' | 'completed' | 'aborted'
export type RunStepStatus = 'pending' | 'done' | 'at_hold' | 'released' | 'na'

export const HOLD_CAPACITIES = ['commissioning', 'operations', 'hse'] as const
export type HoldCapacity = (typeof HOLD_CAPACITIES)[number]

/** Roles de respaldo por capacidad cuando el proyecto no tiene designados (= SQL hold_release_roles / capacity_fallback_roles). */
export const HOLD_RELEASE_ROLES: Record<HoldCapacity, readonly string[]> = {
  commissioning: CAPACITY_FALLBACK_ROLES.commissioning,
  operations: CAPACITY_FALLBACK_ROLES.operations,
  hse: CAPACITY_FALLBACK_ROLES.hse,
}

/** S14 (D14): libera quien tiene la capacidad en el proyecto (designado o respaldo) y no ejecutó el paso. */
export function canReleaseHold(caps: MyCapacities, capacity: HoldCapacity, userId: string, doneBy: string | null): boolean {
  return can(caps, capacity) && userId !== doneBy
}

export type StepDraft = {
  action: string
  responsible: string
  expected_value: string
  tag_id: string | null
  tag_number?: string | null
  is_hold_point: boolean
  hold_capacity: HoldCapacity
  stop_criteria: string
}

export function emptyStep(): StepDraft {
  return { action: '', responsible: '', expected_value: '', tag_id: null, tag_number: null, is_hold_point: false, hold_capacity: 'operations', stop_criteria: '' }
}

/** Siguiente paso ejecutable (el primero pendiente cuyos anteriores están cerrados), o null. */
export function nextRunStep<T extends { ord: number; status: RunStepStatus }>(steps: T[]): T | null {
  const sorted = [...steps].sort((a, b) => a.ord - b.ord)
  for (const s of sorted) {
    if (s.status === 'pending') return s
    if (s.status === 'at_hold') return null
  }
  return null
}

const CLOSED: RunStepStatus[] = ['done', 'released', 'na']
export function runProgress(steps: { status: RunStepStatus }[]): { closed: number; total: number } {
  return { closed: steps.filter(s => CLOSED.includes(s.status)).length, total: steps.length }
}

// ── Line-ups ────────────────────────────────────────────────────────────
export const VALVE_POSITIONS = ['open', 'closed', 'locked_open', 'locked_closed', 'auto', 'manual', 'throttled', 'other'] as const
export type ValvePosition = (typeof VALVE_POSITIONS)[number]
export type LineupStatus = 'draft' | 'issued' | 'in_progress' | 'verified' | 'superseded'
export const LINEUP_PURPOSES = ['startup', 'test', 'other'] as const
export type LineupPurpose = (typeof LINEUP_PURPOSES)[number]

export type LineupItemState = {
  required_position: ValvePosition | null
  found_position: ValvePosition | null
  is_critical: boolean
  set_at: string | null
  verified_at: string | null
}

/** Estado de una fila: pendiente · desalineada · alineada · por verificar (crítica) · verificada. */
export function lineupItemState(i: LineupItemState): 'pending' | 'misaligned' | 'aligned' | 'to_verify' | 'verified' {
  if (!i.set_at || !i.found_position) return 'pending'
  if (i.found_position !== i.required_position) return 'misaligned'
  if (i.verified_at) return 'verified'
  return i.is_critical ? 'to_verify' : 'aligned'
}

export function lineupProgress(items: LineupItemState[]) {
  const states = items.map(lineupItemState)
  const done = states.filter(s => s === 'aligned' || s === 'verified').length
  return {
    total: items.length,
    done,
    misaligned: states.filter(s => s === 'misaligned').length,
    toVerify: states.filter(s => s === 'to_verify').length,
    pending: states.filter(s => s === 'pending').length,
    complete: items.length > 0 && done === items.length,
  }
}

// ── Bitácora de arranque (sesión 2) ─────────────────────────────────────
/** Hitos por sistema (17.27 / 17.33), en orden; uno vigente por sistema (índice parcial en SQL). */
export const MILESTONES = [
  'first_energization', 'first_rotation', 'first_startup', 'first_hydrocarbon', 'first_stable_operation', 'first_on_spec_product',
] as const
export type Milestone = (typeof MILESTONES)[number]
export const EVENT_CATEGORIES = ['trip', 'alarm', 'deviation', 'shutdown', 'observation'] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]
export type StartupEventStatus = 'pending_witness' | 'witnessed' | 'recorded' | 'voided'

/** Hitos con bloqueo duro: gate de arranque aprobado con todas sus firmas + PSSR aprobado (§12.12). */
export const GATED_MILESTONES: readonly Milestone[] = ['first_startup', 'first_hydrocarbon']

/** Capacidad del testigo (= SQL milestone_witness_capacity). */
export function milestoneCapacity(m: Milestone): HoldCapacity {
  return m === 'first_energization' || m === 'first_rotation' ? 'commissioning' : 'operations'
}

export function canWitness(caps: MyCapacities, m: Milestone, userId: string, recordedBy: string | null): boolean {
  return canReleaseHold(caps, milestoneCapacity(m), userId, recordedBy)
}

/** Ventana del gráfico alrededor del evento: −30/+30 min. */
export function chartWindow(occurredAt: string, minutes = 30): { from: string; to: string } {
  const t = Date.parse(occurredAt)
  return { from: new Date(t - minutes * 60_000).toISOString(), to: new Date(t + minutes * 60_000).toISOString() }
}

// ── Readiness de operaciones y propiedad del sistema (sesión 3) ─────────
export const OWNERSHIP_STAGES = ['commissioning', 'shadowing', 'joint_operation', 'operations'] as const
export type OwnershipStage = (typeof OWNERSHIP_STAGES)[number]
export const COMPETENCY_LEVELS = [0, 1, 2, 3, 4] as const
export const EVIDENCE_KINDS = ['course', 'ojt', 'assessment', 'other'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]
export const SPARE_STATUSES = ['available', 'ordered', 'not_available'] as const
export type SpareStatus = (typeof SPARE_STATUSES)[number]

export function nextStage(s: OwnershipStage): OwnershipStage | null {
  const i = OWNERSHIP_STAGES.indexOf(s)
  return i >= 0 && i < OWNERSHIP_STAGES.length - 1 ? OWNERSHIP_STAGES[i + 1] : null
}
export function previousStages(s: OwnershipStage): OwnershipStage[] {
  return OWNERSHIP_STAGES.slice(0, OWNERSHIP_STAGES.indexOf(s))
}

/** Nivel vigente (= SQL person_system_level): última evaluación; vencida = 0; sin registros = 0. */
export function currentLevel(records: { level: number; assessed_at: string; created_at: string; expires_at: string | null }[], today: string): number {
  const last = [...records].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at) || b.created_at.localeCompare(a.created_at))[0]
  if (!last) return 0
  return last.expires_at && last.expires_at < today ? 0 : last.level
}

export type ChecklistItem = { key: string; ok: boolean; detail: Record<string, unknown> }
/** Las firmas que el usuario puede aportar a un traspaso pendiente (= reglas de sign_ownership_transfer). */
export function signableCapacities(
  caps: MyCapacities, userId: string, t: { commissioning_signed_by: string | null; operations_signed_by: string | null },
): ('commissioning' | 'operations')[] {
  if (userId === t.commissioning_signed_by || userId === t.operations_signed_by) return []
  const out: ('commissioning' | 'operations')[] = []
  if (!t.commissioning_signed_by && can(caps, 'commissioning')) out.push('commissioning')
  if (!t.operations_signed_by && can(caps, 'operations')) out.push('operations')
  return out
}
