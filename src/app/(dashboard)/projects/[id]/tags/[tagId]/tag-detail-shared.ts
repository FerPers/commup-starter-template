// Tipos, constantes y estilos compartidos por TagDetail y sus tabs.
// Extraído de TagDetail.tsx (Q3) — sin cambios de comportamiento.

import type { Enums } from '@/types/supabase.generated'

// ── Pestañas (N1b): la activa vive en `?tab=` para que Mi trabajo, Escanear y los avisos abran la correcta ──

export const TAG_TABS = ['overview', 'itrs', 'punches', 'photos', 'docs', 'preservation'] as const
export type TagTab = (typeof TAG_TABS)[number]

const TAG_TAB_ALIASES: Record<string, TagTab> = { punch: 'punches', documents: 'docs' }

/** `?tab=` → pestaña válida; lo desconocido abre el Resumen. */
export function parseTagTab(value: string | string[] | undefined | null): TagTab {
  const v = Array.isArray(value) ? value[0] : value
  if (!v) return 'overview'
  return (TAG_TABS as readonly string[]).includes(v) ? (v as TagTab) : TAG_TAB_ALIASES[v] ?? 'overview'
}

// ── ITR prop types ───────────────────────────────────────────────────

export type TagItr = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  created_at: string
  itr_templates: { code: string; title: string; disciplines: { code: string; name: string; color: string } } | null
  project_phases: { code: string; name: string; color: string } | null
  itr_assignments: Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_signatures: Array<{ id: string; role: string; signed_at: string }>
  /** S04 (D4): firmas que exige el ITR. */
  required_signatures: string[]
}

export type ItrTemplate = {
  title_es?: string | null
  equipment_type_id?: string | null
  id: string
  code: string
  title: string
  phase_id: string
  /** S04 (D4): firmas que pide la plantilla; la fase puede sumar al cliente. */
  required_signatures: string[]
  project_phases: { id: string; code: string; name: string; color: string; itr_client_signature: boolean } | null
}

export type OrgMember = {
  user_id: string
  role: string
  profiles: { full_name: string } | null
}

// ── Tag types ────────────────────────────────────────────────────

export type Discipline = { id: string; code: string; name: string; color: string }
export type Area       = { id: string; code: string; name: string }
export type System     = { id: string; code: string; name: string; areas: Area }
export type Subsystem  = { id: string; code: string; name: string; systems: System }

export type Tag = {
  equipment_type_id?: string | null
  equipment_types?: { id: string; code: string; name: string } | null
  id: string
  tag_number: string
  description: string
  status: Enums<'tag_status'>
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  preservation_required: boolean
  pid_drawing: string | null
  nfc_uid: string | null
  range_min: number | null
  range_max: number | null
  eng_unit: string | null
  sp_h: number | null
  sp_hh: number | null
  sp_l: number | null
  sp_ll: number | null
  signal_type: string | null
  sil_level: string | null
  criticality: string
  io_address: string | null
  junction_box: string | null
  datasheet_number: string | null
  revision: string | null
  fluid_type: string | null
  mounting_typical: string | null
  disciplines: Discipline
  subsystems: Subsystem
}

// ── Status config ────────────────────────────────────────────────

export const STATUS: Record<string, { color: string; bg: string; border: string }> = {
  not_started: { color: 'var(--text-muted)',  bg: 'var(--gray-100)',   border: 'var(--border)' },
  in_progress: { color: 'var(--primary-700)', bg: 'var(--primary-50)', border: 'var(--primary-200)' },
  completed:   { color: 'var(--success-700)', bg: 'var(--success-50)', border: 'var(--success-200)' },
  on_hold:     { color: 'var(--warning-700)', bg: 'var(--warning-50)', border: 'var(--warning-200)' },
}

export const SIGNAL_TYPES = ['4-20mA', 'HART', 'Discreta', 'Foundation Fieldbus', 'Profibus', 'Modbus', 'WirelessHART', 'Otra']
export const SIL_LEVELS   = ['None', 'SIL1', 'SIL2', 'SIL3']

// Criticidad del tag (bloquea gates aunque el % sea alto); colores del badge
export const CRITICALITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  safety:  { color: 'var(--danger-700)',  bg: 'var(--danger-50)',  border: 'var(--danger-200)' },
  process: { color: 'var(--warning-700)', bg: 'var(--warning-50)', border: 'var(--warning-200)' },
  normal:  { color: 'var(--text-muted)',  bg: 'var(--gray-100)',   border: 'var(--border)' },
}

// Disciplines that work with analog/digital signals, setpoints, and SIL levels
export const INST_DISCIPLINES = ['INST', 'SAFE', 'TELE']

// ── Shared styles ────────────────────────────────────────────────

export const navBtn: React.CSSProperties = {
  padding: '6px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)',
  borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)',
  textDecoration: 'none', cursor: 'pointer',
}

export const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border)', padding: '16px 18px',
}

export const sectionLabel: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px',
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', boxSizing: 'border-box',
  outline: 'none',
}
