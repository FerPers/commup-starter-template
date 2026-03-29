import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

  const canCreateProject = ['owner', 'admin', 'architect'].includes(membership.role)

  const [{ data: projects }, { data: phases }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, location, client, start_date, end_date, status, created_at')
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_phases')
      .select('id, code, name, color, order_index')
      .eq('org_id', membership.org_id)
      .order('order_index'),
  ])

  const activeProjects   = (projects ?? []).filter(p => p.status === 'active')
  const inactiveProjects = (projects ?? []).filter(p => p.status !== 'active')

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
            Proyectos
          </h1>
          <p style={{ color: '#64748b', marginTop: '4px', fontSize: '15px' }}>
            {(projects ?? []).length} proyecto{(projects ?? []).length !== 1 ? 's' : ''} en la organización
          </p>
        </div>
        {canCreateProject && (
          <a href="/setup?mode=project" style={{
            padding: '10px 20px', background: '#3b82f6', color: 'white',
            borderRadius: '10px', fontSize: '14px', fontWeight: 500,
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}>
            + Nuevo Proyecto
          </a>
        )}
      </div>

      {/* Empty state */}
      {(projects ?? []).length === 0 && (
        <div style={{
          padding: '64px', textAlign: 'center',
          background: 'white', borderRadius: '16px',
          border: '2px dashed #e2e8f0',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⬡</div>
          <p style={{ color: '#475569', fontWeight: 500, fontSize: '16px', marginBottom: '6px' }}>No hay proyectos todavía</p>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>
            Crea tu primer proyecto para comenzar a gestionar el completamiento
          </p>
          {canCreateProject && (
            <a href="/setup?mode=project" style={{
              padding: '10px 24px', background: '#3b82f6', color: 'white',
              borderRadius: '10px', fontSize: '14px', fontWeight: 500,
              textDecoration: 'none',
            }}>
              + Crear primer proyecto
            </a>
          )}
        </div>
      )}

      {/* Active projects */}
      {activeProjects.length > 0 && (
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
            Activos · {activeProjects.length}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {activeProjects.map(project => (
              <ProjectCard key={project.id} project={project} phases={phases ?? []} />
            ))}
          </div>
        </section>
      )}

      {/* Inactive projects */}
      {inactiveProjects.length > 0 && (
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
            Inactivos · {inactiveProjects.length}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {inactiveProjects.map(project => (
              <ProjectCard key={project.id} project={project} phases={phases ?? []} inactive />
            ))}
          </div>
        </section>
      )}

    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────

function ProjectCard({ project, phases, inactive = false }: {
  project: {
    id: string; name: string; code: string
    location: string | null; client: string | null
    start_date: string | null; end_date: string | null; status: string
  }
  phases: { id: string; code: string; name: string; color: string; order_index: number }[]
  inactive?: boolean
}) {
  const meta = [project.client, project.location].filter(Boolean).join(' · ')

  function formatDate(d: string | null) {
    if (!d) return null
    return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <a href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
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
            padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
            flexShrink: 0,
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
