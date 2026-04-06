'use client'

import { useState, useMemo } from 'react'

type Project = { id: string; name: string; code: string }
type Phase   = { id: string; code: string; name: string; color: string; certificate_name: string | null }

type Certificate = {
  id: string
  certificate_number: string
  title: string
  status: 'pending' | 'in_review' | 'issued' | 'rejected'
  issued_date: string | null
  project_id: string
  projects: { id: string; name: string; code: string } | null
  project_phases: { id: string; code: string; name: string; color: string; certificate_name: string | null } | null
  subsystems: { id: string; code: string; name: string; systems: { code: string; name: string } } | null
}

const STATUS_CFG = {
  pending:   { label: 'Pendiente',   color: '#64748b', bg: '#f1f5f9' },
  in_review: { label: 'En revisión', color: '#3b82f6', bg: '#eff6ff' },
  issued:    { label: 'Emitido',     color: '#10b981', bg: '#ecfdf5' },
  rejected:  { label: 'Rechazado',   color: '#ef4444', bg: '#fee2e2' },
} as const

export default function CertificatesGlobal({
  projects,
  certificates,
  phases,
}: {
  projects: Project[]
  certificates: Certificate[]
  phases: Phase[]
}) {
  const [search, setSearch]               = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterPhase, setFilterPhase]     = useState('')
  const [filterStatus, setFilterStatus]   = useState('')

  const issuedCnt   = certificates.filter(c => c.status === 'issued').length
  const pendingCnt  = certificates.filter(c => c.status === 'pending').length
  const reviewCnt   = certificates.filter(c => c.status === 'in_review').length
  const rejectedCnt = certificates.filter(c => c.status === 'rejected').length

  const filtered = useMemo(() => certificates.filter(c => {
    if (filterProject && c.project_id !== filterProject) return false
    if (filterPhase && c.project_phases?.code !== filterPhase) return false
    if (filterStatus && c.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !c.certificate_number.toLowerCase().includes(q) &&
        !c.title.toLowerCase().includes(q) &&
        !(c.subsystems?.code ?? '').toLowerCase().includes(q) &&
        !(c.projects?.name ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  }), [certificates, filterProject, filterPhase, filterStatus, search])

  const hasFilters = filterProject || filterPhase || filterStatus || search

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Certificados</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Todos los proyectos de la organización</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {[
          { ...STATUS_CFG.issued,    label: 'Emitidos',    count: issuedCnt,   key: 'issued' },
          { ...STATUS_CFG.in_review, label: 'En revisión', count: reviewCnt,   key: 'in_review' },
          { ...STATUS_CFG.pending,   label: 'Pendientes',  count: pendingCnt,  key: 'pending' },
          { ...STATUS_CFG.rejected,  label: 'Rechazados',  count: rejectedCnt, key: 'rejected' },
        ].map(card => (
          <div
            key={card.key}
            onClick={() => setFilterStatus(filterStatus === card.key ? '' : card.key)}
            style={{
              padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
              background: filterStatus === card.key ? card.bg : 'white',
              border: `1px solid ${filterStatus === card.key ? card.color + '40' : '#e2e8f0'}`,
            }}
          >
            <div style={{ fontSize: '22px', fontWeight: 700, color: card.color }}>{card.count}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar número, subsistema, proyecto..."
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '240px', fontFamily: 'inherit' }}
        />
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={selStyle}>
          <option value="">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} style={selStyle}>
          <option value="">Todas las fases</option>
          {phases.map(ph => <option key={ph.id} value={ph.code}>{ph.code} — {ph.certificate_name ?? ph.name}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterProject(''); setFilterPhase(''); setFilterStatus(''); setSearch('') }}
            style={{ padding: '8px 12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
          >
            Limpiar filtros
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
          {filtered.length} de {certificates.length} certificados
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>No hay certificados que coincidan con los filtros.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 130px 1fr 1fr 80px 100px 90px', gap: '12px', padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Proyecto</span>
            <span>N° Certificado</span>
            <span>Título</span>
            <span>Subsistema</span>
            <span>Fase</span>
            <span>Fecha emisión</span>
            <span>Estado</span>
          </div>

          {filtered.map(cert => {
            const st    = STATUS_CFG[cert.status]
            const proj  = cert.projects
            const phase = cert.project_phases
            const ss    = cert.subsystems

            return (
              <div
                key={cert.id}
                style={{ display: 'grid', gridTemplateColumns: '100px 130px 1fr 1fr 80px 100px 90px', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}
              >
                {/* Proyecto */}
                <div>
                  {proj && (
                    <a
                      href={`/projects/${proj.id}/certificates`}
                      title={proj.name}
                      style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 7px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block', maxWidth: '94px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {proj.code}
                    </a>
                  )}
                </div>

                {/* N° Certificado */}
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                  {cert.certificate_number}
                </div>

                {/* Título */}
                <div style={{ fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cert.title}
                </div>

                {/* Subsistema */}
                <div>
                  {ss && (
                    <>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{ss.code}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{ss.systems?.code} — {ss.name}</div>
                    </>
                  )}
                </div>

                {/* Fase */}
                <div>
                  {phase && (
                    <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>
                      {phase.code}
                    </span>
                  )}
                </div>

                {/* Fecha emisión */}
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {cert.issued_date ?? '—'}
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
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px',
  fontSize: '13px', color: '#374151', background: 'white', fontFamily: 'inherit', cursor: 'pointer',
}
