// Canonical ITR status palette (color + background) shared across ITR/certificate views.
// Labels stay local to each view (i18n via next-intl). Other status families
// (tag status with on_hold, work-plan amber, PSSR) intentionally keep their own
// palettes — they are not interchangeable with this one.
export const ITR_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_progress: { color: '#3b82f6', bg: '#eff6ff' },
  completed:   { color: '#10b981', bg: '#ecfdf5' },
  approved:    { color: '#7c3aed', bg: '#f5f3ff' },
  rejected:    { color: '#ef4444', bg: '#fee2e2' },
}

// Canonical punch palettes shared by PunchListView and TagPunchTab.
export const PUNCH_CATEGORY_CFG = {
  A: { label: 'Cat A', color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
  B: { label: 'Cat B', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  C: { label: 'Cat C', color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)' },
} as const

export const PUNCH_STATUS_COLORS = {
  open:        { color: '#ef4444', bg: '#fee2e2' },
  in_progress: { color: '#3b82f6', bg: '#eff6ff' },
  closed:      { color: '#10b981', bg: '#ecfdf5' },
  cancelled:   { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
} as const
