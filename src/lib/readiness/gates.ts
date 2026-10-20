/**
 * Motor de gates (fase 1 del plan readiness, 2026-10-12) — tipos y helpers puros.
 *
 * El cálculo vive en SQL (`compute_system_gates` / `compute_project_gates`, migración
 * 20261012180000); aquí solo se tipan sus resultados y se decide cómo mostrarlos.
 */

export type GateStatus =
  | 'pending_signatures'
  | 'approved'
  | 'approved_with_conditions'
  /** S11 (D-10): aprobado sin condiciones al que le apareció una condición nueva (p. ej. un documento superado). */
  | 'approved_needs_review'
  | 'regressed'
  | 'ready'
  | 'ready_with_conditions'
  | 'not_ready'

export type GateLevel = 'green' | 'yellow' | 'red'
export type CriterionResult = 'pass' | 'warn' | 'fail'
export type CriterionKind =
  | 'previous_gate'
  | 'dependencies_ready'
  | 'registers_clear'
  | 'constraints_clear'
  | 'lineup_verified'
  | 'performance_accepted'
  | 'documents_current'
  | 'itr_phase_approved'
  | 'certificates_issued'
  | 'pssr_approved'
  | 'critical_tags_ready'
  | 'manual_attestation'

/**
 * Criterios configurables por la org. Cuatro son implícitos: previous_gate (por `requires_previous`),
 * dependencies_ready (dependencias que bloquean ese gate, fase 2), registers_clear (algún tipo de
 * registro controlado bloquea ese gate, fase 3) y constraints_clear (restricciones no cerradas del
 * sistema asignadas a ese gate: condición; abierta en nivel 4, bloqueo — fase 5). lineup_verified es
 * implícito en los gates con `requires_lineup` (hoja de line-up verificada y vigente — fase 6) y
 * performance_accepted en los gates con `requires_performance` (certificado PTC aceptado — fase 7).
 * documents_current aparece cuando un ITR firmado o un procedimiento aprobado del sistema usa una revisión de
 * documento superada: condición, nunca bloqueo (fase 8).
 */
export const CONFIGURABLE_CRITERIA: Exclude<CriterionKind, 'previous_gate' | 'dependencies_ready' | 'registers_clear' | 'constraints_clear' | 'lineup_verified' | 'performance_accepted' | 'documents_current'>[] = [
  'itr_phase_approved',
  'certificates_issued',
  'pssr_approved',
  'critical_tags_ready',
  'manual_attestation',
]

/** Firmas de un gate: quien aprueba firma como Comisionamiento; Operaciones y HSE co-firman. */
export type SignatureCapacity = 'commissioning' | 'operations' | 'hse'
export const COSIGN_CAPACITIES: Exclude<SignatureCapacity, 'commissioning'>[] = ['operations', 'hse']

export type GateSignature = {
  capacity: SignatureCapacity
  user_id: string
  user_role: string
  /** Empresa del firmante congelada al firmar (fase 8). */
  signer_company?: string | null
  comments: string | null
  signed_at: string
}

export type Approval = {
  id: string
  status: 'approved' | 'approved_with_conditions' | 'pending_signatures'
  target_status: 'approved' | 'approved_with_conditions' | null
  signatures: GateSignature[]
  conditions: string[]
  notes: string | null
  approved_by: string
  approved_role: string
  approved_company?: string | null
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
  required_signatures: string[]
  cosign_roles: string[]
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
  pending_signatures:       { bg: '#eff6ff',           fg: '#1d4ed8',           border: '#93c5fd', icon: '✎' },
  approved:                 { bg: '#059669',           fg: '#ffffff',           border: '#059669', icon: '✓' },
  approved_with_conditions: { bg: '#059669',           fg: '#ffffff',           border: '#f59e0b', icon: '✓!' },
  approved_needs_review:    { bg: '#059669',           fg: '#ffffff',           border: '#f59e0b', icon: '✓?' },
  regressed:                { bg: 'var(--danger-50)',  fg: 'var(--danger-700)', border: '#ef4444', icon: '↺' },
  ready:                    { bg: 'var(--success-50)', fg: 'var(--success-700)', border: '#a7f3d0', icon: '●' },
  ready_with_conditions:    { bg: '#fffbeb',           fg: '#b45309',           border: '#fde68a', icon: '◐' },
  not_ready:                { bg: 'var(--danger-50)',  fg: 'var(--danger-700)', border: '#fecaca', icon: '○' },
}

export const isApproved = (s: GateStatus) =>
  s === 'approved' || s === 'approved_with_conditions' || s === 'approved_needs_review' || s === 'regressed'

/**
 * S11 (D13): política de regresión de la org (`organizations.settings.gate_policy`, igual que SQL `org_gate_policy`).
 * El anterior en regresión bloquea el siguiente; un proveedor en regresión deja condición; un punch nuevo no
 * regresa los gates ya aprobados.
 */
export type GatePolicy = {
  regressed_previous: 'block' | 'condition'
  regressed_dependency: 'condition' | 'block'
  cat_a_regresses_approved: boolean
}

export function gatePolicy(settings: unknown): GatePolicy {
  const p = (settings && typeof settings === 'object' ? (settings as Record<string, unknown>).gate_policy : null) as Record<string, unknown> | null
  return {
    regressed_previous: p?.regressed_previous === 'condition' ? 'condition' : 'block',
    regressed_dependency: p?.regressed_dependency === 'block' ? 'block' : 'condition',
    cat_a_regresses_approved: p?.cat_a_regresses_approved === true,
  }
}

/** ¿Puede este rol aprobar el gate ahora? (la RPC lo vuelve a validar). */
export function canApprove(gate: Pick<SystemGate, 'status' | 'approval_roles'>, role: string): boolean {
  return (gate.status === 'ready' || gate.status === 'ready_with_conditions') && gate.approval_roles.includes(role)
}

/** ¿Puede este rol revocar la aprobación? owner/admin siempre; si no, los roles que aprueban el gate. */
export function canRevoke(gate: Pick<SystemGate, 'approval' | 'approval_roles'>, role: string): boolean {
  return !!gate.approval && (role === 'owner' || role === 'admin' || gate.approval_roles.includes(role))
}

/** Firmas que faltan en una aprobación pendiente, en el orden configurado del gate. */
export function missingSignatures(gate: Pick<SystemGate, 'approval' | 'required_signatures'>): string[] {
  if (gate.approval?.status !== 'pending_signatures') return []
  const signed = new Set(gate.approval.signatures.map(s => s.capacity))
  return gate.required_signatures.filter(c => !signed.has(c as SignatureCapacity))
}

/** Firmas que este usuario puede registrar ahora (la RPC vuelve a validar todo). */
export function signableCapacities(
  gate: Pick<SystemGate, 'approval' | 'required_signatures' | 'cosign_roles' | 'status'>,
  role: string,
  userId: string,
): string[] {
  if (gate.status !== 'pending_signatures' || !gate.cosign_roles.includes(role)) return []
  if (gate.approval?.signatures.some(s => s.user_id === userId)) return []
  return missingSignatures(gate)
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
