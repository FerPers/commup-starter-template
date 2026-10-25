// Tipos y constantes compartidos por la pantalla de review PSSR.
// Extraído de PssrReviewForm.tsx (Q4) — sin cambios de comportamiento.
import { TONE_STYLE, pssrState } from '@/lib/states'

export type ItemStatus = 'pending' | 'si' | 'no' | 'na'
export type ReviewStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected'

export interface ReviewItem {
  id: string
  item_order: number
  category: string
  element: string
  requirement: string
  notes_hint: string | null
  status: ItemStatus
  responsible: string | null
  actions: string | null
  completion_date: string | null
}

/** Acción del tracker creada al marcar el ítem «no» (fase 5; trigger pssr_item_create_action). */
export type ItemAction = { id: string; number: string; status: string }

export interface Signature {
  id: string
  user_id: string
  discipline: string | null
  /** S16 (C-32): capacidad firmada (commissioning · operations · hse); null en firmas anteriores. */
  capacity: string | null
  signature_data: string
  signed_at: string
  profiles: { full_name: string; id: string } | null
}

export type StatusKey = 'draft' | 'inProgress' | 'pendingApproval' | 'approvedDone' | 'rejected'

export const STATUS_KEY_MAP: Record<ReviewStatus, StatusKey> = {
  draft: 'draft',
  in_progress: 'inProgress',
  pending_approval: 'pendingApproval',
  approved: 'approvedDone',
  rejected: 'rejected',
}

// A08: tonos del contrato (`pssrState`): enviado = espera la aprobación de otra persona, en violeta.
const pssrTone = (status: string) => { const t = TONE_STYLE[pssrState(status).tone]; return { color: t.fg, bg: t.bg } }
export const STATUS_STYLES: Record<StatusKey, { color: string; bg: string }> = {
  draft:           pssrTone('draft'),
  inProgress:      pssrTone('in_progress'),
  pendingApproval: pssrTone('pending_approval'),
  approvedDone:    pssrTone('approved'),
  rejected:        pssrTone('rejected'),
}

const CAT_COLORS: Record<string, string> = {
  'Ingeniería y Diseño': 'var(--primary-500)',
  'Documentación': 'var(--violet-500)',
  'Mecánica y Tuberías': 'var(--warning-500)',
  'Electricidad': 'var(--danger-500)',
  'Instrumentación y Control': 'var(--cyan-500)',
  'Seguridad de Procesos': 'var(--orange-500)',
  'Seguridad / HSE': 'var(--success-500)',
  'Operaciones y Capacitación': 'var(--indigo-500)',
  'Mantenimiento': 'var(--text-muted)',
  'Medio Ambiente': 'var(--teal-500)',
  'Construcción y Comisionamiento': 'var(--warning-600)',
}

export function catColor(cat: string) { return CAT_COLORS[cat] ?? 'var(--text-muted)' }
