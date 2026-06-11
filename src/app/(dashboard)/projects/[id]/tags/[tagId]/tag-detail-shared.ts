// Tipos, constantes y estilos compartidos por TagDetail y sus tabs.
// Extraído de TagDetail.tsx (Q3) — sin cambios de comportamiento.

import type { Enums } from '@/types/supabase.generated'

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
}

export type ItrTemplate = {
  id: string
  code: string
  title: string
  phase_id: string
  project_phases: { id: string; code: string; name: string; color: string } | null
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
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)', border: 'var(--border)' },
  in_progress:  { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  completed:    { color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  on_hold:      { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
}

export const SIGNAL_TYPES = ['4-20mA', 'HART', 'Discreta', 'Foundation Fieldbus', 'Profibus', 'Modbus', 'WirelessHART', 'Otra']
export const SIL_LEVELS   = ['None', 'SIL1', 'SIL2', 'SIL3']

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
  fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)',
  textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px',
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', boxSizing: 'border-box',
  outline: 'none',
}
