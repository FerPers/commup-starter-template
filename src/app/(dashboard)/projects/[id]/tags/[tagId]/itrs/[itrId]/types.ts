// Tipos y helpers compartidos por la pantalla de ejecución de ITR.
// Extraído de ItrExecution.tsx (Q2) — sin cambios de comportamiento.

import type { Json } from '@/types/supabase.generated'

export type ItrItemType = 'checkbox' | 'text' | 'number' | 'measurement' | 'select' | 'photo' | 'signature' | 'date' | 'yes_no' | 'continuity' | 'table'

export type Item = {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  item_type: ItrItemType
  is_critical: boolean
  is_required: boolean
  requires_photo: boolean
  requires_document?: boolean
  requires_measurement: boolean
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  unit: string | null
  option_outcomes?: Json
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
  /** Fase 8: empresa del firmante congelada al firmar. */
  signer_company?: string | null
  /** Sprint O: aún en la bandeja de salida (sin red). */
  pending?: boolean
}

export type Attachment = {
  id: string
  item_id: string | null
  file_url: string      // storage path
  file_type: string
  captured_at: string
  signed_url: string | null
  /** Sprint O: aún en la bandeja de salida (sin red); id `local:<n>` y signed_url = object URL. */
  pending?: boolean
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
  tags: {
    id: string; tag_number: string; description: string
    /** Datos maestros del tag (solo lectura en la ejecución; nunca se recrean como ítems). */
    manufacturer?: string | null; model?: string | null; serial_number?: string | null
    datasheet_number?: string | null; pid_drawing?: string | null
    range_min?: number | null; range_max?: number | null; eng_unit?: string | null
    revision?: string | null; junction_box?: string | null
    disciplines: { code: string; name: string; color: string }
  } | null
  project_phases: { code: string; name: string; color: string } | null
  /** A44: datos del tag congelados en la primera firma (null = sin firmar o firmado antes de A44). */
  tag_snapshot?: unknown
  tag_snapshot_at?: string | null
  /** A08 (E2): devuelto al ejecutor, hasta la siguiente firma. */
  returned_at?: string | null
  return_reason?: string | null
  itr_assignments: Array<{ id: string; user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_responses: Response[]
  itr_signatures: Signature[]
  /** S04 (D4): firmas que exige este ITR, congeladas al crearlo (orden ejecutor → supervisor → cliente). */
  required_signatures: string[]
  /** Fase 4-D: ITR generado desde un lazo o una causa C&E y su foto de filas (inmutable). */
  loop_id?: string | null
  ce_cause_id?: string | null
  source_rows?: Json | null
  /** A38: alcance de la continuidad fijado por un líder, por ítem (itr_continuity_scopes). */
  itr_continuity_scopes?: Array<{ item_id: string; grouping_mode: string; quantity: number; shields: string[]; set_by: string; set_at: string; reason: string | null }>
  loops?: { id: string; loop_number: string } | null
  ce_causes?: { id: string; code: string; description: string; ce_matrices: { id: string; code: string } | null } | null
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

// S04: la lógica de firma vive en src/lib/itr/signatures.ts (espejo de sign_itr_atomic).
export { availableSigningRoles, type SigningRole } from '@/lib/itr/signatures'
