'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { transferPunchToOpsAction, updatePunchOpsStatusAction } from '@/app/actions/post-handover'

type Project = { id: string; name: string; code: string }
type TeamMember = { id: string; full_name: string }

type PendingPunch = {
  id: string
  project_id: string
  punch_number: string
  description: string
  priority: string
  subsystem_id: string
  tag_id: string | null
}

type OpsPunch = {
  project_id: string
  punch_id: string
  punch_number: string
  description: string
  priority: string
  post_handover_status: string | null
  transferred_at: string | null
  transferred_to_user_id: string | null
  ops_target_date: string | null
  ops_notes: string | null
  subsystem_code: string
  system_code: string
  system_name: string
  tag_number: string | null
  assigned_to_name: string | null
}

const OPS_STATES = [
  'in_progress_ops', 'deferred', 'resolved_ops', 'verified_ops', 'closed_final', 'cancelled_ops',
] as const

const btnPrimary: React.CSSProperties = {
  padding: '8px 14px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnOutline: React.CSSProperties = {
  padding: '6px 10px', background: 'white', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
  fontFamily: 'inherit', background: 'white',
}
const card: React.CSSProperties = {
  background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 20,
}

function statusPill(st: string | null): React.CSSProperties {
  const base = { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }
  if (!st) return { ...base, background: '#f1f5f9', color: '#475569' }
  if (st === 'closed_final')          return { ...base, background: '#dcfce7', color: '#166534' }
  if (st === 'verified_ops')          return { ...base, background: '#dbeafe', color: '#1e40af' }
  if (st === 'resolved_ops')          return { ...base, background: '#e0e7ff', color: '#3730a3' }
  if (st === 'in_progress_ops')       return { ...base, background: '#fef3c7', color: '#92400e' }
  if (st === 'deferred')              return { ...base, background: '#fef9c3', color: '#854d0e' }
  if (st === 'cancelled_ops')         return { ...base, background: '#fee2e2', color: '#991b1b' }
  if (st === 'transferred_to_ops')    return { ...base, background: '#ede9fe', color: '#5b21b6' }
  return { ...base, background: '#f1f5f9', color: '#475569' }
}

function fmt(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

export default function OpsPunchesView({
  projects, selectedProjectId, selectedStatus,
  pendingTransfer, opsPunches, team,
}: {
  projects: Project[]
  selectedProjectId: string | null
  selectedStatus: string | null
  pendingTransfer: PendingPunch[]
  opsPunches: OpsPunch[]
  team: TeamMember[]
}) {
  const router = useRouter()
  const t = useTranslations('OpsPunches')
  const [isPending, startTransition] = useTransition()
  const [error, setError]            = useState<string | null>(null)

  const [transferringId, setTransferringId]   = useState<string | null>(null)
  const [transferTo, setTransferTo]           = useState<string>('')
  const [targetDate, setTargetDate]           = useState<string>('')
  const [notes, setNotes]                     = useState<string>('')

  const [editingId, setEditingId]             = useState<string | null>(null)
  const [editStatus, setEditStatus]           = useState<string>('in_progress_ops')
  const [editNotes, setEditNotes]             = useState<string>('')
  const [editTargetDate, setEditTargetDate]   = useState<string>('')

  const kpi = {
    total:     opsPunches.length,
    inProg:    opsPunches.filter(p => p.post_handover_status === 'in_progress_ops').length,
    resolved:  opsPunches.filter(p => p.post_handover_status === 'resolved_ops').length,
    closed:    opsPunches.filter(p => p.post_handover_status === 'closed_final').length,
    overdue:   opsPunches.filter(p =>
      p.ops_target_date && p.post_handover_status !== 'closed_final' && new Date(p.ops_target_date) < new Date()
    ).length,
  }

  const updateQuery = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams()
    if (selectedProjectId) params.set('project_id', selectedProjectId)
    if (selectedStatus)    params.set('status', selectedStatus)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k); else params.set(k, v)
    }
    router.push('/ops/punches?' + params.toString())
  }

  const doTransfer = (punchId: string) => {
    setError(null)
    if (!transferTo) return setError(t('errors.pickUser'))
    startTransition(async () => {
      const res = await transferPunchToOpsAction({
        punchId,
        transferredTo: transferTo,
        opsTargetDate: targetDate || null,
        notes:         notes || null,
      })
      if (res.error) return setError(res.error)
      setTransferringId(null); setTransferTo(''); setTargetDate(''); setNotes('')
      router.refresh()
    })
  }

  const doUpdate = (punchId: string) => {
    setError(null)
    startTransition(async () => {
      const res = await updatePunchOpsStatusAction({
        punchId,
        newStatus:  editStatus,
        notes:      editNotes || null,
        targetDate: editTargetDate || null,
      })
      if (res.error) return setError(res.error)
      setEditingId(null); setEditNotes(''); setEditTargetDate('')
      router.refresh()
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{t('title')}</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>{t('subtitle')}</p>

      {/* Filters */}
      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{t('filter.project')}</div>
          <select
            style={{ ...input, minWidth: 260 }}
            value={selectedProjectId ?? ''}
            onChange={e => updateQuery({ project_id: e.target.value || null })}
          >
            <option value="">{t('filter.selectProject')}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{t('filter.status')}</div>
          <select
            style={{ ...input, minWidth: 200 }}
            value={selectedStatus ?? ''}
            onChange={e => updateQuery({ status: e.target.value || null })}
            disabled={!selectedProjectId}
          >
            <option value="">{t('filter.allStatuses')}</option>
            {['transferred_to_ops', ...OPS_STATES].map(s => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedProjectId && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: t('kpi.total'),     value: kpi.total,    color: '#0f172a' },
              { label: t('kpi.inProgress'),value: kpi.inProg,   color: '#92400e' },
              { label: t('kpi.resolved'),  value: kpi.resolved, color: '#3730a3' },
              { label: t('kpi.closed'),    value: kpi.closed,   color: '#166534' },
              { label: t('kpi.overdue'),   value: kpi.overdue,  color: '#991b1b' },
            ].map(k => (
              <div key={k.label} style={{ ...card, marginBottom: 0, padding: 14 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {error && (
            <div style={{
              padding: 10, background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 6, color: '#991b1b', fontSize: 13, marginBottom: 16,
            }}>{error}</div>
          )}

          {/* Pending to transfer */}
          <div style={card}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
              {t('pending.title')} <span style={{ color: '#64748b', fontWeight: 400 }}>({pendingTransfer.length})</span>
            </h2>
            {pendingTransfer.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>{t('pending.empty')}</div>
            )}
            {pendingTransfer.map(p => (
              <div key={p.id} style={{ borderTop: '1px solid #f1f5f9', padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.punch_number}</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>{p.description}</div>
                  </div>
                  <button style={btnOutline} onClick={() => {
                    setTransferringId(transferringId === p.id ? null : p.id)
                    setTransferTo(''); setTargetDate(''); setNotes('')
                  }}>
                    {transferringId === p.id ? t('actions.cancel') : t('actions.transfer')}
                  </button>
                </div>
                {transferringId === p.id && (
                  <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 6, display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8 }}>
                    <select style={input} value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                      <option value="">{t('form.selectUser')}</option>
                      {team.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                    <input style={input} type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} placeholder={t('form.targetDate')} />
                    <button style={btnPrimary} onClick={() => doTransfer(p.id)} disabled={isPending}>
                      {isPending ? '...' : t('actions.confirmTransfer')}
                    </button>
                    <textarea
                      style={{ ...input, gridColumn: '1 / -1', minHeight: 50, resize: 'vertical' }}
                      placeholder={t('form.notes')}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Ops dashboard */}
          <div style={card}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
              {t('tracking.title')} <span style={{ color: '#64748b', fontWeight: 400 }}>({opsPunches.length})</span>
            </h2>
            {opsPunches.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>{t('tracking.empty')}</div>
            )}
            {opsPunches.map(p => (
              <div key={p.punch_id} style={{ borderTop: '1px solid #f1f5f9', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{p.punch_number}</span>
                      <span style={statusPill(p.post_handover_status)}>{t(`status.${p.post_handover_status ?? 'active'}`)}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{p.system_code} · {p.subsystem_code}{p.tag_number ? ' · ' + p.tag_number : ''}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{p.description}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {t('tracking.owner')}: {p.assigned_to_name ?? '—'} · {t('tracking.transferred')}: {fmt(p.transferred_at)} · {t('tracking.targetDate')}: {p.ops_target_date ?? '—'}
                    </div>
                    {p.ops_notes && (
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 4, padding: 6, background: '#f8fafc', borderRadius: 4 }}>
                        {p.ops_notes}
                      </div>
                    )}
                  </div>
                  <button
                    style={btnOutline}
                    onClick={() => {
                      setEditingId(editingId === p.punch_id ? null : p.punch_id)
                      setEditStatus(p.post_handover_status ?? 'in_progress_ops')
                      setEditNotes('')
                      setEditTargetDate('')
                    }}
                    disabled={p.post_handover_status === 'closed_final'}
                  >
                    {editingId === p.punch_id ? t('actions.cancel') : t('actions.updateStatus')}
                  </button>
                </div>
                {editingId === p.punch_id && (
                  <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 6, display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8 }}>
                    <select style={input} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                      {OPS_STATES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                    </select>
                    <input style={input} type="date" value={editTargetDate} onChange={e => setEditTargetDate(e.target.value)} />
                    <button style={btnPrimary} onClick={() => doUpdate(p.punch_id)} disabled={isPending}>
                      {isPending ? '...' : t('actions.save')}
                    </button>
                    <textarea
                      style={{ ...input, gridColumn: '1 / -1', minHeight: 50, resize: 'vertical' }}
                      placeholder={t('form.notes')}
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!selectedProjectId && (
        <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>
          {t('filter.selectHint')}
        </div>
      )}
    </div>
  )
}
