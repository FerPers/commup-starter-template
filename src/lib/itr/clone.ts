// Clonación de plantillas ITR entre organizaciones (catálogo → org cliente,
// DEMO → catálogo). Lógica pura: huella del contenido para saber si una
// plantilla cambió, filas de inserción sin ids de origen y re-mapeo de
// condiciones a los ítems copiados. Sin acceso a la base.

export type CloneItemSource = {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  description_es_source?: string | null
  item_type: string
  is_required: boolean
  is_critical: boolean
  requires_photo: boolean
  requires_document?: boolean
  requires_measurement: boolean
  options: unknown
  option_outcomes?: unknown
  unit: string | null
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  order_index: number
  condition_item_id?: string | null
  condition_value?: string | null
}

export type CloneSectionSource = {
  id: string
  title: string
  order_index: number
  itr_template_items: CloneItemSource[]
}

const ITEM_FIELDS = [
  'item_number', 'description', 'description_es', 'item_type', 'is_required', 'is_critical',
  'requires_photo', 'requires_document', 'requires_measurement', 'options', 'option_outcomes', 'unit',
  'acceptance_min', 'acceptance_max', 'acceptance_text',
] as const

/** Secciones e ítems en orden estable (order_index, luego id) — el mismo que usa la RPC de revisiones. */
export function orderedSections(sections: CloneSectionSource[]): CloneSectionSource[] {
  const byOrder = <T extends { order_index: number; id: string }>(a: T, b: T) =>
    a.order_index - b.order_index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return [...sections].sort(byOrder).map(s => ({ ...s, itr_template_items: [...s.itr_template_items].sort(byOrder) }))
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(k => [k, canonical((value as Record<string, unknown>)[k])]))
  }
  return value ?? null
}

/**
 * Huella del contenido de una plantilla (estructura, textos, tipos, opciones,
 * resultados, unidades, criterios y condiciones), independiente de los ids y
 * de la organización. Dos plantillas con la misma huella son intercambiables.
 */
export function templateContentHash(sections: CloneSectionSource[]): string {
  const ordered = orderedSections(sections)
  const position = new Map<string, string>()
  ordered.forEach((s, si) => s.itr_template_items.forEach((it, ii) => position.set(it.id, `${si}.${ii}`)))
  const payload = ordered.map(s => ({
    title: s.title,
    items: s.itr_template_items.map(it => ({
      ...Object.fromEntries(ITEM_FIELDS.map(f => [f, canonical(it[f] ?? null)])),
      condition: it.condition_item_id && position.has(it.condition_item_id)
        ? { ref: position.get(it.condition_item_id), value: it.condition_value ?? null }
        : null,
    })),
  }))
  const text = JSON.stringify(payload)
  // Dos hashes de 32 bits independientes (FNV-1a y djb2) → 16 hex.
  let fnv = 0x811c9dc5, djb = 5381
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0
    djb = (Math.imul(djb, 33) + c) >>> 0
  }
  return fnv.toString(16).padStart(8, '0') + djb.toString(16).padStart(8, '0')
}

/** Fila de inserción de un ítem copiado (sin condición: se re-mapea después). */
export function itemInsertRow(item: CloneItemSource, sectionId: string, templateId: string) {
  return {
    section_id: sectionId,
    template_id: templateId,
    item_number: item.item_number,
    description: item.description,
    description_es: item.description_es,
    description_es_source: item.description_es_source ?? null,
    item_type: item.item_type,
    is_required: item.is_required,
    is_critical: item.is_critical,
    requires_photo: item.requires_photo,
    requires_document: item.requires_document ?? false,
    requires_measurement: item.requires_measurement,
    options: item.options ?? null,
    option_outcomes: item.option_outcomes ?? {},
    unit: item.unit,
    acceptance_min: item.acceptance_min,
    acceptance_max: item.acceptance_max,
    acceptance_text: item.acceptance_text,
    order_index: item.order_index,
    condition_item_id: null as string | null,
    condition_value: null as string | null,
  }
}

/**
 * Condiciones a escribir sobre los ítems copiados. `idMap` traduce id de origen →
 * id copiado. Una condición que apunte fuera de la plantilla se descarta con su valor.
 */
export function conditionRemaps(
  sections: CloneSectionSource[],
  idMap: Map<string, string>,
): Array<{ id: string; condition_item_id: string; condition_value: string | null }> {
  const out: Array<{ id: string; condition_item_id: string; condition_value: string | null }> = []
  for (const s of sections) for (const it of s.itr_template_items) {
    if (!it.condition_item_id) continue
    const target = idMap.get(it.condition_item_id), self = idMap.get(it.id)
    if (!target || !self) continue
    out.push({ id: self, condition_item_id: target, condition_value: it.condition_value ?? null })
  }
  return out
}

export type LocalState = 'new' | 'same' | 'outdated'

/** Estado de una plantilla del catálogo respecto a la copia local (última revisión por código). */
export function localState(remoteHash: string, local: { hash: string } | null): LocalState {
  if (!local) return 'new'
  return local.hash === remoteHash ? 'same' : 'outdated'
}
