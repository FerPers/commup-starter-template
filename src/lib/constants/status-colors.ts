// Canonical ITR status palette (color + background) shared across ITR/certificate views.
// Labels stay local to each view (i18n via next-intl). Other status families
// (tag status with on_hold, work-plan amber, PSSR) intentionally keep their own
// palettes — they are not interchangeable with this one.
export const ITR_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  completed:   { color: 'var(--success-500)', bg: 'var(--success-50)' },
  approved:    { color: 'var(--violet-600)', bg: 'var(--violet-50)' },
  rejected:    { color: 'var(--danger-500)', bg: 'var(--danger-100)' },
}

// Canonical punch palettes shared by PunchListView and TagPunchTab.
export const PUNCH_CATEGORY_CFG = {
  A: { label: 'Cat A', color: 'var(--danger-500)', bg: 'var(--danger-100)', border: 'var(--danger-200)' },
  B: { label: 'Cat B', color: 'var(--warning-500)', bg: 'var(--warning-50)', border: 'var(--warning-200)' },
  C: { label: 'Cat C', color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)' },
} as const

export const PUNCH_STATUS_COLORS = {
  open:        { color: 'var(--danger-500)', bg: 'var(--danger-100)' },
  in_progress: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  // Sub-estado de in_progress (resolved_at): espera verificación en campo por otra persona.
  resolved:    { color: 'var(--violet-600)', bg: 'var(--violet-50)' },
  closed:      { color: 'var(--success-500)', bg: 'var(--success-50)' },
  cancelled:   { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
} as const
