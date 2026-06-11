// Tipos, constantes, helpers y estilos compartidos por TemplateBuilder y sus
// sub-componentes. Extraído de TemplateBuilder.tsx (Q3).

import type { ItemPayload } from '@/app/actions/itr-templates'
import type { ItrItemType } from '@/types/database'

// ── Types ──────────────────────────────────────────────────────

export interface BuilderItem {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  item_type: ItrItemType
  is_required: boolean
  is_critical: boolean
  requires_photo: boolean
  requires_measurement: boolean
  unit: string | null
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  order_index: number
  condition_item_id: string | null
  condition_value: string | null
}

export interface BuilderSection {
  id: string
  title: string
  order_index: number
  items: BuilderItem[]
}

export interface TemplateData {
  id: string
  code: string
  title: string
  description: string | null
  version: number
  is_active: boolean
  disciplines: { id: string; code: string; name: string; color: string } | null
  project_phases: { id: string; code: string; name: string; color: string } | null
  itr_template_sections: Array<{
    id: string; title: string; order_index: number
    itr_template_items: BuilderItem[]
  }>
}

export interface Discipline { id: string; code: string; name: string; color: string }
export interface Phase { id: string; code: string; name: string; color: string; order_index: number }

/** Form del editor de ítems — ItemPayload sin order_index (lo asigna el caller). */
export type ItemFormValues = Omit<ItemPayload, 'order_index'>

// ── Default item form ──────────────────────────────────────────

export const DEFAULT_ITEM: ItemFormValues = {
  item_number: '',
  description: '',
  description_es: '',
  item_type: 'checkbox',
  is_required: true,
  is_critical: false,
  requires_photo: false,
  requires_measurement: false,
  unit: '',
  acceptance_min: null,
  acceptance_max: null,
  acceptance_text: '',
  condition_item_id: null,
  condition_value: null,
}

// ── Item type catalog (labels se resuelven con i18n en cada consumidor) ──

export const ITEM_TYPE_DEFS: ReadonlyArray<{ value: ItrItemType; labelKey: string; color: string }> = [
  { value: 'checkbox',    labelKey: 'itemTypeCheckbox',    color: '#3b82f6' },
  { value: 'yes_no',      labelKey: 'itemTypeYesNo',       color: '#10b981' },
  { value: 'number',      labelKey: 'itemTypeNumber',      color: '#f59e0b' },
  { value: 'measurement', labelKey: 'itemTypeMeasurement', color: '#8b5cf6' },
  { value: 'text',        labelKey: 'itemTypeText',        color: 'var(--text-muted)' },
  { value: 'select',      labelKey: 'itemTypeSelect',      color: '#14b8a6' },
  { value: 'photo',       labelKey: 'itemTypePhoto',       color: '#ec4899' },
  { value: 'signature',   labelKey: 'itemTypeSignature',   color: '#6366f1' },
  { value: 'date',        labelKey: 'itemTypeDate',        color: '#f97316' },
]

// ── Helpers ────────────────────────────────────────────────────

export function buildSections(raw: TemplateData['itr_template_sections']): BuilderSection[] {
  return [...raw]
    .sort((a, b) => a.order_index - b.order_index)
    .map(s => ({
      ...s,
      items: [...s.itr_template_items].sort((a, b) => a.order_index - b.order_index),
    }))
}

export function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function dateStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── Shared styles ──────────────────────────────────────────────

export const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '5px',
  fontSize: '11px', fontWeight: 600, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '0.04em',
}

export const fieldInput: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', outline: 'none',
  fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}

export function iconBtn(color: string): React.CSSProperties {
  return {
    width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '6px', border: 'none', background: `${color}12`, color,
    cursor: 'pointer', fontSize: '12px', fontWeight: 700, flexShrink: 0,
  }
}

export const miniBtn: React.CSSProperties = {
  width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '4px', border: 'none', background: 'transparent', color: 'var(--gray-400)',
  cursor: 'pointer', fontSize: '10px', padding: 0,
}
