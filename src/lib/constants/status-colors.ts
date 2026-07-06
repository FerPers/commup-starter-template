// Canonical ITR status palette (color + background) shared across ITR/certificate views.
// Labels stay local to each view (i18n via next-intl). Other status families
// (tag status with on_hold, work-plan amber, punch open/closed, PSSR) intentionally
// keep their own palettes — they are not interchangeable with this one.
export const ITR_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_progress: { color: '#3b82f6', bg: '#eff6ff' },
  completed:   { color: '#10b981', bg: '#ecfdf5' },
  approved:    { color: '#7c3aed', bg: '#f5f3ff' },
  rejected:    { color: '#ef4444', bg: '#fee2e2' },
}
