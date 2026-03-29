'use client'

export interface ProjectCardData {
  id: string; name: string; code: string
  location: string | null; client: string | null
  start_date: string | null; end_date: string | null; status: string
}

export interface PhaseData {
  id: string; code: string; name: string; color: string; order_index: number
}

export default function ProjectCard({ project, phases, inactive = false }: {
  project: ProjectCardData
  phases: PhaseData[]
  inactive?: boolean
}) {
  const meta = [project.client, project.location].filter(Boolean).join(' · ')

  function formatDate(d: string | null) {
    if (!d) return null
    return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <a href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'white', borderRadius: '14px', padding: '20px 22px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          opacity: inactive ? 0.65 : 1,
          transition: 'box-shadow 0.15s, transform 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        }}
      >
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
              background: '#3b82f615', border: '1px solid #3b82f625',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700, color: '#3b82f6', letterSpacing: '0.02em',
            }}>
              {project.code.slice(0, 6)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project.name}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {meta || 'Sin cliente / ubicación'}
              </div>
            </div>
          </div>
          <span style={{
            padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, flexShrink: 0,
            background: inactive ? '#f1f5f9' : '#10b98118',
            color: inactive ? '#94a3b8' : '#10b981',
            border: `1px solid ${inactive ? '#e2e8f0' : '#10b98130'}`,
          }}>
            {inactive ? 'Inactivo' : 'Activo'}
          </span>
        </div>

        {/* Phases */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {phases.map(phase => (
            <div key={phase.id} title={phase.name} style={{
              padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
              background: `${phase.color}15`, color: phase.color,
              border: `1px solid ${phase.color}30`,
            }}>
              {phase.code}
            </div>
          ))}
        </div>

        {/* Dates */}
        {(project.start_date || project.end_date) && (
          <div style={{ display: 'flex', gap: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            {project.start_date && (
              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inicio</div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{formatDate(project.start_date)}</div>
              </div>
            )}
            {project.end_date && (
              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Objetivo</div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{formatDate(project.end_date)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </a>
  )
}
