'use client'

import { useState, useEffect, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { getProjectPlanContext, addItrsToWorkPlan, createWorkPlanAndAddItrs } from '@/app/actions/work-plans'

// ── Types ─────────────────────────────────────────────────────────────

export type ModalItr = {
  id: string
  itrNumber: string
  tagNumber?: string
  defaultAssignedTo?: string
}

type PlanSummary = {
  id: string
  plan_date: string
  status: string
  disciplines: { code: string; name: string; color: string } | null
}

type Discipline = { id: string; code: string; name: string; color: string }

interface Props {
  projectId: string
  itrs: ModalItr[]
  members: Array<{ user_id: string; full_name: string }>
  onClose: () => void
  onSuccess: () => void
}

// ── Status style ──────────────────────────────────────────────────────

const PLAN_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft:       { color: '#64748b', bg: '#f1f5f9' },
  published:   { color: '#3b82f6', bg: '#eff6ff' },
  in_progress: { color: '#f59e0b', bg: '#fffbeb' },
}

// ── Component ─────────────────────────────────────────────────────────

export default function AddToWorkPlanModal({ projectId, itrs, members, onClose, onSuccess }: Props) {
  const t = useTranslations('WorkPlans')

  // Context loaded from server
  const [loading, setLoading]           = useState(true)
  const [plans, setPlans]               = useState<PlanSummary[]>([])
  const [disciplines, setDisciplines]   = useState<Discipline[]>([])

  // Mode
  const [mode, setMode] = useState<'existing' | 'new'>('existing')

  // Existing plan form
  const [selectedPlanId, setSelectedPlanId] = useState('')

  // New plan form
  const [newDisc, setNewDisc]   = useState('')
  const [newDate, setNewDate]   = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes] = useState('')

  // Per-ITR assigned_to (keyed by itr.id)
  const [assigned, setAssigned] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const itr of itrs) {
      map[itr.id] = itr.defaultAssignedTo ?? ''
    }
    return map
  })

  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)

  // Load plans + disciplines on mount
  useEffect(() => {
    void getProjectPlanContext(projectId).then(data => {
      setPlans(data.plans)
      setDisciplines(data.disciplines)
      setLoading(false)
      if (data.plans.length === 0) setMode('new')
    })
  }, [projectId])

  function setAssignedFor(itrId: string, userId: string) {
    setAssigned(prev => ({ ...prev, [itrId]: userId }))
  }

  const allAssigned = itrs.every(itr => !!assigned[itr.id])
  const canSubmit = allAssigned && !isPending &&
    (mode === 'existing' ? !!selectedPlanId : !!newDisc && !!newDate)

  function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    const items = itrs.map(itr => ({ itrId: itr.id, assignedTo: assigned[itr.id] }))

    startTransition(async () => {
      if (mode === 'existing') {
        const res = await addItrsToWorkPlan(selectedPlanId, items)
        if (res.error) { setError(res.error); return }
      } else {
        const res = await createWorkPlanAndAddItrs({
          projectId,
          disciplineId: newDisc,
          planDate: newDate,
          notes: newNotes || undefined,
          items,
        })
        if (res.error) { setError(res.error); return }
      }
      onSuccess()
    })
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('addToPlanModal.title')}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}>✕</button>
        </div>

        {loading ? (
          <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>
            {t('addToPlanModal.loading')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '6px', padding: '4px', background: '#f1f5f9', borderRadius: '10px' }}>
              {(['existing', 'new'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={m === 'existing' && plans.length === 0}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: '7px', border: 'none', fontSize: '12px', fontWeight: 600,
                    cursor: m === 'existing' && plans.length === 0 ? 'not-allowed' : 'pointer',
                    background: mode === m ? 'white' : 'transparent',
                    color: mode === m ? '#0f172a' : (m === 'existing' && plans.length === 0 ? '#cbd5e1' : '#64748b'),
                    boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {m === 'existing' ? t('addToPlanModal.modeExisting') : t('addToPlanModal.modeNew')}
                  {m === 'existing' && plans.length === 0 && (
                    <span style={{ marginLeft: '6px', fontSize: '10px', color: '#94a3b8' }}>({t('addToPlanModal.noPlans')})</span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Existing plan form ── */}
            {mode === 'existing' && (
              <div>
                <label style={labelStyle}>{t('addToPlanModal.selectPlanLabel')}</label>
                <select
                  value={selectedPlanId}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">{t('addToPlanModal.selectPlanPh')}</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.plan_date} — {p.disciplines?.code ?? '?'} {p.disciplines?.name ?? ''} [{p.status}]
                    </option>
                  ))}
                </select>
                {/* Plan status chips */}
                {selectedPlanId && (() => {
                  const plan = plans.find(p => p.id === selectedPlanId)
                  if (!plan) return null
                  const st = PLAN_STATUS_STYLE[plan.status] ?? PLAN_STATUS_STYLE.draft
                  return (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                      {plan.disciplines && (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: plan.disciplines.color, background: `${plan.disciplines.color}15`, padding: '2px 8px', borderRadius: '4px' }}>
                          {plan.disciplines.code}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: '4px' }}>
                        {plan.status}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── New plan form ── */}
            {mode === 'new' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{t('createModal.discipline')}</label>
                  <select value={newDisc} onChange={e => setNewDisc(e.target.value)} style={inputStyle}>
                    <option value="">{t('createModal.disciplinePh')}</option>
                    {disciplines.map(d => (
                      <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t('createModal.date')}</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>
                    {t('createModal.notes')} <span style={{ fontWeight: 400, color: '#94a3b8' }}>{t('createModal.notesOpt')}</span>
                  </label>
                  <textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    rows={2}
                    placeholder={t('createModal.notesPh')}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

            {/* ── ITRs to add ── */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                {t('addToPlanModal.itrsToAdd', { count: itrs.length })}
              </div>

              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <span>{t('addToPlanModal.colItr')}</span>
                <span>{t('addToPlanModal.colAssigned')}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {itrs.map(itr => (
                  <div
                    key={itr.id}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '8px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', alignItems: 'center' }}
                  >
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{itr.itrNumber}</div>
                      {itr.tagNumber && (
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{itr.tagNumber}</div>
                      )}
                    </div>
                    <select
                      value={assigned[itr.id] ?? ''}
                      onChange={e => setAssignedFor(itr.id, e.target.value)}
                      style={{ padding: '6px 8px', border: `1px solid ${assigned[itr.id] ? '#e2e8f0' : '#fca5a5'}`, borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', background: 'white', color: '#0f172a' }}
                    >
                      <option value="">{t('addToPlanModal.assignPh')}</option>
                      {members.map(m => (
                        <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: 0 }}>
                {error}
              </p>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={onClose}
                style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
              >
                {t('addToPlanModal.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  padding: '9px 20px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: canSubmit ? '#3b82f6' : '#93c5fd',
                  color: 'white',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {isPending
                  ? t('addToPlanModal.submitting')
                  : mode === 'new'
                    ? t('addToPlanModal.submitNew')
                    : t('addToPlanModal.submit')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#0f172a', background: 'white', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px',
}
