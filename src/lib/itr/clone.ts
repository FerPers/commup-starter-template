// Clonación de plantillas ITR entre organizaciones (catálogo → org cliente,
// DEMO → catálogo). Lógica pura: huella del contenido para saber si una
// plantilla cambió. La copia la hace la RPC clone_itr_template_from_catalog
// (A40, una transacción). Sin acceso a la base.

import { normalizeRequired } from './signatures'

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

/** A40: cabecera que también cuenta como contenido (lo que el ITR congela al crearse). */
export type CloneHeaderSource = {
  required_signatures?: ReadonlyArray<string> | null
  requires_test_equipment?: boolean | null
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
 * A40: incluye las firmas requeridas y si exige equipo de prueba; antes una plantilla
 * que solo cambiaba eso se veía «al día».
 */
export function templateContentHash(sections: CloneSectionSource[], header: CloneHeaderSource = {}): string {
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
  const text = JSON.stringify({
    signatures: normalizeRequired(header.required_signatures),
    test_equipment: !!header.requires_test_equipment,
    sections: payload,
  })
  // Dos hashes de 32 bits independientes (FNV-1a y djb2) → 16 hex.
  let fnv = 0x811c9dc5, djb = 5381
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0
    djb = (Math.imul(djb, 33) + c) >>> 0
  }
  return fnv.toString(16).padStart(8, '0') + djb.toString(16).padStart(8, '0')
}

export type LocalState = 'new' | 'same' | 'outdated'

/** Estado de una plantilla del catálogo respecto a la copia local (última revisión por código). */
export function localState(remoteHash: string, local: { hash: string } | null): LocalState {
  if (!local) return 'new'
  return local.hash === remoteHash ? 'same' : 'outdated'
}
