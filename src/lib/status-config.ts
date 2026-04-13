/**
 * Shared status configuration for CommUp modules.
 *
 * Each entry has: color (text), bg (background), border, and an i18n key
 * so components can call t(entry.labelKey) to get the translated label.
 *
 * Usage example:
 *   import { ITR_STATUS_CONFIG } from '@/lib/status-config'
 *   const cfg = ITR_STATUS_CONFIG[itr.status] ?? ITR_STATUS_CONFIG.not_started
 *   <span style={{ color: cfg.color, background: cfg.bg }}>{t(cfg.labelKey)}</span>
 */

export interface StatusConfig {
  color: string
  bg: string
  border: string
  /** next-intl key within the relevant namespace (e.g. 'ItrList.status.notStarted') */
  labelKey: string
}

// ── ITR status ──────────────────────────────────────────────────

export const ITR_STATUS_CONFIG: Record<string, StatusConfig> = {
  not_started: {
    color: '#64748b',
    bg: '#f1f5f9',
    border: '#e2e8f0',
    labelKey: 'ItrList.statusNotStarted',
  },
  in_progress: {
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    labelKey: 'ItrList.statusInProgress',
  },
  completed: {
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    labelKey: 'ItrList.statusCompleted',
  },
  approved: {
    color: '#15803d',
    bg: '#dcfce7',
    border: '#86efac',
    labelKey: 'ItrList.statusApproved',
  },
  rejected: {
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    labelKey: 'ItrList.statusRejected',
  },
}

// ── Punch status ────────────────────────────────────────────────

export const PUNCH_STATUS_CONFIG: Record<string, StatusConfig> = {
  open: {
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    labelKey: 'PunchList.statusOpen',
  },
  in_progress: {
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    labelKey: 'PunchList.statusInProgress',
  },
  closed: {
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    labelKey: 'PunchList.statusClosed',
  },
  cancelled: {
    color: '#94a3b8',
    bg: '#f8fafc',
    border: '#e2e8f0',
    labelKey: 'PunchList.statusCancelled',
  },
}

// ── Punch category ──────────────────────────────────────────────

export const PUNCH_CATEGORY_CONFIG: Record<string, StatusConfig> = {
  A: {
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    labelKey: 'PunchList.categoryA',
  },
  B: {
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    labelKey: 'PunchList.categoryB',
  },
  C: {
    color: '#64748b',
    bg: '#f8fafc',
    border: '#e2e8f0',
    labelKey: 'PunchList.categoryC',
  },
}

// ── Certificate status ──────────────────────────────────────────

export const CERT_STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: {
    color: '#64748b',
    bg: '#f1f5f9',
    border: '#e2e8f0',
    labelKey: 'Certificates.statusPending',
  },
  in_review: {
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    labelKey: 'Certificates.statusInReview',
  },
  issued: {
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    labelKey: 'Certificates.statusIssued',
  },
  rejected: {
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    labelKey: 'Certificates.statusRejected',
  },
  revoked: {
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    labelKey: 'Certificates.statusRevoked',
  },
}

// ── Preservation plan status ────────────────────────────────────

export const PRESERVATION_PLAN_STATUS_CONFIG: Record<string, StatusConfig> = {
  active: {
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    labelKey: 'Preservation.planActive',
  },
  suspended: {
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    labelKey: 'Preservation.planSuspended',
  },
  completed: {
    color: '#64748b',
    bg: '#f1f5f9',
    border: '#e2e8f0',
    labelKey: 'Preservation.planCompleted',
  },
}

// ── Preservation result ─────────────────────────────────────────

export const PRESERVATION_RESULT_CONFIG: Record<string, StatusConfig> = {
  ok: {
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#86efac',
    labelKey: 'PreservationExecution.resultOkLabel',
  },
  nok: {
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fca5a5',
    labelKey: 'PreservationExecution.resultNokLabel',
  },
  na: {
    color: '#64748b',
    bg: '#f8fafc',
    border: '#e2e8f0',
    labelKey: 'PreservationExecution.resultNaLabel',
  },
}
