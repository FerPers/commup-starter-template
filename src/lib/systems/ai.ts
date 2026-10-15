import { createsCycle, type DependencyKind, type SystemType } from './dependencies'

// ── Sugerencias de IA para la sistematización (fase 2) ───────────────────────
// La IA propone; una persona decide. Las sugerencias no se guardan: se generan, se revisan en
// pantalla y solo se aplica lo que el editor marca. Aquí se cruzan con el estado real del proyecto
// para descartar códigos inventados, duplicados y ciclos, y para no pisar decisiones humanas.

export type AiSystemSuggestion = {
  system_code: string
  suggested_name: string
  system_type: SystemType
  priority: number
  confidence: number
  reason: string
}

export type AiDependencySuggestion = {
  system_code: string
  depends_on_code: string
  kind: DependencyKind
  confidence: number
  reason: string
}

type SystemState = { id: string; code: string; name: string; system_type: SystemType | null; priority: number | null }
type Edge = { system_id: string; depends_on_system_id: string }

export type AttributeProposal = AiSystemSuggestion & {
  system_id: string
  current: { name: string; system_type: SystemType | null; priority: number | null }
  /** Ya tiene tipo o prioridad puestos por una persona: se muestra, pero desmarcado. */
  humanDecided: boolean
}

export type DependencyProposal = AiDependencySuggestion & { system_id: string; provider_id: string }

export type ReconciledSuggestions = {
  attributes: AttributeProposal[]
  dependencies: DependencyProposal[]
  discarded: string[]
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

export function reconcileSuggestions(
  ai: { systems: AiSystemSuggestion[]; dependencies: AiDependencySuggestion[] },
  systems: SystemState[],
  edges: Edge[],
): ReconciledSuggestions {
  const byCode = new Map(systems.map(s => [s.code.trim().toUpperCase(), s]))
  const discarded: string[] = []
  const attributes: AttributeProposal[] = []
  const seenSystems = new Set<string>()

  for (const s of ai.systems) {
    const sys = byCode.get(s.system_code.trim().toUpperCase())
    if (!sys) { discarded.push(`Sistema desconocido: ${s.system_code}`); continue }
    if (seenSystems.has(sys.id)) continue
    seenSystems.add(sys.id)
    const priority = Math.round(s.priority)
    attributes.push({
      ...s,
      system_code: sys.code,
      suggested_name: s.suggested_name.trim().slice(0, 200) || sys.name,
      priority: priority >= 1 && priority <= 5 ? priority : 3,
      confidence: clamp01(s.confidence),
      reason: s.reason.slice(0, 300),
      system_id: sys.id,
      current: { name: sys.name, system_type: sys.system_type, priority: sys.priority },
      humanDecided: sys.system_type !== null || sys.priority !== null,
    })
  }

  // Dependencias: se aceptan en orden de confianza para que, ante un ciclo, gane la más segura.
  const existing = new Set(edges.map(e => `${e.system_id}:${e.depends_on_system_id}`))
  const accepted: Edge[] = [...edges]
  const dependencies: DependencyProposal[] = []
  for (const d of [...ai.dependencies].sort((a, b) => b.confidence - a.confidence)) {
    const sys = byCode.get(d.system_code.trim().toUpperCase())
    const provider = byCode.get(d.depends_on_code.trim().toUpperCase())
    if (!sys || !provider) { discarded.push(`Dependencia con sistema desconocido: ${d.system_code} → ${d.depends_on_code}`); continue }
    const key = `${sys.id}:${provider.id}`
    if (existing.has(key)) continue
    if (createsCycle(accepted, sys.id, provider.id)) { discarded.push(`Ciclo o autodependencia: ${sys.code} → ${provider.code}`); continue }
    existing.add(key)
    accepted.push({ system_id: sys.id, depends_on_system_id: provider.id })
    dependencies.push({
      ...d,
      system_code: sys.code,
      depends_on_code: provider.code,
      confidence: clamp01(d.confidence),
      reason: d.reason.slice(0, 300),
      system_id: sys.id,
      provider_id: provider.id,
    })
  }

  return { attributes, dependencies, discarded }
}
