// Backup format constants and types (no server-only logic — safe to import in client).

import type { Enums, Json } from '@/types/supabase.generated'

export const BACKUP_FORMAT = 'commup.templates.backup'
export const BACKUP_VERSION = 1

export type ItrTemplateBackup = {
  code: string
  title: string
  description: string | null
  version: number
  is_active: boolean
  is_global: boolean
  discipline_code: string | null
  phase_code: string | null
  sections: Array<{
    title: string
    order_index: number
    items: Array<{
      item_number: string | null
      description: string
      description_es: string | null
      item_type: Enums<'itr_item_type'>
      is_required: boolean
      is_critical: boolean
      requires_photo: boolean
      requires_measurement: boolean
      unit: string | null
      acceptance_min: number | null
      acceptance_max: number | null
      acceptance_text: string | null
      options: Json
      order_index: number
      condition_key: string | null   // section_index:item_order_index of conditioning item, or null
      condition_value: string | null
    }>
  }>
}

export type PreservationProcedureBackup = {
  code: string
  title: string
  description: string | null
  frequency: Enums<'preservation_frequency'>
  interval_days: number
  requires_photo: boolean
  requires_signature: boolean
  discipline_code: string | null
  equipment_type_code: string | null
  items: Array<{
    order_index: number
    label: string
    item_type: string
    unit: string | null
    min_value: number | null
    max_value: number | null
    is_critical: boolean
    is_required: boolean
  }>
}

export type PssrTemplateBackup = {
  name: string
  description: string | null
  is_active: boolean
  items: Array<{
    item_order: number
    category: string
    element: string
    requirement: string
    notes_hint: string | null
    is_required: boolean
  }>
}

export type TemplatesBackup = {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  org: { id: string; name: string; slug: string | null }
  itr_templates: ItrTemplateBackup[]
  preservation_procedures: PreservationProcedureBackup[]
  pssr_templates: PssrTemplateBackup[]
}

export type RestoreOptions = {
  /** Skip rows whose code/name already exists in target org. Default true. */
  skipDuplicates?: boolean
  /** Suffix appended to code/name when not skipping (avoids unique violations). */
  duplicateSuffix?: string
  /** What to import. Each defaults to true if its array has entries. */
  includeItr?: boolean
  includePreservation?: boolean
  includePssr?: boolean
}

export type RestoreResult = {
  itr: { created: number; skipped: number; errors: string[] }
  preservation: { created: number; skipped: number; errors: string[] }
  pssr: { created: number; skipped: number; errors: string[] }
}

export type TaxonomyPreview = {
  missingDisciplines: string[]
  missingPhases: string[]
  missingEquipmentTypes: string[]
}

// Defaults for autocreate. Codes not in the lookup get name = code + a generic color.
export const DISCIPLINE_DEFAULTS: Record<string, { name: string; color: string }> = {
  ELEC:   { name: 'Eléctrica',         color: '#FBBF24' },
  INST:   { name: 'Instrumentación',   color: '#3B82F6' },
  MECH:   { name: 'Mecánica',          color: '#10B981' },
  PIPE:   { name: 'Tubería',           color: '#06B6D4' },
  SAFE:   { name: 'Seguridad',         color: '#EF4444' },
  HVAC:   { name: 'HVAC',              color: '#8B5CF6' },
  INSU:   { name: 'Aislamiento',       color: '#F97316' },
  PAINT:  { name: 'Pintura',           color: '#EC4899' },
  PROC:   { name: 'Procesos',          color: '#14B8A6' },
  STRUCT: { name: 'Estructural',       color: '#84CC16' },
  TELE:   { name: 'Telecomunicaciones', color: '#6366F1' },
  CIVIL:  { name: 'Civil',             color: '#A16207' },
  CTRL:   { name: 'Control',           color: '#0EA5E9' },
}

export const PHASE_DEFAULTS: Record<string, { name: string; color: string; order_index: number; certificate_name: string | null }> = {
  A: { name: 'Construcción',           color: '#3B82F6', order_index: 0, certificate_name: 'Mechanical Completion' },
  B: { name: 'Pre-comisionamiento',    color: '#F59E0B', order_index: 1, certificate_name: 'Ready for Pre-Commissioning' },
  C: { name: 'Comisionamiento',        color: '#10B981', order_index: 2, certificate_name: 'Ready for Commissioning' },
  SU: { name: 'Start-Up / Puesta en marcha', color: '#8B5CF6', order_index: 3, certificate_name: 'Ready for Start-Up' },
  // D reservada para Decomisionamiento (sin certificado por defecto); R = Recomisionamiento (visión, RFR)
  D: { name: 'Decomisionamiento',      color: '#64748B', order_index: 4, certificate_name: null },
}

export const DEFAULT_DISCIPLINE_COLOR = '#6B7280'
export const DEFAULT_PHASE_COLOR = '#3B82F6'
