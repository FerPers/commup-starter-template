'use client'

import { useState, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────

type ItrRow = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  created_at: string
  itr_templates: { code: string; title: string; disciplines: { code: string; name: string; color: string } } | null
  tags: { id: string; tag_number: string; description: string } | null
  project_phases: { code: string; name: string; color: string } | null
  itr_assignments: Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_signatures: Array<{ role: string; signed_at: string }>
}

type Phase = { id: string; code: string; name: string; color: string; order_index: number }

// ── Status config ─────────────────────────────────────────────────────

const ITR_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Sin iniciar', color: '#64748b', bg: '#f1f5f9' },
  in_progress:  { label: 'En progreso', color: '#3b82f6', bg: '#eff6ff' },
  completed:    { label: 'Completado',  color: '#10b981', bg: '#ecfdf5' },
  approved:     { label: 'Aprobado',    color: '#7c3aed', bg: '#f5f3ff' },
  rejected:     { label: 'Rechazado',   color: '#ef4444', bg: '#fee2e2' },
}

const SIGN_LABELS: Record<string, string> = { executor: 'E', supervisor: 'S', client: 'C' }

// ── Component ─────────────────────────────────────────────────────────

export default function ItrListView({
  projectId,
  projectName,
  itrs,
  phases,
}: {
  projectId: string
  projectName: string
  itrs: ItrRow[]
  phases: Phase[]
}) {
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPhase, setFilterPhase] = useState('')
  const [filterDisc, setFilterDisc] = useState('')
  const [search, setSearch] = useState('')

  // Unique disciplines from the ITR list
  const disciplines = useMemo(() => {
    const seen = new Set<string>()
    const list: { code: string; name: string; color: string }[] = []
    for (const itr of itrs) {
      const d = itr.itr_templates?.disciplines
      if (d && !seen.has(d.code)) {
        seen.add(d.code)
        list.push(d)
      }
    }
    return list.sort((a, b) => a.code.localeCompare(b.code))
  }, [itrs])

  const filtered = useMemo(() => {
    return itrs.filter(itr => {
      if (filterStatus && itr.status !== filterStatus) return false
      if (filterPhase && itr.project_phases?.code !== filterPhase) return false
      if (filterDisc && itr.itr_templates?.disciplines?.code !== filterDisc) return false
      if (search) {
        const q = search.toLowerCase()
        const matchItr = itr.itr_number.toLowerCase().includes(q)
        const matchTag = (itr.tags?.tag_number ?? '').toLowerCase().includes(q)
        const matchTitle = (itr.itr_templates?.title ?? '').toLowerCase().includes(q)
        if (!matchItr && !matchTag && !matchTitle) return false
      }
      return true
    })
  }, [itrs, filterStatus, filterPhase, filterDisc, search])

  // Summary counts by status
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const itr of itrs) c[itr.status] = (c[itr.status] ?? 0) + 1
    return c
  }, [itrs])

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>

      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <a href={`/projects/${projectId}`} style={{ fontSize: '12px', color: '#94a3b8', textDecoration: 'none' }}>
          ← {projectName}
        </a>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '8px 0 0' }}>ITRs del Proyecto</h1>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {Object.entries(ITR_STATUS).map(([key, cfg]) => (
          <div
            key={key}
            onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
            style={{ padding: '14px 16px', background: filterStatus === key ? cfg.bg : 'white', border: `1px solid ${filterStatus === key ? cfg.color + '40' : '#e2e8f0'}`, borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s' }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: cfg.color }}>{counts[key] ?? 0}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{cfg.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ITR, tag, template..."
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '220px', fontFamily: 'inherit' }}
        />
        <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} style={selStyle}>
          <option value="">Todas las fases</option>
          {phases.map(p => <option key={p.id} value={p.code}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filterDisc} onChange={e => setFilterDisc(e.target.value)} style={selStyle}>
          <option value="">Todas las disciplinas</option>
          {disciplines.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
        </select>
        {(filterStatus || filterPhase || filterDisc || search) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPhase(''); setFilterDisc(''); setSearch('') }}
            style={{ padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
          >
            Limpiar filtros
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
          {filtered.length} de {itrs.length} ITRs
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>No hay ITRs que coincidan con los filtros.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 90px 80px 90px 60px', gap: '12px', padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>ITR / Tag</span>
            <span>Template</span>
            <span>Inspector</span>
            <span>Fecha</span>
            <span>Progreso</span>
            <span>Estado</span>
            <span>Firma</span>
          </div>

          {/* Rows */}
          {filtered.map(itr => {
            const st = ITR_STATUS[itr.status] ?? ITR_STATUS.not_started
            const executor = itr.itr_assignments.find(a => a.role === 'executor')
            const disc = itr.itr_templates?.disciplines
            const phase = itr.project_phases

            return (
              <div
                key={itr.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 90px 80px 90px 60px', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}
              >
                {/* ITR + Tag */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {phase && (
                      <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>{phase.code}</span>
                    )}
                    <a
                      href={itr.tags ? `/projects/${projectId}/tags/${itr.tags.id}/itrs/${itr.id}` : '#'}
                      style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}
                    >
                      {itr.itr_number}
                    </a>
                  </div>
                  {itr.tags && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {itr.tags.tag_number} — {itr.tags.description}
                    </div>
                  )}
                </div>

                {/* Template */}
                <div>
                  {disc && (
                    <span style={{ fontSize: '10px', fontWeight: 600, color: disc.color, marginRight: '6px', padding: '1px 5px', background: `${disc.color}15`, borderRadius: '4px' }}>{disc.code}</span>
                  )}
                  <span style={{ fontSize: '12px', color: '#374151' }}>{itr.itr_templates?.title ?? '—'}</span>
                </div>

                {/* Inspector */}
                <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {executor?.profiles?.full_name ?? '—'}
                </div>

                {/* Scheduled date */}
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {itr.scheduled_date ?? '—'}
                </div>

                {/* Progress */}
                <div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right', marginBottom: '3px' }}>{itr.progress_pct}%</div>
                  <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${itr.progress_pct}%`, background: itr.progress_pct >= 100 ? '#10b981' : '#3b82f6', borderRadius: '2px' }} />
                  </div>
                </div>

                {/* Status */}
                <span style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {st.label}
                </span>

                {/* Signatures */}
                <div style={{ display: 'flex', gap: '2px' }}>
                  {(['executor', 'supervisor', 'client'] as const).map(role => {
                    const signed = itr.itr_signatures.some(s => s.role === role)
                    return (
                      <span key={role} style={{ width: '18px', height: '18px', borderRadius: '3px', background: signed ? '#ecfdf5' : '#f8fafc', border: `1px solid ${signed ? '#a7f3d0' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: signed ? '#10b981' : '#cbd5e1' }}>
                        {SIGN_LABELS[role]}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#374151', background: 'white', fontFamily: 'inherit', cursor: 'pointer',
}
