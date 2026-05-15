'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createPunch, updatePunchStatus, closePunch, addPunchComment, reassignPunch } from '@/app/actions/punches'
import PunchPhotosSection from './PunchPhotosSection'

const REASSIGN_ROLES = ['owner', 'admin', 'architect', 'leader']

// ── Types ──────────────────────────────────────────────────────────────

export type TagPunch = {
  id: string
  punch_number: string
  category: 'A' | 'B' | 'C'
  description: string
  status: 'open' | 'in_progress' | 'closed' | 'cancelled'
  priority: 'critical' | 'major' | 'minor'
  target_date: string | null
  closed_date: string | null
  created_at: string
  itr_id: string | null
  assigned_to: string | null
  raised_by_profile: { full_name: string } | null
  assigned_to_profile: { full_name: string } | null
}

export type OrgMemberForPunch = {
  user_id: string
  profiles: { full_name: string } | null
}

// ── Config ──────────────────────────────────────────────────────────────

const CATEGORY_CFG = {
  A: { label: 'Cat A', color: '#ef4444', bg: '#fee2e2', border: '#fecaca' },
  B: { label: 'Cat B', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  C: { label: 'Cat C', color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)' },
} as const

const STATUS_COLORS = {
  open:        { color: '#ef4444', bg: '#fee2e2' },
  in_progress: { color: '#3b82f6', bg: '#eff6ff' },
  closed:      { color: '#10b981', bg: '#ecfdf5' },
  cancelled:   { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
} as const

// ── Main component ──────────────────────────────────────────────────────

export default function TagPunchTab({
  punches,
  projectId,
  tagId,
  orgMembers,
  currentUserRole,
}: {
  punches: TagPunch[]
  projectId: string
  tagId: string
  orgMembers: OrgMemberForPunch[]
  currentUserRole: string
}) {
  const t = useTranslations('Tags')
  const router = useRouter()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedPunch, setSelectedPunch] = useState<TagPunch | null>(null)
  const [filterCat, setFilterCat] = useState<'A' | 'B' | 'C' | ''>('')

  function refresh() { router.refresh() }

  const displayed = filterCat ? punches.filter(p => p.category === filterCat) : punches

  if (punches.length === 0 && !showCreateModal) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚑</div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-700)', margin: '0 0 6px' }}>{t('punches.emptyTitle')}</p>
        <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: '0 0 20px' }}>{t('punches.emptyMsg')}</p>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{ padding: '9px 18px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          {t('punches.newPunch')}
        </button>
        {showCreateModal && (
          <CreatePunchModal
            projectId={projectId}
            tagId={tagId}
            orgMembers={orgMembers}
            onClose={() => setShowCreateModal(false)}
            onCreated={() => { setShowCreateModal(false); refresh() }}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Summary pills (clickable — toggle category filter) */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {(['A', 'B', 'C'] as const).map(cat => {
          const cfg = CATEGORY_CFG[cat]
          const count = punches.filter(p => p.category === cat).length
          const active = filterCat === cat
          return (
            <div
              key={cat}
              onClick={() => setFilterCat(prev => prev === cat ? '' : cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                borderRadius: '8px', cursor: 'pointer',
                background: active ? cfg.bg : 'var(--card-bg)',
                border: `1.5px solid ${active ? cfg.color : cfg.border}`,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: cfg.color }}>{count}</span>
            </div>
          )
        })}
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{ padding: '6px 14px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            {t('punches.newPunch')}
          </button>
        </div>
      </div>

      {/* Punch list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {displayed.map(punch => {
          const catCfg = CATEGORY_CFG[punch.category]
          const stColors = STATUS_COLORS[punch.status] ?? STATUS_COLORS.open
          const stLabel = t(`punches.status.${punch.status}` as Parameters<typeof t>[0])
          return (
            <div
              key={punch.id}
              onClick={() => setSelectedPunch(punch)}
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', cursor: 'pointer', borderLeft: `4px solid ${catCfg.color}` }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)', fontWeight: 600 }}>{punch.punch_number}</span>
                    <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}>{catCfg.label}</span>
                    <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: stColors.bg, color: stColors.color }}>{stLabel}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-strong)', margin: '0 0 4px', lineHeight: '1.4' }}>{punch.description}</p>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--gray-400)', flexWrap: 'wrap' }}>
                    {punch.assigned_to_profile && <span>👤 {punch.assigned_to_profile.full_name}</span>}
                    {punch.target_date && <span>📅 {punch.target_date}</span>}
                    {punch.itr_id && <span>↗ ITR</span>}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--gray-300)' }}>›</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreatePunchModal
          projectId={projectId}
          tagId={tagId}
          orgMembers={orgMembers}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); refresh() }}
        />
      )}

      {/* Detail modal */}
      {selectedPunch && (
        <PunchDetailModal
          punch={selectedPunch}
          projectId={projectId}
          tagId={tagId}
          orgMembers={orgMembers}
          canReassign={REASSIGN_ROLES.includes(currentUserRole)}
          onClose={() => setSelectedPunch(null)}
          onUpdated={() => { setSelectedPunch(null); refresh() }}
        />
      )}
    </div>
  )
}

// ── Create Punch Modal ──────────────────────────────────────────────────

function CreatePunchModal({
  projectId,
  tagId,
  orgMembers,
  onClose,
  onCreated,
}: {
  projectId: string
  tagId: string
  orgMembers: OrgMemberForPunch[]
  onClose: () => void
  onCreated: () => void
}) {
  const t = useTranslations('Tags')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<'A' | 'B' | 'C'>('B')
  const [assignedTo, setAssignedTo] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const CREATE_CATS = {
    A: { color: '#ef4444', bg: '#fee2e2', border: '#fecaca', fullLabel: t('punches.create.catA') },
    B: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', fullLabel: t('punches.create.catB') },
    C: { color: 'var(--text-muted)', bg: 'var(--gray-50)', border: 'var(--border)', fullLabel: t('punches.create.catC') },
  }

  function handleSubmit() {
    if (!description.trim()) { setError(t('punches.create.errorRequired')); return }
    setError(null)
    startTransition(async () => {
      const res = await createPunch({
        projectId,
        tagId,
        category,
        description: description.trim(),
        assignedTo: assignedTo || null,
        targetDate: targetDate || null,
      })
      if (res.error) { setError(res.error); return }
      onCreated()
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 20px' }}>{t('punches.create.title')}</h2>

        {/* Category */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '8px' }}>{t('punches.create.labelCategory')}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['A', 'B', 'C'] as const).map(cat => {
              const cfg = CREATE_CATS[cat]
              const active = category === cat
              return (
                <button key={cat} onClick={() => setCategory(cat)} style={{ flex: 1, padding: '10px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, border: `2px solid ${active ? cfg.color : 'var(--border)'}`, background: active ? cfg.bg : 'var(--card-bg)', color: active ? cfg.color : 'var(--text-muted)', cursor: 'pointer', textAlign: 'center' }}>
                  {cfg.fullLabel}
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>{t('punches.create.labelDescription')}</label>
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('punches.create.descPlaceholder')}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>

        {/* Assigned to */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>{t('punches.create.labelAssigned')}</label>
          <select
            value={assignedTo}
            onChange={e => setAssignedTo(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', background: 'var(--card-bg)', fontFamily: 'inherit' }}
          >
            <option value="">{t('punches.create.noAssignee')}</option>
            {orgMembers.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name ?? m.user_id}</option>
            ))}
          </select>
        </div>

        {/* Target date */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>{t('punches.create.labelTargetDate')}</label>
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px' }}
          />
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '0 0 16px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            {t('punches.create.cancel')}
          </button>
          <button onClick={handleSubmit} disabled={isPending} style={{ padding: '9px 20px', background: isPending ? '#fed7aa' : '#ea580c', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: isPending ? 'default' : 'pointer' }}>
            {isPending ? t('punches.create.submitting') : t('punches.create.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Punch Detail Modal ──────────────────────────────────────────────────

function PunchDetailModal({
  punch,
  projectId,
  tagId,
  orgMembers,
  canReassign,
  onClose,
  onUpdated,
}: {
  punch: TagPunch
  projectId: string
  tagId: string
  orgMembers: OrgMemberForPunch[]
  canReassign: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const t = useTranslations('Tags')
  const [comment, setComment] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reassignTo, setReassignTo] = useState<string>(punch.assigned_to ?? '')
  const [photoCount, setPhotoCount] = useState<number | null>(null)

  const catCfg = CATEGORY_CFG[punch.category]
  const stColors = STATUS_COLORS[punch.status] ?? STATUS_COLORS.open
  const stLabel = t(`punches.status.${punch.status}` as Parameters<typeof t>[0])
  const isClosed = punch.status === 'closed' || punch.status === 'cancelled'
  const reassignDirty = (reassignTo || null) !== (punch.assigned_to ?? null)

  function handleStatusChange(newStatus: 'open' | 'in_progress' | 'closed' | 'cancelled') {
    if (newStatus === 'closed' && photoCount === 0) {
      if (!confirm(t('punches.photos.confirmCloseWithoutPhotos'))) return
    }
    startTransition(async () => {
      let res: { error?: string }
      if (newStatus === 'closed') {
        res = await closePunch({ punchId: punch.id, projectId, tagId, resolutionComment: comment || undefined })
      } else {
        res = await updatePunchStatus({ punchId: punch.id, status: newStatus, projectId, tagId })
      }
      if (res.error) { setError(res.error); return }
      onUpdated()
    })
  }

  function handleAddComment() {
    if (!comment.trim()) return
    startTransition(async () => {
      const res = await addPunchComment({ punchId: punch.id, comment: comment.trim(), projectId, tagId })
      if (res.error) { setError(res.error); return }
      setComment('')
      onUpdated()
    })
  }

  function handleReassign() {
    if (!reassignDirty) return
    setError(null)
    startTransition(async () => {
      const res = await reassignPunch({
        punchId: punch.id,
        projectId,
        tagId,
        newAssignee: reassignTo || null,
      })
      if (res.error) { setError(res.error); return }
      onUpdated()
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-muted)' }}>{punch.punch_number}</span>
              <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}>{catCfg.label}</span>
              <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: stColors.bg, color: stColors.color }}>{stLabel}</span>
            </div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: 0, lineHeight: '1.4' }}>{punch.description}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--gray-400)', cursor: 'pointer', padding: '0 0 0 12px' }}>✕</button>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', flexWrap: 'wrap' }}>
          {punch.raised_by_profile && <span><strong>{t('punches.detail.raisedBy')}</strong> {punch.raised_by_profile.full_name}</span>}
          {punch.assigned_to_profile && <span><strong>{t('punches.detail.assignedTo')}</strong> {punch.assigned_to_profile.full_name}</span>}
          {punch.target_date && <span><strong>{t('punches.detail.targetDate')}</strong> {punch.target_date}</span>}
          {punch.closed_date && <span><strong>{t('punches.detail.closedDate')}</strong> {punch.closed_date}</span>}
        </div>

        {/* Photos */}
        <PunchPhotosSection
          punchId={punch.id}
          projectId={projectId}
          tagId={tagId}
          onCountChange={setPhotoCount}
        />

        {/* Status actions */}
        {!isClosed && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '8px' }}>{t('punches.detail.changeStatus')}</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {punch.status !== 'in_progress' && (
                <button onClick={() => handleStatusChange('in_progress')} disabled={isPending} style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', cursor: 'pointer' }}>
                  {t('punches.detail.toInProgress')}
                </button>
              )}
              <button onClick={() => handleStatusChange('closed')} disabled={isPending} style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', cursor: 'pointer' }}>
                {t('punches.detail.close')}
              </button>
              <button onClick={() => handleStatusChange('cancelled')} disabled={isPending} style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, background: 'var(--gray-50)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {t('punches.detail.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Reassign */}
        {!isClosed && canReassign && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
              {t('punches.detail.labelReassign')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={reassignTo}
                onChange={e => setReassignTo(e.target.value)}
                disabled={isPending}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', background: 'var(--card-bg)', fontFamily: 'inherit' }}
              >
                <option value="">{t('punches.detail.reassignPlaceholder')}</option>
                {orgMembers.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name ?? m.user_id}</option>
                ))}
              </select>
              <button
                onClick={handleReassign}
                disabled={isPending || !reassignDirty}
                style={{
                  padding: '8px 14px',
                  background: reassignDirty && !isPending ? 'var(--primary-500)' : 'var(--gray-100)',
                  color: reassignDirty && !isPending ? '#fff' : 'var(--gray-400)',
                  border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                  cursor: reassignDirty && !isPending ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                }}
              >
                {isPending ? t('punches.detail.reassignSubmitting') : t('punches.detail.reassignBtn')}
              </button>
            </div>
          </div>
        )}

        {/* Comment */}
        {!isClosed && (
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
              {t('punches.detail.labelComment')}
            </label>
            <textarea
              rows={2}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('punches.detail.commentPlaceholder')}
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }}
            />
            <button onClick={handleAddComment} disabled={isPending || !comment.trim()} style={{ padding: '7px 14px', background: comment.trim() ? 'var(--primary-500)' : 'var(--gray-100)', color: comment.trim() ? '#fff' : 'var(--gray-400)', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: comment.trim() ? 'pointer' : 'default' }}>
              {t('punches.detail.addComment')}
            </button>
          </div>
        )}

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: '12px 0 0' }}>{error}</p>
        )}
      </div>
    </div>
  )
}