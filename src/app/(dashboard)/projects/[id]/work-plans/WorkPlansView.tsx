'use client'

import { useId, useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { browserToday } from '@/lib/time/zone'
import { DialogSurface, useAskDialog } from '@/components/ui'
import {
  createWorkPlan,
  updateWorkPlanStatus,
  addWorkPlanItem,
  removeWorkPlanItem,
  deleteWorkPlan,
} from '@/app/actions/work-plans'
import { alpha, ink } from '@/lib/theme'

// ── Types ─────────────────────────────────────────────────────────────

type Project    = { id: string; name: string; code: string }
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
  projects?: { id: string; name: string; code: string } | null
  disciplines: { id: string; code: string; name: string; color: string } | null
  leader: { full_name: string } | null
  work_plan_items: WpItem[]
}

// ── Status styles ─────────────────────────────────────────────────────

const PLAN_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft:       { color: 'var(--text-muted)',  bg: 'var(--gray-100)' },
  published:   { color: 'var(--primary-700)', bg: 'var(--primary-50)' },
  in_progress: { color: 'var(--warning-700)', bg: 'var(--warning-50)' },
  completed:   { color: 'var(--success-700)', bg: 'var(--success-50)' },
}

const ITEM_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  not_started: { color: 'var(--text-muted)',  bg: 'var(--gray-100)' },
  in_progress: { color: 'var(--primary-700)', bg: 'var(--primary-50)' },
  completed:   { color: 'var(--success-700)', bg: 'var(--success-50)' },
  on_hold:     { color: 'var(--warning-700)', bg: 'var(--warning-50)' },
}

const PAGE_SIZE = 50

// ── Component ─────────────────────────────────────────────────────────

// G-14: una sola vista para el proyecto y para «Todos los proyectos» (`projects` presente = alcance org:
// columna y filtro de proyecto, y el alta pide proyecto, por defecto el del contexto).
export default function WorkPlansView({
  projectId,
  projects,
  disciplines,
  orgMembers,
  workPlans,
  canEdit,
  currentUserId: _currentUserId,
}: {
  projectId: string
  projects?: Project[]
  disciplines: Discipline[]
  orgMembers: OrgMember[]
  workPlans: WorkPlan[]
  canEdit: boolean
  currentUserId: string
}) {
  const t  = useTranslations('WorkPlans')
  const tC = useTranslations('Common')
  const tA = useTranslations('AskDialog')
  const tX = useTranslations('A11y')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // G-08: diálogo propio
  const { dialog, confirm } = useAskDialog()
  const createTitleId = useId()
  const addItemTitleId = useId()
  const uid = useId()

  const allScope = projects !== undefined

  // Filters
  const [filterProject, setFilterProject] = useState('')
  const [filterDisc, setFilterDisc]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDate, setFilterDate]     = useState('')
  const [page, setPage]                 = useState(1)

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Create plan modal
  const [showCreate, setShowCreate]             = useState(false)
  const [createProject, setCreateProject]       = useState(projectId)
  const [createDisc, setCreateDisc]             = useState('')
  const [createDate, setCreateDate]             = useState(browserToday())
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
      if (filterProject && p.project_id !== filterProject) return false
      if (filterDisc && p.disciplines?.id !== filterDisc) return false
      if (filterStatus && p.status !== filterStatus) return false
      if (filterDate && p.plan_date !== filterDate) return false
      return true
    })
  }, [workPlans, filterProject, filterDisc, filterStatus, filterDate])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of workPlans) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [workPlans])

  const hasFilters = filterProject || filterDisc || filterStatus || filterDate
  const gridCols = allScope ? '100px 90px 1fr 1fr 120px 110px 100px 32px' : '90px 1fr 1fr 120px 110px 100px 32px'

  // ── Actions ───────────────────────────────────────────────────────

  function handleCreate() {
    if (!createProject || !createDisc || !createDate) return
    setCreateError(null)
    startCreateTransition(async () => {
      const res = await createWorkPlan({
        projectId: createProject,
        disciplineId: createDisc,
        planDate: createDate,
        notes: createNotes || undefined,
      })
      if (res.error) { setCreateError(res.error); return }
      setShowCreate(false)
      setCreateProject(projectId); setCreateDisc(''); setCreateNotes('')
      setCreateDate(browserToday())
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

  async function handleRemoveItem(itemId: string) {
    if (!(await confirm({ message: t('confirmRemoveItem'), confirmLabel: tA('remove'), danger: true }))) return
    startTransition(async () => {
      await removeWorkPlanItem(itemId)
      router.refresh()
    })
  }

  async function handleDeletePlan(planId: string) {
    if (!(await confirm({ message: t('confirmDeletePlan'), confirmLabel: tA('delete'), danger: true }))) return
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
    <div style={{ maxWidth: '1200px' }}>
      {dialog}

      {/* Título (N2c: el h1 es el del hub Planificación) */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{allScope ? t('subtitle') : t('subtitleProject')}</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: '9px 18px', background: 'var(--primary-600)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              {t('newPlan')}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {Object.entries(PLAN_STATUS_STYLE).map(([key, style]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filterStatus === key}
            onClick={() => { setFilterStatus(filterStatus === key ? '' : key); setPage(1) }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', font: 'inherit',
              padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
              background: filterStatus === key ? style.bg : 'var(--card-bg)',
              border: `1px solid ${filterStatus === key ? alpha(style.color, 25) : 'var(--border)'}`,
            }}
          >
            <span style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: ink(style.color) }}>{counts[key] ?? 0}</span>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{planStatusLabels[key]}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {allScope && (
          <select
            aria-label={t('table.colProject')}
            value={filterProject}
            onChange={e => { setFilterProject(e.target.value); setPage(1) }}
            style={selStyle}
          >
            <option value="">{t('filters.allProjects')}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        )}
        <select
          aria-label={t('table.colDiscipline')}
          value={filterDisc}
          onChange={e => { setFilterDisc(e.target.value); setPage(1) }}
          style={selStyle}
        >
          <option value="">{t('filters.allDisciplines')}</option>
          {disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
        </select>
        <input
          type="date"
          aria-label={t('table.colDate')}
          value={filterDate}
          onChange={e => { setFilterDate(e.target.value); setPage(1) }}
          style={selStyle}
        />
        {hasFilters && (
          <button
            onClick={() => { setFilterProject(''); setFilterDisc(''); setFilterStatus(''); setFilterDate(''); setPage(1) }}
            style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            {tC('clearFilters')}
          </button>
        )}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: workPlans.length })}
        </span>
      </div>

      {/* Table */}
      {paginated.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            {workPlans.length === 0 ? t('emptyNoPlans') : t('emptyNoMatch')}
          </p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '10px', padding: '10px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {allScope && <span>{t('table.colProject')}</span>}
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
                {/* Plan row — G-12: el clic en la fila despliega (ratón); con teclado, el botón de la flecha. Los
                    controles de la fila (enlace, estado, +, ✕) no despliegan: la fila ignora sus clics. */}
                <div
                  role="presentation"
                  style={{
                    display: 'grid', gridTemplateColumns: gridCols,
                    gap: '10px', padding: '12px 16px', borderBottom: isExp ? 'none' : '1px solid var(--gray-100)',
                    alignItems: 'center', cursor: 'pointer',
                    background: isExp ? 'var(--gray-50)' : 'var(--card-bg)',
                    transition: 'background 0.1s',
                  }}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('button, a, input, select, label')) return
                    toggleExpand(plan.id)
                  }}
                >
                  {allScope && (
                    <div>
                      {plan.projects && (
                        <Link
                          href={`/projects/${plan.projects.id}/work-plans`}
                          style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary-700)', background: 'var(--primary-50)', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '94px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={plan.projects.name}
                        >
                          {plan.projects.code}
                        </Link>
                      )}
                    </div>
                  )}

                  {/* Fecha */}
                  <div style={{ fontSize: '12px', color: 'var(--text-body)', fontFamily: 'ui-monospace, monospace' }}>
                    {plan.plan_date}
                  </div>

                  {/* Disciplina */}
                  <div>
                    {disc && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: ink(disc.color), background: alpha(disc.color, 8), padding: '2px 8px', borderRadius: '4px' }}>
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
                    <span style={{ fontSize: '12px', color: 'var(--text-body)', fontWeight: 600 }}>
                      {doneItems}/{totalItems}
                    </span>
                    {totalItems > 0 && (
                      <div style={{ flex: 1, height: '4px', background: 'var(--gray-100)', borderRadius: '2px', overflow: 'hidden', minWidth: '40px' }}>
                        <div style={{ height: '100%', width: `${Math.round((doneItems / totalItems) * 100)}%`, background: doneItems === totalItems ? 'var(--success-500)' : 'var(--primary-500)', borderRadius: '2px' }} />
                      </div>
                    )}
                  </div>

                  {/* Estado */}
                  <div>
                    {canEdit ? (
                      <select
                        aria-label={t('table.colStatus')}
                        value={plan.status}
                        onChange={e => handleStatusChange(plan.id, e.target.value as WorkPlan['status'])}
                        style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: st.bg, color: ink(st.color), border: `1px solid ${alpha(st.color, 19)}`, fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        {Object.entries(PLAN_STATUS_STYLE).map(([k]) => (
                          <option key={k} value={k}>{planStatusLabels[k]}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: st.bg, color: ink(st.color) }}>
                        {planStatusLabels[plan.status]}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {canEdit && (
                      <button
                        onClick={() => openAddItem(plan)}
                        aria-label={t('addItemModal.title')}
                        style={{ padding: '4px 8px', background: 'var(--success-50)', border: '1px solid var(--success-200)', borderRadius: '5px', fontSize: '11px', color: 'var(--success-700)', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleDeletePlan(plan.id)}
                        disabled={isPending}
                        aria-label={tA('delete')}
                        style={{ padding: '4px 8px', background: 'var(--card-bg)', border: '1px solid var(--danger-200)', borderRadius: '5px', fontSize: '11px', color: 'var(--danger-700)', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Expand arrow */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(plan.id)}
                    aria-expanded={isExp}
                    aria-label={`${t('table.colItems')} · ${plan.plan_date}`}
                    style={{ width: '100%', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}
                  >
                    {isExp ? '▲' : '▼'}
                  </button>
                </div>

                {/* Expanded items */}
                {isExp && (
                  <div style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', padding: '0 16px 12px 16px' }}>
                    {plan.notes && (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0 12px', paddingLeft: '8px', borderLeft: '3px solid var(--gray-200)' }}>
                        {plan.notes}
                      </p>
                    )}

                    {plan.work_plan_items.length === 0 ? (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px 0' }}>
                        {canEdit ? t('items.emptyCanAdd') : t('items.empty')}
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 90px 28px', gap: '10px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
                                {itr?.tags ? (
                                  <Link
                                    href={`/projects/${plan.project_id}/tags/${itr.tags.id}/itrs/${itr.id}`}
                                    style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary-700)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                                  >
                                    {itr.itr_number}
                                  </Link>
                                ) : <span style={{ fontSize: '12px', color: itr ? 'var(--primary-700)' : 'var(--text-muted)', fontWeight: itr ? 600 : 400, fontFamily: 'ui-monospace, monospace' }}>{itr?.itr_number ?? '—'}</span>}
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
                              <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: ist.bg, color: ink(ist.color), whiteSpace: 'nowrap' }}>
                                {itemStatusLabels[item.status]}
                              </span>
                              {canEdit && (
                                <button
                                  onClick={() => handleRemoveItem(item.id)}
                                  disabled={isPending}
                                  aria-label={tA('remove')}
                                  style={{ width: '22px', height: '22px', background: 'var(--card-bg)', border: '1px solid var(--danger-200)', borderRadius: '4px', color: 'var(--danger-700)', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
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
          role="presentation"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <DialogSurface onClose={() => setShowCreate(false)} labelledBy={createTitleId} style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 id={createTitleId} style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('createModal.title')}</h2>
              <button onClick={() => setShowCreate(false)} aria-label={tX('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {allScope && (
                <div>
                  <label htmlFor={`${uid}-c-project`} style={labelStyle}>{t('createModal.project')}</label>
                  <select id={`${uid}-c-project`} value={createProject} onChange={e => setCreateProject(e.target.value)} style={inputStyle}>
                    <option value="">{t('createModal.projectPh')}</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor={`${uid}-c-discipline`} style={labelStyle}>{t('createModal.discipline')}</label>
                <select id={`${uid}-c-discipline`} value={createDisc} onChange={e => setCreateDisc(e.target.value)} style={inputStyle}>
                  <option value="">{t('createModal.disciplinePh')}</option>
                  {disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor={`${uid}-c-date`} style={labelStyle}>{t('createModal.date')}</label>
                <input id={`${uid}-c-date`} type="date" value={createDate} onChange={e => setCreateDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label htmlFor={`${uid}-c-notes`} style={labelStyle}>{t('createModal.notes')} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{t('createModal.notesOpt')}</span></label>
                <textarea
                  id={`${uid}-c-notes`}
                  value={createNotes}
                  onChange={e => setCreateNotes(e.target.value)}
                  rows={3}
                  placeholder={t('createModal.notesPh')}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {createError && (
                <p style={{ fontSize: '12px', color: 'var(--danger-700)', padding: '8px 12px', background: 'var(--danger-100)', borderRadius: '6px', margin: 0 }}>
                  {createError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--gray-100)' }}>
                <button
                  onClick={() => setShowCreate(false)}
                  style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {t('createModal.cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createProject || !createDisc || !createDate || createPending}
                  style={{ padding: '9px 20px', background: !createProject || !createDisc || !createDate || createPending ? 'var(--primary-300)' : 'var(--primary-600)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !createProject || !createDisc || !createDate || createPending ? 'not-allowed' : 'pointer' }}
                >
                  {createPending ? t('createModal.creating') : t('createModal.create')}
                </button>
              </div>
            </div>
          </DialogSurface>
        </div>
      )}

      {/* ── Add Item Modal ──────────────────────────────────────────── */}
      {addItemPlanId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          role="presentation"
          onClick={e => { if (e.target === e.currentTarget) setAddItemPlanId(null) }}
        >
          <DialogSurface onClose={() => setAddItemPlanId(null)} labelledBy={addItemTitleId} style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 id={addItemTitleId} style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('addItemModal.title')}</h2>
              <button onClick={() => setAddItemPlanId(null)} aria-label={tX('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label htmlFor={`${uid}-a-itr`} style={labelStyle}>{t('addItemModal.itr')}</label>
                <select id={`${uid}-a-itr`} value={addItemItrId} onChange={e => setAddItemItrId(e.target.value)} style={inputStyle}>
                  <option value="">{t('addItemModal.itrPh')}</option>
                  {availableItrs.map(itr => (
                    <option key={itr.id} value={itr.id}>{itr.itr_number} — {itr.tag_number} — {itr.title}</option>
                  ))}
                </select>
                {availableItrs.length === 0 && (
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{t('addItemModal.itrLoading')}</p>
                )}
              </div>

              <div>
                <label htmlFor={`${uid}-a-assigned`} style={labelStyle}>{t('addItemModal.assigned')}</label>
                <select id={`${uid}-a-assigned`} value={addItemUser} onChange={e => setAddItemUser(e.target.value)} style={inputStyle}>
                  <option value="">{t('addItemModal.assignedPh')}</option>
                  {orgMembers.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.full_name ?? m.user_id} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              {addItemError && (
                <p style={{ fontSize: '12px', color: 'var(--danger-700)', padding: '8px 12px', background: 'var(--danger-100)', borderRadius: '6px', margin: 0 }}>
                  {addItemError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--gray-100)' }}>
                <button
                  onClick={() => setAddItemPlanId(null)}
                  style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {t('addItemModal.cancel')}
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!addItemItrId || !addItemUser || addItemPending}
                  style={{ padding: '9px 20px', background: !addItemItrId || !addItemUser || addItemPending ? 'var(--primary-300)' : 'var(--primary-600)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !addItemItrId || !addItemUser || addItemPending ? 'not-allowed' : 'pointer' }}
                >
                  {addItemPending ? t('addItemModal.adding') : t('addItemModal.add')}
                </button>
              </div>
            </div>
          </DialogSurface>
        </div>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-body)', background: 'var(--card-bg)', fontFamily: 'inherit', cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', marginBottom: '6px',
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', background: disabled ? 'var(--gray-50)' : 'var(--card-bg)',
    border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px',
    color: disabled ? 'var(--text-muted)' : 'var(--text-strong)', cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
