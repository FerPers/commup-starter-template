/**
 * Arranque (fase 6 del plan readiness, sesión 1 — 2026-10-16): procedimientos con hold points y line-ups.
 *
 * Catálogo fijo y lógica pura. La BD (migración 20261017210000) aplica las mismas reglas en las RPC:
 * mantener en sincronía `PROCEDURE_SECTIONS` con `procedure_section_keys()` y `HOLD_RELEASE_ROLES` con
 * `hold_release_roles()`. Tests en catalog.test.ts.
 */

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

/** Roles que liberan un hold point por capacidad (Operaciones/HSE incluyen al cliente = operadora). */
export const HOLD_RELEASE_ROLES: Record<HoldCapacity, readonly string[]> = {
  commissioning: ['owner', 'admin', 'architect', 'leader'],
  operations: ['owner', 'admin', 'architect', 'leader', 'client'],
  hse: ['owner', 'admin', 'architect', 'leader', 'client'],
}

export function canReleaseHold(role: string, capacity: HoldCapacity, userId: string, doneBy: string | null): boolean {
  return HOLD_RELEASE_ROLES[capacity].includes(role) && userId !== doneBy
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

export function canWitness(role: string, m: Milestone, userId: string, recordedBy: string | null): boolean {
  return canReleaseHold(role, milestoneCapacity(m), userId, recordedBy)
}

/** Ventana del gráfico alrededor del evento: −30/+30 min. */
export function chartWindow(occurredAt: string, minutes = 30): { from: string; to: string } {
  const t = Date.parse(occurredAt)
  return { from: new Date(t - minutes * 60_000).toISOString(), to: new Date(t + minutes * 60_000).toISOString() }
}
