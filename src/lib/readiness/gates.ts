/**
 * Motor de gates (fase 1 del plan readiness, 2026-10-12) — tipos y helpers puros.
 *
 * El cálculo vive en SQL (`compute_system_gates` / `compute_project_gates`, migración
 * 20261012180000); aquí solo se tipan sus resultados y se decide cómo mostrarlos.
 */

export type GateStatus =
  | 'approved'
  | 'approved_with_conditions'
  | 'regressed'
  | 'ready'
  | 'ready_with_conditions'
  | 'not_ready'

export type GateLevel = 'green' | 'yellow' | 'red'
export type CriterionResult = 'pass' | 'warn' | 'fail'
export type CriterionKind =
  | 'previous_gate'
  | 'itr_phase_approved'
  | 'certificates_issued'
  | 'pssr_approved'
  | 'critical_tags_ready'
  | 'manual_attestation'

/** Criterios configurables por la org (previous_gate es implícito por `requires_previous`). */
export const CONFIGURABLE_CRITERIA: Exclude<CriterionKind, 'previous_gate'>[] = [
  'itr_phase_approved',
  'certificates_issued',
  'pssr_approved',
  'critical_tags_ready',
  'manual_attestation',
]

export type Approval = {
  id: string
  status: 'approved' | 'approved_with_conditions'
  conditions: string[]
  notes: string | null
  approved_by: string
  approved_role: string
  approved_at: string
}

export type Criterion = {
  criterion_id: string | null
  kind: CriterionKind
  label: string | null
  blocking: boolean
  result: CriterionResult
  detail: Record<string, unknown>
}

/** Fila de `compute_system_gates`. */
export type SystemGate = {
  gate_id: string
  gate_code: string
  gate_name: string
  gate_order: number
  gate_phase_id: string | null
  requires_previous: boolean
  approval_roles: string[]
  computed_level: GateLevel
  status: GateStatus
  criteria: Criterion[]
  approval: Approval | null
}

/** Gate compacto dentro de `compute_project_gates`. */
export type MatrixGate = {
  gate_id: string
  code: string
  name: string
  order: number
  computed_level: GateLevel
  status: GateStatus
  failing: number
  approval: Approval | null
}

export const GATE_STATUS_STYLE: Record<GateStatus, { bg: string; fg: string; border: string; icon: string }> = {
  approved:                 { bg: '#059669',           fg: '#ffffff',           border: '#059669', icon: '✓' },
  approved_with_conditions: { bg: '#059669',           fg: '#ffffff',           border: '#f59e0b', icon: '✓!' },
  regressed:                { bg: 'var(--danger-50)',  fg: 'var(--danger-700)', border: '#ef4444', icon: '↺' },
  ready:                    { bg: 'var(--success-50)', fg: 'var(--success-700)', border: '#a7f3d0', icon: '●' },
  ready_with_conditions:    { bg: '#fffbeb',           fg: '#b45309',           border: '#fde68a', icon: '◐' },
  not_ready:                { bg: 'var(--danger-50)',  fg: 'var(--danger-700)', border: '#fecaca', icon: '○' },
}

export const isApproved = (s: GateStatus) => s === 'approved' || s === 'approved_with_conditions' || s === 'regressed'

/** ¿Puede este rol aprobar el gate ahora? (la RPC lo vuelve a validar). */
export function canApprove(gate: Pick<SystemGate, 'status' | 'approval_roles'>, role: string): boolean {
  return (gate.status === 'ready' || gate.status === 'ready_with_conditions') && gate.approval_roles.includes(role)
}

/** ¿Puede este rol revocar la aprobación? owner/admin siempre; si no, los roles que aprueban el gate. */
export function canRevoke(gate: Pick<SystemGate, 'approval' | 'approval_roles'>, role: string): boolean {
  return !!gate.approval && (role === 'owner' || role === 'admin' || gate.approval_roles.includes(role))
}

/** Condiciones escritas una por línea → lista limpia (máx. 20, 500 caracteres), igual que la RPC. */
export function parseConditions(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 20)
}

/** Ruta de evidencia en el bucket gate-evidence: <org>/<system>/<uuid>-<nombre saneado>. */
export function evidencePath(orgId: string, systemId: string, fileName: string, id: string): string {
  const safe = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
  return `${orgId}/${systemId}/${id}-${safe || 'evidencia'}`
}

/** Una ruta de evidencia es válida solo dentro de la carpeta del sistema de la org. */
export function isEvidencePathFor(path: string, orgId: string, systemId: string): boolean {
  return path.startsWith(`${orgId}/${systemId}/`) && !path.includes('..')
}
