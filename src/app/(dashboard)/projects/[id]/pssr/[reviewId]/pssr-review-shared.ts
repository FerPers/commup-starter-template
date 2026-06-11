// Tipos y constantes compartidos por la pantalla de review PSSR.
// Extraído de PssrReviewForm.tsx (Q4) — sin cambios de comportamiento.

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

export interface Signature {
  id: string
  user_id: string
  discipline: string | null
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

export const STATUS_STYLES: Record<StatusKey, { color: string; bg: string }> = {
  draft:           { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  inProgress:      { color: '#3b82f6',           bg: '#eff6ff' },
  pendingApproval: { color: '#f59e0b',           bg: '#fffbeb' },
  approvedDone:    { color: '#10b981',           bg: '#ecfdf5' },
  rejected:        { color: '#ef4444',           bg: '#fee2e2' },
}

const CAT_COLORS: Record<string, string> = {
  'Ingeniería y Diseño': '#3b82f6',
  'Documentación': '#8b5cf6',
  'Mecánica y Tuberías': '#f59e0b',
  'Electricidad': '#ef4444',
  'Instrumentación y Control': '#06b6d4',
  'Seguridad de Procesos': '#f97316',
  'Seguridad / HSE': '#10b981',
  'Operaciones y Capacitación': '#6366f1',
  'Mantenimiento': 'var(--text-muted)',
  'Medio Ambiente': '#22c55e',
  'Construcción y Comisionamiento': '#d97706',
}

export function catColor(cat: string) { return CAT_COLORS[cat] ?? 'var(--text-muted)' }
