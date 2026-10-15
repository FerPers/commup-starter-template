/**
 * Sistematización (fase 2 del plan readiness, 2026-10-15) — tipos y reglas puras.
 *
 * Una dependencia dice: «el sistema A necesita que B tenga aprobado el gate X antes del gate Y de A».
 * La BD (migración 20261015120000) valida coherencia y ciclos y la evalúa en `compute_system_gates`
 * como criterio implícito `dependencies_ready`; aquí viven los valores por defecto por tipo y las
 * comprobaciones que la UI hace antes de guardar.
 */

export type SystemType = 'process' | 'utility' | 'safety'
export const SYSTEM_TYPES: SystemType[] = ['process', 'utility', 'safety']

export type DependencyKind = 'utility' | 'process' | 'other'
export const DEPENDENCY_KINDS: DependencyKind[] = ['utility', 'process', 'other']

export const PRIORITIES = [1, 2, 3, 4, 5] as const

export type BatteryLimitKey = 'inlet' | 'outlet' | 'electrical' | 'instrumentation' | 'utilities' | 'notes'
export const BATTERY_LIMIT_KEYS: BatteryLimitKey[] = ['inlet', 'outlet', 'electrical', 'instrumentation', 'utilities', 'notes']
export type BatteryLimits = Partial<Record<BatteryLimitKey, string>>

export type SystemDependency = {
  id: string
  system_id: string
  depends_on_system_id: string
  kind: DependencyKind
  required_gate_id: string
  blocked_gate_id: string
  notes: string | null
  source: 'manual' | 'import' | 'ai'
}

type GateRef = { id: string; code: string; order_index: number; is_active: boolean }

/**
 * Gates por defecto según el tipo de dependencia, por posición (las orgs usan códigos distintos:
 * MC/RFPC/RFC/RFSU, A/B/C/SU…):
 *   utility → el proveedor en servicio (último gate, o «UTILITY» si la org lo activó) antes de
 *             comisionar el dependiente (penúltimo gate).
 *   process / other → aguas arriba en arranque (último) antes del arranque del dependiente (último).
 */
export function defaultDependencyGates(kind: DependencyKind, gates: GateRef[]): { requiredGateId: string; blockedGateId: string } | null {
  const active = gates.filter(g => g.is_active).sort((a, b) => a.order_index - b.order_index || a.code.localeCompare(b.code))
  if (!active.length) return null
  const last = active[active.length - 1]
  if (kind !== 'utility') return { requiredGateId: last.id, blockedGateId: last.id }
  const utilityGate = active.find(g => g.code.toUpperCase() === 'UTILITY')
  const blocked = active.length > 1 ? active[active.length - 2] : last
  return { requiredGateId: (utilityGate ?? last).id, blockedGateId: blocked.id }
}

/** ¿Agregar «system depende de provider» cerraría un ciclo? (la BD también lo impide). */
export function createsCycle(edges: Pick<SystemDependency, 'system_id' | 'depends_on_system_id'>[], systemId: string, providerId: string): boolean {
  if (systemId === providerId) return true
  const upstream = new Map<string, string[]>()
  for (const e of edges) upstream.set(e.system_id, [...(upstream.get(e.system_id) ?? []), e.depends_on_system_id])
  const seen = new Set<string>()
  const stack = [providerId]
  while (stack.length) {
    const id = stack.pop()!
    if (id === systemId) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(upstream.get(id) ?? []))
  }
  return false
}

/** Sistemas habilitantes: de los que depende al menos otro sistema (no se guarda en BD). */
export function enablingSystemIds(edges: Pick<SystemDependency, 'depends_on_system_id'>[]): Set<string> {
  return new Set(edges.map(e => e.depends_on_system_id))
}

/**
 * Bloqueos por dependencia para la matriz de Control Tower, a partir del estado de cada gate
 * (mismo criterio que la BD: el proveedor cumple con su gate aprobado con todas las firmas; una
 * aprobación vigente en regresión sigue contando, porque la BD mira la aprobación, no el cálculo).
 * Devuelve `${systemId}:${gateId}` → códigos de los proveedores que faltan.
 */
export function dependencyBlocks(
  edges: Pick<SystemDependency, 'system_id' | 'depends_on_system_id' | 'required_gate_id' | 'blocked_gate_id'>[],
  statusOf: (systemId: string, gateId: string) => string | undefined,
  codeOf: (systemId: string) => string,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const e of edges) {
    const st = statusOf(e.depends_on_system_id, e.required_gate_id)
    if (st === 'approved' || st === 'approved_with_conditions' || st === 'regressed') continue
    const key = `${e.system_id}:${e.blocked_gate_id}`
    out.set(key, [...(out.get(key) ?? []), codeOf(e.depends_on_system_id)])
  }
  return out
}

/** Límites de batería del formulario → objeto limpio (solo claves conocidas, sin vacíos, 1000 caracteres). */
export function cleanBatteryLimits(input: Record<string, unknown>): BatteryLimits {
  const out: BatteryLimits = {}
  for (const key of BATTERY_LIMIT_KEYS) {
    const v = input[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 1000)
  }
  return out
}

/** Detalle del criterio `dependencies_ready` que devuelve `compute_system_gates`. */
export type DependencyCriterionDetail = {
  total: number
  missing_count: number
  dependencies: {
    dependency_id: string
    kind: DependencyKind
    system_id: string
    system_code: string
    system_name: string
    gate_id: string
    gate_code: string
    provider_status: string | null
    ok: boolean
  }[]
}
