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
import type { PssrCapacity } from '@/lib/constants/pssr'
import PssrPunchDisposition, { type SystemPunch } from './PssrPunchDisposition'
import type { ItemAction, ItemStatus, ReviewItem, ReviewStatus, Signature } from './pssr-review-shared'

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
    required_signatures: PssrCapacity[]
    submitted_by: string | null
    rejected_reason: string | null
  }
  items: ReviewItem[]
  signatures: Signature[]
  project: { id: string; name: string; code: string }
  currentUserId: string
  currentUserName: string
  canApprove: boolean
  /** Capacidades que el usuario puede firmar en el proyecto (S14). */
  signableCaps: PssrCapacity[]
  totalItems: number
  systemPunches: SystemPunch[]
  canEditPunches: boolean
  /** Acción vinculada por ítem (fase 5); llega del servidor y se refresca tras marcar «no». */
  itemActions: Record<string, ItemAction>
}

export default function PssrReviewForm({
  projectId, review, items: initialItems, signatures: initialSigs,
  project, currentUserId, currentUserName, canApprove, signableCaps,
  totalItems, systemPunches, canEditPunches, itemActions,
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
  // S16 (C-32): firmas que faltan y cuáles puede poner este usuario (no quien envió ni quien ya firmó).
  const signedCaps = new Set(sigs.map(s => s.capacity).filter(Boolean))
  const missingCaps = review.required_signatures.filter(c => !signedCaps.has(c))
  const myOpenCaps = review.status === 'pending_approval' && review.submitted_by !== currentUserId && !sigs.some(s => s.user_id === currentUserId)
    ? missingCaps.filter(c => signableCaps.includes(c)) : []
  const iAmSigner = sigs.some(s => s.user_id === currentUserId)
  const approvable = canApprove && review.submitted_by !== currentUserId && !iAmSigner

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
      } else if (status === 'no') {
        // El trigger creó la acción del tracker: refrescar para mostrar su chip.
        router.refresh()
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
      const res = await updatePssrReviewNotes({ reviewId: review.id, projectId, notes })
      if (res.error) setActionError(res.error)
    })
  }

  function handleSubmitForApproval() {
    setActionError(null)
    startTransition(async () => {
      const res = await submitPssrForApproval({ reviewId: review.id, projectId })
      if (res.error) { setActionError(res.error); return }
      router.refresh()
    })
  }

  function handleApprove() {
    setActionError(null)
    if (missingCaps.length > 0) {
      setActionError(t('review.errorMissingSignatures', { caps: missingCaps.map(c => t(`capacity.${c}`)).join(', ') }))
      return
    }
    startTransition(async () => {
      const res = await approvePssrAndIssueRfsu({ reviewId: review.id, projectId })
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
    const reason = window.prompt(t('review.rejectReasonPrompt'))?.trim() ?? ''
    if (reason.length < 3) { setActionError(t('review.rejectReasonRequired')); return }
    startTransition(async () => {
      const res = await rejectPssrReview({ reviewId: review.id, projectId, reason })
      if (res.error) { setActionError(res.error); return }
      router.refresh()
    })
  }

  function handleRemoveSig(sigId: string) {
    startTransition(async () => {
      const res = await removePssrSignature({ signatureId: sigId, reviewId: review.id, projectId })
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
        canApprove={approvable}
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

      {review.status === 'rejected' && review.rejected_reason && (
        <div role="status" style={{ padding: '12px 16px', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '13px', marginBottom: '16px' }}>
          {t('review.rejectedReason', { reason: review.rejected_reason })}
        </div>
      )}

      {/* Checklist items ─────────────────────────────────────── */}
      <PssrItemsChecklist
        projectId={projectId}
        items={items}
        itemActions={itemActions}
        readonly={readonly}
        onStatusChange={handleStatusChange}
        onFieldSave={handleFieldSave}
      />

      {/* Pendientes del sistema y disposición para el arranque (fase 4) */}
      <PssrPunchDisposition projectId={projectId} systemCode={review.systems?.code ?? null} punches={systemPunches} editable={canEditPunches && !readonly} />

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
        required={review.required_signatures}
        missing={missingCaps}
        canSign={myOpenCaps.length > 0}
        onOpenSign={() => setShowSignModal(true)}
        onRemoveSig={handleRemoveSig}
      />

      {/* Sign Modal ──────────────────────────────────────────── */}
      {showSignModal && (
        <PssrSignModal
          reviewId={review.id}
          projectId={projectId}
          currentUserName={currentUserName}
          capacities={myOpenCaps}
          onSigned={(sig) => { setSigs(prev => [...prev, sig]); setShowSignModal(false) }}
          onClose={() => setShowSignModal(false)}
        />
      )}
    </>
  )
}
