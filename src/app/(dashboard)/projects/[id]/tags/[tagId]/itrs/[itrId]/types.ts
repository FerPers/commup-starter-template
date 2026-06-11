// Tipos y helpers compartidos por la pantalla de ejecución de ITR.
// Extraído de ItrExecution.tsx (Q2) — sin cambios de comportamiento.

import type { Json } from '@/types/supabase.generated'

export type ItrItemType = 'checkbox' | 'text' | 'number' | 'measurement' | 'select' | 'photo' | 'signature' | 'date' | 'yes_no'

export type Item = {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  item_type: ItrItemType
  is_critical: boolean
  is_required: boolean
  requires_photo: boolean
  requires_measurement: boolean
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  unit: string | null
  options: Json
  order_index: number
  condition_item_id: string | null
  condition_value: string | null
}

export type Section = {
  id: string
  title: string
  order_index: number
  itr_template_items: Item[]
}

export type Response = {
  id: string
  item_id: string
  value_text: string | null
  value_numeric: number | null
  value_bool: boolean | null
  value_option: string | null
  remarks: string | null
  is_passed: boolean | null
  responded_at: string | null
}

export type Signature = {
  id: string
  role: string
  signed_at: string
  user_id: string
  signature_image: string | null
  profiles: { full_name: string } | null
}

export type Attachment = {
  id: string
  item_id: string | null
  file_url: string      // storage path
  file_type: string
  captured_at: string
  signed_url: string | null
}

export type ItrData = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  template_id: string
  project_id: string
  tag_id: string | null
  itr_templates: {
    id: string
    code: string
    title: string
    version: number
    itr_template_sections: Section[]
  } | null
  tags: { id: string; tag_number: string; description: string; disciplines: { code: string; name: string; color: string } } | null
  project_phases: { code: string; name: string; color: string } | null
  itr_assignments: Array<{ id: string; user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_responses: Response[]
  itr_signatures: Signature[]
}

/** Patch camelCase que aceptan upsertResponse / saveWithQueue. */
export type SaveData = {
  valueText?: string | null
  valueNumeric?: number | null
  valueBool?: boolean | null
  valueOption?: string | null
  remarks?: string | null
  isPassed?: boolean | null
}

// ── Helpers ───────────────────────────────────────────────────────────

export function computeIsPassed(value: number, min: number | null, max: number | null): boolean | null {
  if (min === null && max === null) return null
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

export function isItemVisible(item: Item, responses: Record<string, Response>): boolean {
  if (!item.condition_item_id) return true
  const condResp = responses[item.condition_item_id]
  if (!condResp) return false
  const actual = String(
    condResp.value_bool ?? condResp.value_option ?? condResp.value_text ?? condResp.value_numeric ?? '',
  )
  return actual === item.condition_value
}
