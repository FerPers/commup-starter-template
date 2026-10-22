/**
 * S19 (C-14) — generación masiva de ITR: tipos y reglas puras compartidas por la acción y la pantalla.
 * La fuente de verdad es SQL (itr_generation_candidates / itr_generation_summary / generate_itrs).
 */

export type GenerationScope = {
  projectId: string
  phaseIds: string[]
  systemIds?: string[] | null
  subsystemIds?: string[] | null
  /** R2a: generar solo los requisitos de estos tags (panel «ITR requeridos» de la ficha del tag). */
  tagIds?: string[] | null
}

export type GenerationRole = 'executor' | 'supervisor' | 'client'
export const GENERATION_ROLES: GenerationRole[] = ['executor', 'supervisor', 'client']

/** Clave de disciplina en la asignación (= SQL: discipline_id o 'none'). */
export const disciplineKey = (id: string | null | undefined) => id ?? 'none'

export type GenerationSummary = {
  tags: number
  create: number
  exists: number
  no_subsystem: number
  no_equipment_type: number
  no_rule: number
  /** R1: pares tag × plantilla de una disciplina fuera del alcance del proyecto (no se generan). */
  out_of_scope: number
  /** R2a: pares excluidos a mano del tag (no se generan). */
  excluded: number
  by_discipline: { discipline_id: string | null; code: string | null; name: string | null; create: number; roles: GenerationRole[] | null }[]
  by_template: { code: string; title: string; create: number; exists: number }[]
  samples: { no_equipment_type: string[]; no_rule: string[]; no_subsystem: string[]; out_of_scope: string[] }
}

export type Assignment = Record<string, Partial<Record<GenerationRole, string>>>

/** Asignación sin vacíos; error si una persona aparece en dos roles de la misma disciplina (D6, = SQL). */
export function cleanAssignment(a: Assignment): { assign: Assignment } | { error: 'same_person' } {
  const out: Assignment = {}
  for (const [disc, roles] of Object.entries(a)) {
    const picked = Object.fromEntries(Object.entries(roles).filter(([, v]) => !!v)) as Partial<Record<GenerationRole, string>>
    const people = Object.values(picked)
    if (new Set(people).size !== people.length) return { error: 'same_person' }
    if (people.length > 0) out[disc] = picked
  }
  return { assign: out }
}

/** Ids válidos (uuid) y sin repetir; vacío → null (= todo el proyecto). */
export function scopeIds(ids: string[] | null | undefined): string[] | null {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const list = [...new Set((ids ?? []).filter(id => re.test(id)))]
  return list.length > 0 ? list : null
}
