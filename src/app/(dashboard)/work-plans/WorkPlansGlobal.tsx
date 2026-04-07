'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createWorkPlan,
  updateWorkPlanStatus,
  addWorkPlanItem,
  removeWorkPlanItem,
  deleteWorkPlan,
} from '@/app/actions/work-plans'

// ── Types ─────────────────────────────────────────────────────────────

type Project    = { id: string; name: string; code: string; status: string }
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
  projects: { id: string; name: string; code: string } | null
  disciplines: { id: string; code: string; name: string; color: string } | null
  leader: { full_name: string } | null
  work_plan_items: WpItem[]
}

// ── Status configs ─────────────────────────────────────────────────

const PLAN_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Borrador',    color: '#64748b', bg: '#f1f5f9' },
  published:   { label: 'Publicado',   color: '#3b82f6', bg: '#eff6ff' },
  in_progress: { label: 'En progreso', color: '#f59e0b', bg: '#fffbeb' },
  completed:   { label: 'Completado',  color: '#10b981', bg: '#ecfdf5' },
}

const ITEM_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Sin iniciar', color: '#64748b', bg: '#f1f5f9' },
  in_progress: { label: 'En progreso', color: '#3b82f6', bg: '#eff6ff' },
  completed:   { label: 'Completado',  color: '#10b981', bg: '#ecfdf5' },
  on_hold:     { label: 'En pausa',    color: '#f59e0b', bg: '#fffbeb' },
}

const PAGE_SIZE = 50

// ── Component ─────────────────────────────────────────────────────────

export default function WorkPlansGlobal({
  projects,
  disciplines,
  orgMembers,
  workPlans,
  canEdit,
  currentUserId,
}: {
  projects: Project[]
  disciplines: Discipline[]
  orgMembers: OrgMember[]
  workPlans: WorkPlan[]
  canEdit: boolean
  currentUserId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Filters
  const [filterProject, setFilterProject]   = useState('')
  const [filterDisc, setFilterDisc]         = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterDate, setFilterDate]         = useState('')
  const [page, setPage]                     = useState(1)

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Create plan modal
  const [showCreate, setShowCreate] = useState(false)
  const [createProject, setCreateProject]   = useState('')
  const [createDisc, setCreateDisc]         = useState('')
  const [createDate, setCreateDate]         = useState(new Date().toISOString().slice(0, 10))
  const [createNotes, setCreateNotes]       = useState('')
  const [createError, setCreateError]       = useState<string | null>(null)
  const [createPending, startCreateTransition] = useTransition()

  // Add item modal
  const [addItemPlanId, setAddItemPlanId]   = useState<string | null>(null)
  const [addItemItrId, setAddItemItrId]     = useState('')
  const [addItemUser, setAddItemUser]       = useState('')
  const [addItemError, setAddItemError]     = useState<string | null>(null)
  const [addItemPending, startAddTransition] = useTransition()

  // Available ITRs for selected plan
  const [availableItrs, setAvailableItrs]   = useState<Array<{ id: string; itr_number: string; tag_number: string; title: string }>>([])

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
      setCreateProject(''); setCreateDisc(''); setCreateNotes('')
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
    // Fetch ITRs for this project
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
    if (!confirm('¿Quitar este ITR del plan?')) return
    startTransition(async () => {
      await removeWorkPlanItem(itemId)
      router.refresh()
    })
  }

  function handleDeletePlan(planId: string) {
    if (!confirm('¿Eliminar este plan de trabajo y todos sus ítems?')) return
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
    <div style={{ padding: '32px', maxWidth: '1300px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Planes de Trabajo</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Todos los proyectos de la organización</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ padding: '9px 18px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Nuevo plan
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {Object.entries(PLAN_STATUS).map(([key, cfg]) => (
          <div
            key={key}
            onClick={() => { setFilterStatus(filterStatus === key ? '' : key); setPage(1) }}
            style={{
              padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
              background: filterStatus === key ? cfg.bg : 'white',
              border: `1px solid ${filterStatus === key ? cfg.color + '40' : '#e2e8f0'}`,
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: cfg.color }}>{counts[key] ?? 0}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{cfg.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filterProject}
          onChange={e => { setFilterProject(e.target.value); setPage(1) }}
          style={selStyle}
        >
          <option value="">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select
          value={filterDisc}
          onChange={e => { setFilterDisc(e.target.value); setPage(1) }}
          style={selStyle}
        >
          <option value="">Todas las disciplinas</option>
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
            onClick={() => { setFilterProject(''); setFilterDisc(''); setFilterStatus(''); setFilterDate(''); setPage(1) }}
            style={{ padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
          >
            Limpiar filtros
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
          {filtered.length} de {workPlans.length} planes
        </span>
      </div>

      {/* Table */}
      {paginated.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>
            {workPlans.length === 0
              ? 'No hay planes de trabajo. Crea el primero.'
              : 'No hay planes que coincidan con los filtros.'}
          </p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>

          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 90px 1fr 1fr 120px 110px 100px 32px', gap: '10px', padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Proyecto</span>
            <span>Fecha</span>
            <span>Disciplina</span>
            <span>Líder</span>
            <span>Ítems</span>
            <span>Estado</span>
            <span></span>
            <span></span>
          </div>

          {paginated.map(plan => {
            const st        = PLAN_STATUS[plan.status] ?? PLAN_STATUS.draft
            const disc      = plan.disciplines
            const isExp     = expanded.has(plan.id)
            const doneItems = plan.work_plan_items.filter(i => i.status === 'completed').length
            const totalItems = plan.work_plan_items.length

            return (
              <div key={plan.id}>
                {/* Plan row */}
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: '100px 90px 1fr 1fr 120px 110px 100px 32px',
                    gap: '10px', padding: '12px 16px', borderBottom: isExp ? 'none' : '1px solid #f8fafc',
                    alignItems: 'center', cursor: 'pointer',
                    background: isExp ? '#fafbfc' : 'white',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => toggleExpand(plan.id)}
                >
                  {/* Proyecto */}
                  <div>
                    {plan.projects && (
                      <a
                        href={`/projects/${plan.projects.id}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '94px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={plan.projects.name}
                      >
                        {plan.projects.code}
                      </a>
                    )}
                  </div>

                  {/* Fecha */}
                  <div style={{ fontSize: '12px', color: '#374151', fontFamily: 'ui-monospace, monospace' }}>
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
                  <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {plan.leader?.full_name ?? '—'}
                  </div>

                  {/* Ítems */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>
                      {doneItems}/{totalItems}
                    </span>
                    {totalItems > 0 && (
                      <div style={{ flex: 1, height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden', minWidth: '40px' }}>
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
                        {Object.entries(PLAN_STATUS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    {canEdit && (
                      <button
                        onClick={() => openAddItem(plan)}
                        title="Agregar ITR"
                        style={{ padding: '4px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px', fontSize: '11px', color: '#16a34a', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => handleDeletePlan(plan.id)}
                        disabled={isPending}
                        title="Eliminar plan"
                        style={{ padding: '4px 8px', background: 'white', border: '1px solid #fecaca', borderRadius: '5px', fontSize: '11px', color: '#ef4444', cursor: 'pointer' }}
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
                  <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '0 16px 12px 16px' }}>
                    {plan.notes && (
                      <p style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', margin: '8px 0 12px', paddingLeft: '8px', borderLeft: '3px solid #e2e8f0' }}>
                        {plan.notes}
                      </p>
                    )}

                    {plan.work_plan_items.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#94a3b8', padding: '12px 0' }}>
                        Sin ítems. {canEdit && 'Usa el botón + para agregar ITRs.'}
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        {/* Item header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 90px 28px', gap: '10px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                          <span>ITR</span>
                          <span>Tag / Template</span>
                          <span>Asignado a</span>
                          <span>Estado</span>
                          <span></span>
                        </div>
                        {plan.work_plan_items.map(item => {
                          const ist = ITEM_STATUS[item.status] ?? ITEM_STATUS.not_started
                          return (
                            <div
                              key={item.id}
                              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 90px 28px', gap: '10px', padding: '8px 10px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', alignItems: 'center' }}
                            >
                              {/* ITR number */}
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', fontFamily: 'ui-monospace, monospace' }}>
                                {item.itrs?.itr_number ?? '—'}
                              </div>

                              {/* Tag + template */}
                              <div>
                                {item.itrs?.tags && (
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#0f172a' }}>{item.itrs.tags.tag_number}</div>
                                )}
                                <div style={{ fontSize: '11px', color: '#64748b' }}>{item.itrs?.itr_templates?.title ?? '—'}</div>
                              </div>

                              {/* Assigned */}
                              <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.assigned?.full_name ?? '—'}
                              </div>

                              {/* Status */}
                              <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: ist.bg, color: ist.color, whiteSpace: 'nowrap' }}>
                                {ist.label}
                              </span>

                              {/* Remove */}
                              {canEdit && (
                                <button
                                  onClick={() => handleRemoveItem(item.id)}
                                  disabled={isPending}
                                  style={{ width: '22px', height: '22px', background: 'white', border: '1px solid #fecaca', borderRadius: '4px', color: '#ef4444', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
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
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn(page === 1)}>← Anterior</button>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Página {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtn(page === totalPages)}>Siguiente →</button>
        </div>
      )}

      {/* ── Create Plan Modal ───────────────────────────────────────── */}
      {showCreate && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Nuevo Plan de Trabajo</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Proyecto *</label>
                <select value={createProject} onChange={e => setCreateProject(e.target.value)} style={inputStyle}>
                  <option value="">Seleccionar proyecto...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Disciplina *</label>
                <select value={createDisc} onChange={e => setCreateDisc(e.target.value)} style={inputStyle}>
                  <option value="">Seleccionar disciplina...</option>
                  {disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Fecha del plan *</label>
                <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Notas <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span></label>
                <textarea
                  value={createNotes}
                  onChange={e => setCreateNotes(e.target.value)}
                  rows={3}
                  placeholder="Observaciones del plan..."
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
                  style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createProject || !createDisc || !createDate || createPending}
                  style={{ padding: '9px 20px', background: !createProject || !createDisc || !createDate || createPending ? '#93c5fd' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !createProject || !createDisc || !createDate || createPending ? 'not-allowed' : 'pointer' }}
                >
                  {createPending ? 'Creando...' : 'Crear plan →'}
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
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Agregar ITR al plan</h2>
              <button onClick={() => setAddItemPlanId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>ITR *</label>
                <select value={addItemItrId} onChange={e => setAddItemItrId(e.target.value)} style={inputStyle}>
                  <option value="">Seleccionar ITR...</option>
                  {availableItrs.map(itr => (
                    <option key={itr.id} value={itr.id}>{itr.itr_number} — {itr.tag_number} — {itr.title}</option>
                  ))}
                </select>
                {availableItrs.length === 0 && (
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Cargando ITRs del proyecto...
                  </p>
                )}
              </div>

              <div>
                <label style={labelStyle}>Asignado a *</label>
                <select value={addItemUser} onChange={e => setAddItemUser(e.target.value)} style={inputStyle}>
                  <option value="">Seleccionar persona...</option>
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
                  style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!addItemItrId || !addItemUser || addItemPending}
                  style={{ padding: '9px 20px', background: !addItemItrId || !addItemUser || addItemPending ? '#93c5fd' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !addItemItrId || !addItemUser || addItemPending ? 'not-allowed' : 'pointer' }}
                >
                  {addItemPending ? 'Agregando...' : 'Agregar →'}
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
  padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#374151', background: 'white', fontFamily: 'inherit', cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#0f172a', background: 'white', fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px',
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', background: disabled ? '#f8fafc' : 'white',
    border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px',
    color: disabled ? '#cbd5e1' : '#374151', cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
