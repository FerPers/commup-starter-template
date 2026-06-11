'use client'

// Review PSSR — orquestador (Q4). Estado de items/firmas + handlers contra el
// contrato { error } de actions/pssr.ts; la UI vive en PssrReviewHeader,
// PssrItemsChecklist, PssrSignaturesPanel y PssrSignModal.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  updatePssrReviewItem,
  updatePssrReviewNotes,
  submitPssrForApproval,
  removePssrSignature,
  approvePssrAndIssueRfsu,
  rejectPssrReview,
} from '@/app/actions/pssr'
import PssrReviewHeader from './PssrReviewHeader'
import PssrItemsChecklist from './PssrItemsChecklist'
import PssrSignaturesPanel from './PssrSignaturesPanel'
import PssrSignModal from './PssrSignModal'
import type { ItemStatus, ReviewItem, ReviewStatus, Signature } from './pssr-review-shared'

interface Props {
  projectId: string
  review: {
    id: string
    review_number: string
    title: string
    status: ReviewStatus
    notes: string | null
    review_due_date: string | null
    rfsu_certificate_id: string | null
    systems: { id: string; code: string; name: string } | null
    approved_at: string | null
  }
  items: ReviewItem[]
  signatures: Signature[]
  project: { id: string; name: string; code: string }
  currentUserId: string
  currentUserName: string
  canApprove: boolean
  totalItems: number
}

export default function PssrReviewForm({
  projectId, review, items: initialItems, signatures: initialSigs,
  project, currentUserId, currentUserName, canApprove,
  totalItems,
}: Props) {
  const t = useTranslations('PSSR')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState(initialItems)
  const [sigs, setSigs] = useState(initialSigs)
  const [notes, setNotes] = useState(review.notes ?? '')
  const [showSignModal, setShowSignModal] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const readonly = review.status === 'approved'

  // Computed progress from local state
  const localResolved = items.filter(i => i.status === 'si' || i.status === 'na').length
  const localPct = totalItems > 0 ? Math.round((localResolved / totalItems) * 100) : 0
  const localAllResolved = totalItems > 0 && localResolved === totalItems

  function handleStatusChange(item: ReviewItem, status: ItemStatus) {
    if (readonly) return
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i))
    startTransition(async () => {
      const res = await updatePssrReviewItem({ itemId: item.id, reviewId: review.id, projectId, status })
      if (res.error) {
        // Revert
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: item.status } : i))
      }
    })
  }

  function handleFieldSave(item: ReviewItem, field: 'responsible' | 'actions' | 'completion_date', value: string) {
    if (readonly) return
    startTransition(async () => {
      const res = await updatePssrReviewItem({
        itemId: item.id, reviewId: review.id, projectId,
        [field === 'responsible' ? 'responsible' : field === 'actions' ? 'actions' : 'completionDate']: value || null,
      })
      if (res.error) setActionError(res.error)
    })
  }

  function handleSaveNotes() {
    startTransition(async () => {
      const res = await updatePssrReviewNotes(review.id, projectId, notes)
      if (res.error) setActionError(res.error)
    })
  }

  function handleSubmitForApproval() {
    setActionError(null)
    startTransition(async () => {
      const res = await submitPssrForApproval(review.id, projectId)
      if (res.error) { setActionError(res.error); return }
      router.refresh()
    })
  }

  function handleApprove() {
    setActionError(null)
    if (sigs.length === 0) {
      setActionError(t('review.errorNeedsSignature'))
      return
    }
    startTransition(async () => {
      const res = await approvePssrAndIssueRfsu(review.id, projectId)
      if (res.error ?? !res.cert) {
        setActionError(res.error ?? t('review.errorGeneric'))
        return
      }
      setActionSuccess(t('review.approveSuccess', { certNumber: res.cert.certificate_number }))
      router.refresh()
    })
  }

  function handleReject() {
    if (!confirm(t('review.rejectConfirm'))) return
    const reason = window.prompt(t('review.rejectReasonPrompt')) ?? undefined
    startTransition(async () => {
      const res = await rejectPssrReview(review.id, projectId, reason)
      if (res.error) { setActionError(res.error); return }
      router.refresh()
    })
  }

  function handleRemoveSig(sigId: string) {
    startTransition(async () => {
      const res = await removePssrSignature(sigId, review.id, projectId)
      if (res.error) { setActionError(res.error); return }
      setSigs(prev => prev.filter(s => s.id !== sigId))
    })
  }

  return (
    <>
      {/* Back + Header ───────────────────────────────────────── */}
      <PssrReviewHeader
        projectId={projectId}
        review={review}
        projectName={project.name}
        canApprove={canApprove}
        readonly={readonly}
        allResolved={localAllResolved}
        sigsCount={sigs.length}
        isPending={isPending}
        onSubmitForApproval={handleSubmitForApproval}
        onApprove={handleApprove}
        onReject={handleReject}
        onError={setActionError}
      />

      {/* Progress bar ────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
        padding: '16px 24px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{t('review.progressLabel')}</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: localPct === 100 ? 'var(--success-500)' : 'var(--text-strong)' }}>
              {t('review.progressCount', { resolved: localResolved, total: totalItems })}
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              background: localPct === 100 ? '#10b981' : '#f59e0b',
              width: `${localPct}%`, transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
        <span style={{
          fontSize: '20px', fontWeight: 800,
          color: localPct === 100 ? '#10b981' : '#f59e0b', minWidth: '48px', textAlign: 'right',
        }}>
          {localPct}%
        </span>
      </div>

      {/* Action error/success ────────────────────────────────── */}
      {actionError && (
        <div style={{
          padding: '12px 16px', borderRadius: '10px', background: '#fef2f2',
          border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px', fontWeight: 500,
          marginBottom: '16px',
        }}>
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div style={{
          padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5',
          border: '1px solid #a7f3d0', color: '#065f46', fontSize: '13px', fontWeight: 500,
          marginBottom: '16px',
        }}>
          {actionSuccess}
        </div>
      )}

      {/* Checklist items ─────────────────────────────────────── */}
      <PssrItemsChecklist
        items={items}
        readonly={readonly}
        onStatusChange={handleStatusChange}
        onFieldSave={handleFieldSave}
      />

      {/* Notes ───────────────────────────────────────────────── */}
      {!readonly && (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
          padding: '20px 24px', marginBottom: '20px',
        }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '8px' }}>
            {t('review.notesLabel')}
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            rows={3}
            placeholder={t('review.notesPlaceholder')}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1.5px solid var(--border)', fontSize: '13px', outline: 'none',
              resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text-strong)',
            }}
          />
        </div>
      )}

      {/* Signatures ──────────────────────────────────────────── */}
      <PssrSignaturesPanel
        sigs={sigs}
        reviewStatus={review.status}
        readonly={readonly}
        currentUserId={currentUserId}
        onOpenSign={() => setShowSignModal(true)}
        onRemoveSig={handleRemoveSig}
      />

      {/* Sign Modal ──────────────────────────────────────────── */}
      {showSignModal && (
        <PssrSignModal
          reviewId={review.id}
          projectId={projectId}
          currentUserName={currentUserName}
          onSigned={(sig) => { setSigs(prev => [...prev, sig]); setShowSignModal(false) }}
          onClose={() => setShowSignModal(false)}
        />
      )}
    </>
  )
}
