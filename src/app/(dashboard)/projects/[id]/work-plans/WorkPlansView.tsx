'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  createWorkPlan,
  updateWorkPlanStatus,
  addWorkPlanItem,
  removeWorkPlanItem,
  deleteWorkPlan,
} from '@/app/actions/work-plans'

// ── Types ─────────────────────────────────────────────────────────────

type Discipline = { id: string; code: string; name: string; color: string }
type OrgMember  = { user_id: string; role: string; profiles: { full_name: string } | null }

type WpItem = {
  id: string
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold'
  remarks: string | null
  itrs: {
    id: string
    itr_number: string
    status: string
    progress_pct: number
    tags: { id: string; tag_number: string; description: string } | null
    itr_templates: { code: string; title: string } | null
  } | null
  assigned: { full_name: string } | null
}

type WorkPlan = {
  id: string
  plan_date: string
  status: 'draft' | 'published' | 'in_progress' | 'completed'
  notes: string | null
  project_id: string
  disciplines: { id: string; code: string; name: string; color: string } | null
  leader: { full_name: string } | null
  work_plan_items: WpItem[]
}

// ── Status styles ─────────────────────────────────────────────────────

const PLAN_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft:       { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  published:   { color: '#3b82f6', bg: '#eff6ff' },
  in_progress: { color: '#f59e0b', bg: '#fffbeb' },
  completed:   { color: '#10b981', bg: '#ecfdf5' },
}

const ITEM_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)' },
  in_progress: { color: '#3b82f6', bg: '#eff6ff' },
  completed:   { color: '#10b981', bg: '#ecfdf5' },
  on_hold:     { color: '#f59e0b', bg: '#fffbeb' },
}

const PAGE_SIZE = 50

// ── Component ─────────────────────────────────────────────────────────

export default function WorkPlansView({
  projectId,
  projectName,
  projectCode,
  disciplines,
  orgMembers,
  workPlans,
  canEdit,
  currentUserId: _currentUserId,
}: {
  projectId: string
  projectName: string
  projectCode: string
  disciplines: Discipline[]
  orgMembers: OrgMember[]
  workPlans: WorkPlan[]
  canEdit: boolean
  currentUserId: string
}) {
  const t  = useTranslations('WorkPlans')
  const tC = useTranslations('Common')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Filters
  const [filterDisc, setFilterDisc]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDate, setFilterDate]     = useState('')
  const [page, setPage]                 = useState(1)

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Create plan modal
  const [showCreate, setShowCreate]             = useState(false)
  const [createDisc, setCreateDisc]             = useState('')
  const [createDate, setCreateDate]             = useState(new Date().toISOString().slice(0, 10))
  const [createNotes, setCreateNotes]           = useState('')
  const [createError, setCreateError]           = useState<string | null>(null)
  const [createPending, startCreateTransition]  = useTransition()

  // Add item modal
  const [addItemPlanId, setAddItemPlanId]   = useState<string | null>(null)
  const [addItemItrId, setAddItemItrId]     = useState('')
  const [addItemUser, setAddItemUser]       = useState('')
  const [addItemError, setAddItemError]     = useState<string | null>(null)
  const [addItemPending, startAddTransition] = useTransition()
  const [availableItrs, setAvailableItrs]   = useState<Array<{ id: string; itr_number: string; tag_number: string; title: string }>>([])

  // ── Label maps ────────────────────────────────────────────────────

  const planStatusLabels: Record<string, string> = {
    draft:       t('planStatus.draft'),
    published:   t('planStatus.published'),
    in_progress: t('planStatus.in_progress'),
    completed:   t('planStatus.completed'),
  }

  const itemStatusLabels: Record<string, string> = {
    not_started: t('itemStatus.not_started'),
    in_progress: t('itemStatus.in_progress'),
    completed:   t('itemStatus.completed'),
    on_hold:     t('itemStatus.on_hold'),
  }

  // ── Derived ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return workPlans.filter(p => {
      if (filterDisc && p.disciplines?.id !== filterDisc) return false
      if (filterStatus && p.status !== filterStatus) return false
      if (filterDate && p.plan_date !== filterDate) return false
      return true
    })
  }, [workPlans, filterDisc, filterStatus, filterDate])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of workPlans) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [workPlans])

  const hasFilters = filterDisc || filterStatus || filterDate

  // ── Actions ───────────────────────────────────────────────────────

  function handleCreate() {
    if (!createDisc || !createDate) return
    setCreateError(null)
    startCreateTransition(async () => {
      const res = await createWorkPlan({
        projectId,
        disciplineId: createDisc,
        planDate: createDate,
        notes: createNotes || undefined,
      })
      if (res.error) { setCreateError(res.error); return }
      setShowCreate(false)
      setCreateDisc(''); setCreateNotes('')
      setCreateDate(new Date().toISOString().slice(0, 10))
      router.refresh()
    })
  }

  function handleStatusChange(planId: string, status: WorkPlan['status']) {
    startTransition(async () => {
      await updateWorkPlanStatus(planId, status)
      router.refresh()
    })
  }

  async function openAddItem(plan: WorkPlan) {
    setAddItemPlanId(plan.id)
    setAddItemItrId('')
    setAddItemUser('')
    setAddItemError(null)
    const resp = await fetch(`/api/itrs-for-plan?project_id=${plan.project_id}`, { cache: 'no-store' })
      .catch(() => null)
    if (resp?.ok) {
      const data = await resp.json() as Array<{ id: string; itr_number: string; tag_number: string; title: string }>
      setAvailableItrs(data)
    }
  }

  function handleAddItem() {
    if (!addItemPlanId || !addItemItrId || !addItemUser) return
    setAddItemError(null)
    startAddTransition(async () => {
      const res = await addWorkPlanItem({
        workPlanId: addItemPlanId,
        itrId: addItemItrId,
        assignedTo: addItemUser,
      })
      if (res.error) { setAddItemError(res.error); return }
      setAddItemPlanId(null)
      router.refresh()
    })
  }

  function handleRemoveItem(itemId: string) {
    if (!confirm(t('confirmRemoveItem'))) return
    startTransition(async () => {
      await removeWorkPlanItem(itemId)
      router.refresh()
    })
  }

  function handleDeletePlan(planId: string) {
    if (!confirm(t('confirmDeletePlan'))) return
    startTransition(async () => {
      await deleteWorkPlan(planId)
      router.refresh()
    })
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>

      {/* Breadcrumb + title */}
      <div style={{ marginBottom: '24px' }}>
        <a href={`/projects/${projectId}`} style={{ fontSize: '12px', color: '#94a3b8', textDecoration: 'none' }}>
          ← {projectCode} — {projectName}
        </a>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: '8px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{t('subtitleProject')}</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: '9px 18px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              {t('newPlan')}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {Object.entries(PLAN_STATUS_STYLE).map(([key, style]) => (
          <div
            key={key}
            onClick={() => { setFilterStatus(filterStatus === key ? '' : key); setPage(1) }}
            style={{
              padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
              background: filterStatus === key ? style.bg : 'var(--card-bg)',
              border: `1px solid ${filterStatus === key ? style.color + '40' : 'var(--border)'}`,
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: style.color }}>{counts[key] ?? 0}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{planStatusLabels[key]}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filterDisc}
          onChange={e => { setFilterDisc(e.target.value); setPage(1) }}
          style={selStyle}
        >
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
        </select>
        <input
          type="date"
          value={filterDate}
          onChange={e => { setFilterDate(e.target.value); setPage(1) }}
          style={selStyle}
        />
        {hasFilters && (
          <button
            onClick={() => { setFilterDisc(''); setFilterStatus(''); setFilterDate(''); setPage(1) }}
            style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {tC('clearFilters')}
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: workPlans.length })}
        </span>
      </div>

      {/* Table */}
      {paginated.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>
            {workPlans.length === 0 ? t('emptyNoPlans') : t('emptyNoMatch')}
          </p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 120px 110px 100px 32px', gap: '10px', padding: '10px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>{t('table.colDate')}</span>
            <span>{t('table.colDiscipline')}</span>
            <span>{t('table.colLeader')}</span>
            <span>{t('table.colItems')}</span>
            <span>{t('table.colStatus')}</span>
            <span></span>
            <span></span>
          </div>

          {paginated.map(plan => {
            const st         = PLAN_STATUS_STYLE[plan.status] ?? PLAN_STATUS_STYLE.draft
            const disc       = plan.disciplines
            const isExp      = expanded.has(plan.id)
            const doneItems  = plan.work_plan_items.filter(i => i.status === 'completed').length
            const totalItems = plan.work_plan_items.length

            return (
              <div key={plan.id}>
                {/* Plan row */}
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: '90px 1fr 1fr 120px 110px 100px 32px',
                    gap: '10px', padding: '12px 16px', borderBottom: isExp ? 'none' : '1px solid var(--gray-100)',
                    alignItems: 'center', cursor: 'pointer',
                    background: isExp ? 'var(--gray-50)' : 'var(--card-bg)',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => toggleExpand(plan.id)}
                >
                  {/* Fecha */}
                  <div style={{ fontSize: '12px', color: 'var(--gray-700)', fontFamily: 'ui-monospace, monospace' }}>
                    {plan.plan_date}
                  </div>

                  {/* Disciplina */}
                  <div>
                    {disc && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: disc.color, background: `${disc.color}15`, padding: '2px 8px', borderRadius: '4px' }}>
                        {disc.code} — {disc.name}
                      </span>
                    )}
                  </div>

                  {/* Líder */}
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {plan.leader?.full_name ?? '—'}
                  </div>

                  {/* Ítems */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--gray-700)', fontWeight: 600 }}>
                      {doneItems}/{totalItems}
                    </span>
                    {totalItems > 0 && (
                      <div style={{ flex: 1, height: '4px', background: 'var(--gray-100)', borderRadius: '2px', overflow: 'hidden', minWidth: '40px' }}>
                        <div style={{ height: '100%', width: `${Math.round((doneItems / totalItems) * 100)}%`, background: doneItems === totalItems ? '#10b981' : '#3b82f6', borderRadius: '2px' }} />
                      </div>
                    )}
                  </div>

                  {/* Estado */}
                  <div onClick={e => e.stopPropagation()}>
                    {canEdit ? (
                      <select
                        value={plan.status}
                        onChange={e => handleStatusChange(plan.id, e.target.value as WorkPlan['status'])}
                        style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: st.bg, color: st.color, border: `1px solid ${st.color}30`, fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        {Object.entries(PLAN_STATUS_STYLE).map(([k]) => (
                          <option key={k} value={k}>{planStatusLabels[k]}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: st.bg, color: st.color }}>
                        {planStatusLabels[plan.status]}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    {canEdit && (
                      <button
                        onClick={() => openAddItem(plan)}
                        style={{ padding: '4px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px', fontSize: '11px', color: '#16a34a', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleDeletePlan(plan.id)}
                        disabled={isPending}
                        style={{ padding: '4px 8px', background: 'var(--card-bg)', border: '1px solid #fecaca', borderRadius: '5px', fontSize: '11px', color: '#ef4444', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Expand arrow */}
                  <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
                    {isExp ? '▲' : '▼'}
                  </div>
                </div>

                {/* Expanded items */}
                {isExp && (
                  <div style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', padding: '0 16px 12px 16px' }}>
                    {plan.notes && (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0 12px', paddingLeft: '8px', borderLeft: '3px solid #e2e8f0' }}>
                        {plan.notes}
                      </p>
                    )}

                    {plan.work_plan_items.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#94a3b8', padding: '12px 0' }}>
                        {canEdit ? t('items.emptyCanAdd') : t('items.empty')}
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 90px 28px', gap: '10px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                          <span>{t('items.colItr')}</span>
                          <span>{t('items.colTag')}</span>
                          <span>{t('items.colAssigned')}</span>
                          <span>{t('items.colStatus')}</span>
                          <span></span>
                        </div>
                        {plan.work_plan_items.map(item => {
                          const ist = ITEM_STATUS_STYLE[item.status] ?? ITEM_STATUS_STYLE.not_started
                          const itr = item.itrs
                          return (
                            <div
                              key={item.id}
                              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 90px 28px', gap: '10px', padding: '8px 10px', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border)', alignItems: 'center' }}
                            >
                              <div>
                                {itr ? (
                                  <a
                                    href={itr.tags ? `/projects/${projectId}/tags/${itr.tags.id}/itrs/${itr.id}` : '#'}
                                    style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                                  >
                                    {itr.itr_number}
                                  </a>
                                ) : <span style={{ fontSize: '12px', color: '#94a3b8' }}>—</span>}
                              </div>
                              <div>
                                {itr?.tags && (
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-strong)' }}>{itr.tags.tag_number}</div>
                                )}
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{itr?.itr_templates?.title ?? '—'}</div>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.assigned?.full_name ?? '—'}
                              </div>
                              <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: ist.bg, color: ist.color, whiteSpace: 'nowrap' }}>
                                {itemStatusLabels[item.status]}
                              </span>
                              {canEdit && (
                                <button
                                  onClick={() => handleRemoveItem(item.id)}
                                  disabled={isPending}
                                  style={{ width: '22px', height: '22px', background: 'var(--card-bg)', border: '1px solid #fecaca', borderRadius: '4px', color: '#ef4444', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page === 1)}>{tC('prevPage')}</button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tC('page', { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtn(page === totalPages)}>{tC('nextPage')}</button>
        </div>
      )}

      {/* ── Create Plan Modal ───────────────────────────────────────── */}
      {showCreate && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('createModal.title')}</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>{t('createModal.discipline')}</label>
                <select value={createDisc} onChange={e => setCreateDisc(e.target.value)} style={inputStyle}>
                  <option value="">{t('createModal.disciplinePh')}</option>
                  {disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>{t('createModal.date')}</label>
                <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>{t('createModal.notes')} <span style={{ fontWeight: 400, color: '#94a3b8' }}>{t('createModal.notesOpt')}</span></label>
                <textarea
                  value={createNotes}
                  onChange={e => setCreateNotes(e.target.value)}
                  rows={3}
                  placeholder={t('createModal.notesPh')}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {createError && (
                <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: 0 }}>
                  {createError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  onClick={() => setShowCreate(false)}
                  style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {t('createModal.cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createDisc || !createDate || createPending}
                  style={{ padding: '9px 20px', background: !createDisc || !createDate || createPending ? '#93c5fd' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !createDisc || !createDate || createPending ? 'not-allowed' : 'pointer' }}
                >
                  {createPending ? t('createModal.creating') : t('createModal.create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Item Modal ──────────────────────────────────────────── */}
      {addItemPlanId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setAddItemPlanId(null) }}
        >
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('addItemModal.title')}</h2>
              <button onClick={() => setAddItemPlanId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>{t('addItemModal.itr')}</label>
                <select value={addItemItrId} onChange={e => setAddItemItrId(e.target.value)} style={inputStyle}>
                  <option value="">{t('addItemModal.itrPh')}</option>
                  {availableItrs.map(itr => (
                    <option key={itr.id} value={itr.id}>{itr.itr_number} — {itr.tag_number} — {itr.title}</option>
                  ))}
                </select>
                {availableItrs.length === 0 && (
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{t('addItemModal.itrLoading')}</p>
                )}
              </div>

              <div>
                <label style={labelStyle}>{t('addItemModal.assigned')}</label>
                <select value={addItemUser} onChange={e => setAddItemUser(e.target.value)} style={inputStyle}>
                  <option value="">{t('addItemModal.assignedPh')}</option>
                  {orgMembers.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.full_name ?? m.user_id} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              {addItemError && (
                <p style={{ fontSize: '12px', color: '#ef4444', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px', margin: 0 }}>
                  {addItemError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  onClick={() => setAddItemPlanId(null)}
                  style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {t('addItemModal.cancel')}
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!addItemItrId || !addItemUser || addItemPending}
                  style={{ padding: '9px 20px', background: !addItemItrId || !addItemUser || addItemPending ? '#93c5fd' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !addItemItrId || !addItemUser || addItemPending ? 'not-allowed' : 'pointer' }}
                >
                  {addItemPending ? t('addItemModal.adding') : t('addItemModal.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--gray-700)', background: 'var(--card-bg)', fontFamily: 'inherit', cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '6px',
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', background: disabled ? 'var(--gray-50)' : 'var(--card-bg)',
    border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px',
    color: disabled ? 'var(--gray-300)' : 'var(--text-strong)', cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
