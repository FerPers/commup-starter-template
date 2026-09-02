import type { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCode, textOr } from '@/lib/excel/normalize'

// ── Jerarquía área → sistema → subsistema a partir de filas de Excel ─────────
// Compartido por importTags e importSignals. Reglas:
//  - Los códigos son únicos POR PROYECTO (UNIQUE project_id, code), no por
//    padre. Un mismo código bajo dos padres se deduplica y se avisa; antes
//    rompía el upsert completo ("cannot affect row a second time") y todas
//    las filas fallaban con "Subsistema no pudo crearse".
//  - Los registros existentes NO se renombran (ON CONFLICT DO NOTHING): el
//    Excel de tags suele traer solo el código, y re-importar pisaba el nombre.

type Admin = ReturnType<typeof createAdminClient>
type Level = 'areas' | 'systems' | 'subsystems'

export const DEFAULT_AREA = 'GENERAL'
export const DEFAULT_SYSTEM = 'GEN-SYS'
export const DEFAULT_SUBSYSTEM = 'GEN-SUB'

export interface HierarchyRow {
  area_code: string
  area_name?: string
  system_code: string
  system_name?: string
  subsystem_code: string
  subsystem_name?: string
}

export interface HierarchyResult {
  subsystemIdMap: Map<string, string>
  warnings: string[]
}

interface Node { parent: string; name: string }

function register(map: Map<string, Node>, conflicts: Map<string, Set<string>>, code: string, parent: string, name: string) {
  const existing = map.get(code)
  if (!existing) { map.set(code, { parent, name }); return }
  if (existing.parent !== parent) {
    const set = conflicts.get(code) ?? new Set([existing.parent])
    set.add(parent)
    conflicts.set(code, set)
  }
}

async function idsByCode(admin: Admin, level: Level, projectId: string, codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (let i = 0; i < codes.length; i += 300) {
    const { data } = await admin
      .from(level)
      .select('id, code')
      .eq('project_id', projectId)
      .in('code', codes.slice(i, i + 300))
    for (const row of data ?? []) map.set(row.code, row.id)
  }
  return map
}

export async function upsertHierarchy(
  admin: Admin,
  projectId: string,
  rows: HierarchyRow[],
): Promise<HierarchyResult | { error: string }> {
  const warnings: string[] = []
  const areas = new Map<string, string>()
  const systems = new Map<string, Node>()
  const subsystems = new Map<string, Node>()
  const sysConflicts = new Map<string, Set<string>>()
  const subConflicts = new Map<string, Set<string>>()

  for (const r of rows) {
    const a = normalizeCode(r.area_code, DEFAULT_AREA)
    const s = normalizeCode(r.system_code, DEFAULT_SYSTEM)
    const ss = normalizeCode(r.subsystem_code, DEFAULT_SUBSYSTEM)
    if (!areas.has(a)) areas.set(a, textOr(r.area_name, a))
    register(systems, sysConflicts, s, a, textOr(r.system_name, s))
    register(subsystems, subConflicts, ss, s, textOr(r.subsystem_name, ss))
  }

  for (const [code, parents] of sysConflicts) {
    warnings.push(`Sistema "${code}" aparece bajo varias áreas (${[...parents].join(', ')}); se asignó a ${systems.get(code)!.parent}. Usa códigos de sistema únicos en el proyecto.`)
  }
  for (const [code, parents] of subConflicts) {
    warnings.push(`Subsistema "${code}" aparece bajo varios sistemas (${[...parents].join(', ')}); se asignó a ${subsystems.get(code)!.parent}. Usa códigos de subsistema únicos en el proyecto.`)
  }

  // Áreas
  const { error: areaErr } = await admin
    .from('areas')
    .upsert(
      [...areas].map(([code, name]) => ({ project_id: projectId, code, name, description: null })),
      { onConflict: 'project_id,code', ignoreDuplicates: true },
    )
  if (areaErr) return { error: `Error creando áreas: ${areaErr.message}` }
  const areaIdMap = await idsByCode(admin, 'areas', projectId, [...areas.keys()])

  // Sistemas
  const systemRows = []
  for (const [code, node] of systems) {
    const areaId = areaIdMap.get(node.parent)
    if (!areaId) { warnings.push(`Sistema "${code}": no se encontró el área ${node.parent}`); continue }
    systemRows.push({ project_id: projectId, area_id: areaId, code, name: node.name, description: null })
  }
  if (systemRows.length) {
    const { error: sysErr } = await admin
      .from('systems')
      .upsert(systemRows, { onConflict: 'project_id,code', ignoreDuplicates: true })
    if (sysErr) return { error: `Error creando sistemas: ${sysErr.message}` }
  }
  const systemIdMap = await idsByCode(admin, 'systems', projectId, [...systems.keys()])

  // Subsistemas
  const subRows = []
  for (const [code, node] of subsystems) {
    const systemId = systemIdMap.get(node.parent)
    if (!systemId) { warnings.push(`Subsistema "${code}": no se encontró el sistema ${node.parent}`); continue }
    subRows.push({ project_id: projectId, system_id: systemId, code, name: node.name, description: null })
  }
  if (subRows.length) {
    const { error: subErr } = await admin
      .from('subsystems')
      .upsert(subRows, { onConflict: 'project_id,code', ignoreDuplicates: true })
    if (subErr) return { error: `Error creando subsistemas: ${subErr.message}` }
  }
  const subsystemIdMap = await idsByCode(admin, 'subsystems', projectId, [...subsystems.keys()])

  return { subsystemIdMap, warnings }
}
