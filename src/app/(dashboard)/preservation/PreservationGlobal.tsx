'use client'

import { useState, useMemo } from 'react'

const PAGE_SIZE = 50

type Project = { id: string; name: string; code: string }

type Plan = {
  id: string
  status: 'active' | 'suspended' | 'completed'
  start_date: string
  next_due_date: string
  last_performed_date: string | null
  project_id: string
  projects: { id: string; name: string; code: string } | null
  tags: { id: string; tag_number: string; description: string } | null
  preservation_procedures: { id: string; code: string; title: string; frequency: string; interval_days: number } | null
}

const STATUS_CFG = {
  active:    { label: 'Activo',     color: '#10b981', bg: '#ecfdf5' },
  suspended: { label: 'Suspendido', color: '#f59e0b', bg: '#fffbeb' },
  completed: { label: 'Completado', color: '#64748b', bg: '#f1f5f9' },
} as const

const FREQ_LABEL: Record<string, string> = {
  daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal',
  monthly: 'Mensual', quarterly: 'Trimestral',
}

function dueDateStatus(nextDue: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(nextDue)
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: `Vencido hace ${Math.abs(diffDays)}d`, color: '#ef4444', bg: '#fee2e2' }
  if (diffDays <= 7) return { label: `Vence en ${diffDays}d`, color: '#f59e0b', bg: '#fffbeb' }
  return { label: nextDue, color: '#64748b', bg: 'transparent' }
}

export default function PreservationGlobal({
  projects,
  plans,
}: {
  projects: Project[]
  plans: Plan[]
}) {
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDue, setFilterDue] = useState<'overdue' | 'soon' | ''>('')
  const [page, setPage] = useState(1)

  const today = new Date().toISOString().slice(0, 10)
  const soon  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const overdueCnt = plans.filter(p => p.status === 'active' && p.next_due_date < today).length
  const soonCnt    = plans.filter(p => p.status === 'active' && p.next_due_date >= today && p.next_due_date <= soon).length
  const activeCnt  = plans.filter(p => p.status === 'active').length

  const filtered = useMemo(() => plans.filter(p => {
    if (filterProject && p.project_id !== filterProject) return false
    if (filterStatus && p.status !== filterStatus) return false
    if (filterDue === 'overdue' && !(p.status === 'active' && p.next_due_date < today)) return false
    if (filterDue === 'soon' && !(p.status === 'active' && p.next_due_date >= today && p.next_due_date <= soon)) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !(p.tags?.tag_number ?? '').toLowerCase().includes(q) &&
        !(p.preservation_procedures?.title ?? '').toLowerCase().includes(q) &&
        !(p.projects?.name ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  }), [plans, filterProject, filterStatus, filterDue, search, today, soon])

  const hasFilters = filterProject || filterStatus || filterDue || search

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Preservación</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Todos los proyectos de la organización</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
        <div
          onClick={() => setFilterDue(filterDue === 'overdue' ? '' : 'overdue')}
          style={{ padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s', background: filterDue === 'overdue' ? '#fee2e2' : 'white', border: `1px solid ${filterDue === 'overdue' ? '#fca5a540' : '#e2e8f0'}` }}
        >
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#ef4444' }}>{overdueCnt}</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Vencidos</div>
        </div>
        <div
          onClick={() => setFilterDue(filterDue === 'soon' ? '' : 'soon')}
          style={{ padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s', background: filterDue === 'soon' ? '#fffbeb' : 'white', border: `1px solid ${filterDue === 'soon' ? '#fde68a' : '#e2e8f0'}` }}
        >
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#f59e0b' }}>{soonCnt}</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Vencen esta semana</div>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{activeCnt}</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Planes activos</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar tag, procedimiento, proyecto..."
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '240px', fontFamily: 'inherit' }}
        />
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
          <option value="">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterProject(''); setFilterStatus(''); setFilterDue(''); setSearch(''); setPage(1) }}
            style={{ padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
          >
            Limpiar filtros
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
          {filtered.length} de {plans.length} planes
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>No hay planes de preservación que coincidan.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 90px 110px 110px 90px', gap: '12px', padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Proyecto</span>
            <span>Tag</span>
            <span>Procedimiento</span>
            <span>Frecuencia</span>
            <span>Próximo venc.</span>
            <span>Último registro</span>
            <span>Estado</span>
          </div>

          {paginated.map(plan => {
            const st   = STATUS_CFG[plan.status]
            const due  = dueDateStatus(plan.next_due_date)
            const proc = plan.preservation_procedures
            const proj = plan.projects

            return (
              <div
                key={plan.id}
                style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 90px 110px 110px 90px', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}
              >
                {/* Proyecto */}
                <div>
                  {proj && (
                    <a
                      href={`/projects/${proj.id}`}
                      title={proj.name}
                      style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '94px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {proj.code}
                    </a>
                  )}
                </div>

                {/* Tag */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                    {plan.tags?.tag_number ?? '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                    {plan.tags?.description ?? ''}
                  </div>
                </div>

                {/* Procedimiento */}
                <div>
                  {proc && (
                    <>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', fontFamily: 'ui-monospace, monospace' }}>{proc.code}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{proc.title}</div>
                    </>
                  )}
                </div>

                {/* Frecuencia */}
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {proc ? FREQ_LABEL[proc.frequency] ?? proc.frequency : '—'}
                </div>

                {/* Próximo vencimiento */}
                <div style={{ fontSize: '11px', fontWeight: 500, color: plan.status === 'active' ? due.color : '#94a3b8', background: plan.status === 'active' ? due.bg : 'transparent', padding: due.bg !== 'transparent' ? '2px 6px' : '0', borderRadius: '4px', display: 'inline-block' }}>
                  {plan.status === 'active' ? due.label : plan.next_due_date}
                </div>

                {/* Último registro */}
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {plan.last_performed_date ?? '—'}
                </div>

                {/* Estado */}
                <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                  {st.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '7px 14px', background: page === 1 ? '#f8fafc' : 'white', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: page === 1 ? '#cbd5e1' : '#374151', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>← Anterior</button>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Página {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '7px 14px', background: page === totalPages ? '#f8fafc' : 'white', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '12px', color: page === totalPages ? '#cbd5e1' : '#374151', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>Siguiente →</button>
        </div>
      )}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#374151', background: 'white', fontFamily: 'inherit', cursor: 'pointer',
}
