'use client'

// Header del review PSSR: breadcrumb, chips de estado, editor de fecha límite
// (autocontenido) y botones de acción — extraído de PssrReviewForm.tsx (Q4).

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updatePssrReviewDueDate } from '@/app/actions/pssr'
import { STATUS_KEY_MAP, STATUS_STYLES, type ReviewStatus } from './pssr-review-shared'

export default function PssrReviewHeader({
  projectId,
  review,
  projectName,
  canApprove,
  readonly,
  allResolved,
  sigsCount,
  isPending,
  onSubmitForApproval,
  onApprove,
  onReject,
  onError,
}: {
  projectId: string
  review: {
    id: string
    review_number: string
    title: string
    status: ReviewStatus
    review_due_date: string | null
    rfsu_certificate_id: string | null
    systems: { id: string; code: string; name: string } | null
  }
  projectName: string
  canApprove: boolean
  readonly: boolean
  allResolved: boolean
  sigsCount: number
  isPending: boolean
  onSubmitForApproval: () => void
  onApprove: () => void
  onReject: () => void
  onError: (msg: string) => void
}) {
  const t = useTranslations('PSSR')
  const [datePending, startDateTransition] = useTransition()
  const [dueDate, setDueDate] = useState(review.review_due_date ?? '')
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [savedDueDate, setSavedDueDate] = useState(review.review_due_date ?? '')

  const statusKey = STATUS_KEY_MAP[review.status]
  const statusSty = STATUS_STYLES[statusKey]
  const system = review.systems

  function handleSaveDueDate() {
    const value = dueDate || null
    startDateTransition(async () => {
      const res = await updatePssrReviewDueDate(review.id, projectId, value)
      if (res.error) { onError(res.error); return }
      setSavedDueDate(value ?? '')
      setEditingDueDate(false)
    })
  }

  const busy = isPending || datePending

  return (
    <div style={{ marginBottom: '24px' }}>
      <a href={`/projects/${projectId}/pssr`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
        {t('backToList', { projectName })}
      </a>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
              {review.review_number}
            </h1>
            <span style={{
              padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
              background: statusSty.bg, color: statusSty.color,
            }}>
              {t(`status.${statusKey}`)}
            </span>
            {system && (
              <span style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: 'var(--gray-100)', color: 'var(--text-muted)',
              }}>
                {system.code} — {system.name}
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{review.title}</p>

          {/* Due date chip / editor */}
          {(() => {
            const today = new Date().toISOString().split('T')[0]
            const isOverdue = !!(savedDueDate && savedDueDate < today && review.status !== 'approved')
            const canEditDate = canApprove && review.status !== 'approved'

            if (editingDueDate && canEditDate) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('review.dueDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={handleSaveDueDate}
                    disabled={busy}
                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    {t('review.saveDate')}
                  </button>
                  <button
                    onClick={() => { setDueDate(savedDueDate); setEditingDueDate(false) }}
                    disabled={busy}
                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'var(--gray-100)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                  >
                    {t('review.cancelDate')}
                  </button>
                </div>
              )
            }

            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {t('review.dueDateLabel')}
                </span>
                {savedDueDate ? (
                  <span style={{
                    padding: '2px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                    background: isOverdue ? '#fee2e2' : '#f1f5f9',
                    color: isOverdue ? '#dc2626' : 'var(--text-muted)',
                    border: `1px solid ${isOverdue ? '#fecaca' : 'var(--border)'}`,
                  }}>
                    {savedDueDate}{isOverdue ? t('review.overdueSuffix') : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                )}
                {canEditDate && (
                  <button
                    onClick={() => { setDueDate(savedDueDate); setEditingDueDate(true) }}
                    style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: 'transparent', color: 'var(--primary-500)', border: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    {savedDueDate ? t('review.editDate') : t('review.setDate')}
                  </button>
                )}
              </div>
            )
          })()}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a
            href={`/projects/${projectId}/pssr/${review.id}/pdf`}
            style={{
              padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--gray-700)',
              textDecoration: 'none',
            }}
          >
            {t('review.downloadPdf')}
          </a>
          {review.status === 'approved' && review.rfsu_certificate_id && (
            <a
              href={`/projects/${projectId}/certificates/${review.rfsu_certificate_id}`}
              style={{
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46',
                textDecoration: 'none',
              }}
            >
              {t('review.viewRfsu')}
            </a>
          )}
          {(review.status === 'draft' || review.status === 'in_progress' || review.status === 'rejected') && !readonly && allResolved && (
            <button
              onClick={onSubmitForApproval}
              disabled={isPending}
              style={{
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: '#f59e0b', color: '#fff', border: 'none',
                cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
              }}
            >
              {t('review.submitForApproval')}
            </button>
          )}
          {review.status === 'pending_approval' && canApprove && (
            <>
              <button
                onClick={onReject}
                disabled={isPending}
                style={{
                  padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {t('review.reject')}
              </button>
              <button
                onClick={onApprove}
                disabled={isPending || sigsCount === 0}
                title={sigsCount === 0 ? t('review.needsSignatureTooltip') : undefined}
                style={{
                  padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: sigsCount === 0 ? '#d1fae5' : '#10b981', color: '#fff', border: 'none',
                  cursor: isPending || sigsCount === 0 ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                }}
              >
                {t('review.approve')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
