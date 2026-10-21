/**
 * S23 (D-25): qué pasa aguas abajo al aprobar o revocar un gate, para mostrarlo antes de confirmar.
 * Pura: recibe los gates del sistema y las dependencias en las que este sistema es proveedor.
 */
import { isApproved, type GateStatus } from './gates'

export type ImpactGate = { gate_id: string; gate_code: string; gate_order: number; status: GateStatus }
/** Dependencia en la que ESTE sistema es el proveedor: `system_code` necesita nuestro `required_gate_id`. */
export type ProvidedDependency = { system_code: string; required_gate_id: string; blocked_gate_id: string }

export type GateImpact = {
  /** Gates de este sistema que quedarían en regresión (revocar) o que se habilitan (aprobar). */
  ownGates: string[]
  /** «SISTEMA · GATE» de otros sistemas que dependen de este gate. */
  dependents: string[]
}

/** Revocar: los gates aprobados posteriores pierden su anterior; los dependientes de este gate o de uno posterior. */
export function revokeImpact(gates: readonly ImpactGate[], gateId: string, provides: readonly ProvidedDependency[]): GateImpact {
  const target = gates.find(g => g.gate_id === gateId)
  if (!target) return { ownGates: [], dependents: [] }
  const affected = gates.filter(g => g.gate_order >= target.gate_order)
  const affectedIds = new Set(affected.map(g => g.gate_id))
  return {
    ownGates: affected.filter(g => g.gate_id !== gateId && isApproved(g.status)).map(g => g.gate_code),
    dependents: dependentsOf(provides.filter(d => affectedIds.has(d.required_gate_id)), gates),
  }
}

/** Aprobar: el gate siguiente deja de esperar a este y los dependientes de este gate quedan habilitados. */
export function approveImpact(gates: readonly ImpactGate[], gateId: string, provides: readonly ProvidedDependency[]): GateImpact {
  const target = gates.find(g => g.gate_id === gateId)
  if (!target) return { ownGates: [], dependents: [] }
  const next = [...gates].filter(g => g.gate_order > target.gate_order).sort((a, b) => a.gate_order - b.gate_order)[0]
  return {
    ownGates: next ? [next.gate_code] : [],
    dependents: dependentsOf(provides.filter(d => d.required_gate_id === gateId), gates),
  }
}

function dependentsOf(deps: readonly ProvidedDependency[], gates: readonly ImpactGate[]): string[] {
  const code = (id: string) => gates.find(g => g.gate_id === id)?.gate_code ?? '?'
  return [...new Set(deps.map(d => `${d.system_code} · ${code(d.blocked_gate_id)}`))].sort()
}
