'use client'

import Link from 'next/link'
// Header del review PSSR: breadcrumb, chips de estado, editor de fecha límite
// (autocontenido) y botones de acción — extraído de PssrReviewForm.tsx (Q4).

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updatePssrReviewDueDate } from '@/app/actions/pssr'
import { STATUS_KEY_MAP, STATUS_STYLES, type ReviewStatus } from './pssr-review-shared'
import { browserToday } from '@/lib/time/zone'
import { ink } from '@/lib/theme'

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
  const dueDateId = useId()
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
      const res = await updatePssrReviewDueDate({ reviewId: review.id, projectId, dueDate: value })
      if (res.error) { onError(res.error); return }
      setSavedDueDate(value ?? '')
      setEditingDueDate(false)
    })
  }

  const busy = isPending || datePending

  return (
    <div style={{ marginBottom: '24px' }}>
      <Link href={`/projects/${projectId}/pssr`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
        {t('backToList', { projectName })}
      </Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
              {review.review_number}
            </h1>
            <span style={{
              padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
              background: statusSty.bg, color: ink(statusSty.color),
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
            const today = browserToday()
            const isOverdue = !!(savedDueDate && savedDueDate < today && review.status !== 'approved')
            const canEditDate = canApprove && review.status !== 'approved'

            if (editingDueDate && canEditDate) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <label htmlFor={dueDateId} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('review.dueDateLabel')}
                  </label>
                  <input
                    id={dueDateId}
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={handleSaveDueDate}
                    disabled={busy}
                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'var(--success-500)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    {t('review.saveDate')}
                  </button>
                  <button
                    onClick={() => { setDueDate(savedDueDate); setEditingDueDate(false) }}
                    disabled={busy}
                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'var(--gray-100)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                  >
                    {t('review.cancelDate')}
                  </button>
                </div>
              )
            }

            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {t('review.dueDateLabel')}
                </span>
                {savedDueDate ? (
                  <span style={{
                    padding: '2px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                    background: isOverdue ? 'var(--danger-100)' : 'var(--gray-100)',
                    color: isOverdue ? 'var(--danger-700)' : 'var(--text-muted)',
                    border: `1px solid ${isOverdue ? 'var(--danger-200)' : 'var(--border)'}`,
                  }}>
                    {savedDueDate}{isOverdue ? t('review.overdueSuffix') : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                )}
                {canEditDate && (
                  <button
                    onClick={() => { setDueDate(savedDueDate); setEditingDueDate(true) }}
                    style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'transparent', color: 'var(--primary-700)', border: '1px solid var(--border)', cursor: 'pointer' }}
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
              background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-body)',
              textDecoration: 'none',
            }}
          >
            {t('review.downloadPdf')}
          </a>
          {review.status === 'approved' && review.rfsu_certificate_id && (
            <Link
              href={`/projects/${projectId}/certificates/${review.rfsu_certificate_id}`}
              style={{
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: 'var(--success-50)', border: '1px solid var(--success-200)', color: 'var(--success-800)',
                textDecoration: 'none',
              }}
            >
              {t('review.viewRfsu')}
            </Link>
          )}
          {(review.status === 'draft' || review.status === 'in_progress' || review.status === 'rejected') && !readonly && allResolved && (
            <button
              onClick={onSubmitForApproval}
              disabled={isPending}
              style={{
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: 'var(--warning-500)', color: '#fff', border: 'none',
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
                  background: 'var(--danger-50)', border: '1px solid var(--danger-200)', color: 'var(--danger-700)',
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
                  background: sigsCount === 0 ? 'var(--success-100)' : 'var(--success-500)', color: '#fff', border: 'none',
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
