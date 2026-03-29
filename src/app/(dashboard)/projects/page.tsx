import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProjectCard from './ProjectCard'

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

