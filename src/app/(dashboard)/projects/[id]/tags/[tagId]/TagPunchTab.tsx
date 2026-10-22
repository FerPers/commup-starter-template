'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createPunch } from '@/app/actions/punches'
import { PunchImpactAndGuide } from '@/components/punch/PunchCategoryGuide'
import type { PunchImpact } from '@/lib/punches/category-guide'
import { punchDisplayStatus } from '@/lib/punches/verification'
import { canRaisePunch } from '@/lib/constants/punch-roles'
import { PUNCH_CATEGORY_CFG as CATEGORY_CFG, PUNCH_STATUS_COLORS as STATUS_COLORS } from '@/lib/constants/status-colors'

// N1b: el detalle de cada punch es su página propia (/projects/[id]/punches/[punchId]); aquí la lista y el alta.

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
  resolved_at: string | null
  resolved_by: string | null
  resolved_by_profile: { full_name: string } | null
  raised_by: string | null
  impact: string | null
  startup_disposition: string | null
  category_reviewed_at: string | null
}

export type OrgMemberForPunch = {
  user_id: string
  profiles: { full_name: string } | null
}

// ── Main component ──────────────────────────────────────────────────────

export default function TagPunchTab({
  punches,
  projectId,
  tagId,
  orgMembers,
  currentUserRole,
  disciplineCode,
}: {
  punches: TagPunch[]
  projectId: string
  tagId: string
  orgMembers: OrgMemberForPunch[]
  currentUserRole: string
  disciplineCode: string | null
}) {
  const t = useTranslations('Tags')
  const tGuide = useTranslations('PunchGuide')
  const router = useRouter()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const canRaise = canRaisePunch(currentUserRole)
  const [filterCat, setFilterCat] = useState<'A' | 'B' | 'C' | ''>('')

  function refresh() { router.refresh() }

  const displayed = filterCat ? punches.filter(p => p.category === filterCat) : punches

  if (punches.length === 0 && !showCreateModal) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚑</div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-700)', margin: '0 0 6px' }}>{t('punches.emptyTitle')}</p>
        <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: '0 0 20px' }}>{t('punches.emptyMsg')}</p>
        {canRaise && <button
          onClick={() => setShowCreateModal(true)}
          style={{ padding: '9px 18px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          {t('punches.newPunch')}
        </button>}
        {showCreateModal && (
          <CreatePunchModal
            projectId={projectId}
            disciplineCode={disciplineCode}
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
            <button
              key={cat}
              type="button"
              aria-pressed={active}
              onClick={() => setFilterCat(prev => prev === cat ? '' : cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', minHeight: '36px', font: 'inherit',
                borderRadius: '8px', cursor: 'pointer',
                background: active ? cfg.bg : 'var(--card-bg)',
                border: `1.5px solid ${active ? cfg.color : cfg.border}`,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: cfg.color }}>{count}</span>
            </button>
          )
        })}
        <div style={{ marginLeft: 'auto' }}>
          {canRaise && <button
            onClick={() => setShowCreateModal(true)}
            style={{ padding: '6px 14px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            {t('punches.newPunch')}
          </button>}
        </div>
      </div>

      {/* Punch list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {displayed.map(punch => {
          const catCfg = CATEGORY_CFG[punch.category]
          const displayStatus = punchDisplayStatus(punch)
          const stColors = STATUS_COLORS[displayStatus] ?? STATUS_COLORS.open
          const stLabel = t(`punches.status.${displayStatus}` as Parameters<typeof t>[0])
          return (
            <Link
              key={punch.id}
              href={`/projects/${projectId}/punches/${punch.id}`}
              style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', borderLeft: `4px solid ${catCfg.color}` }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)', fontWeight: 600 }}>{punch.punch_number}</span>
                    <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}>{catCfg.label}</span>
                    <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: stColors.bg, color: stColors.color }}>{stLabel}</span>
                    {!punch.category_reviewed_at && punch.status !== 'closed' && punch.status !== 'cancelled' && (
                      <span style={{ fontSize: '10px', color: '#b45309' }}>{tGuide('unreviewedShort')}</span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-strong)', margin: '0 0 4px', lineHeight: '1.4' }}>{punch.description}</p>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--gray-400)', flexWrap: 'wrap' }}>
                    {punch.assigned_to_profile && <span>👤 {punch.assigned_to_profile.full_name}</span>}
                    {punch.target_date && <span>📅 {punch.target_date}</span>}
                    {punch.itr_id && <span>↗ ITR</span>}
                  </div>
                </div>
                <span aria-hidden style={{ fontSize: '11px', color: 'var(--gray-300)' }}>›</span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreatePunchModal
          projectId={projectId}
          tagId={tagId}
          orgMembers={orgMembers}
          disciplineCode={disciplineCode}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); refresh() }}
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
  disciplineCode,
  onClose,
  onCreated,
}: {
  projectId: string
  tagId: string
  orgMembers: OrgMemberForPunch[]
  disciplineCode: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const t = useTranslations('Tags')
  const tGuide = useTranslations('PunchGuide')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<'A' | 'B' | 'C'>('B')
  const [impact, setImpact] = useState<PunchImpact | null>(null)
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
    if (!impact) { setError(tGuide('impactRequired')); return }
    setError(null)
    startTransition(async () => {
      const res = await createPunch({
        projectId,
        tagId,
        category,
        impact,
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
      <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
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

        {/* Impacto obligatorio + guía de categorización (fase 4) */}
        <div style={{ marginBottom: '16px' }}>
          <PunchImpactAndGuide impact={impact} onImpact={setImpact} category={category} onCategory={setCategory} disciplineCode={disciplineCode} />
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
