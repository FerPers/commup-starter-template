import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { FolderKanban, Plus } from 'lucide-react'
import { EmptyState, Button } from '@/components/ui'
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

  const [{ data: projects }, { data: phases }, t] = await Promise.all([
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
    getTranslations('Projects'),
  ])

  const activeProjects   = (projects ?? []).filter(p => p.status === 'active')
  const inactiveProjects = (projects ?? []).filter(p => p.status !== 'active')
  const totalCount       = (projects ?? []).length

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
            {t('title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 'var(--text-base)' }}>
            {t('subtitle', { count: totalCount })}
          </p>
        </div>
        {canCreateProject && (
          <a href="/setup?mode=project" style={{ textDecoration: 'none' }}>
            <Button variant="primary" leftIcon={<Plus size={16} aria-hidden="true" />}>
              {t('newProject')}
            </Button>
          </a>
        )}
      </div>

      {/* Empty state */}
      {totalCount === 0 && (
        <div style={{
          background: 'var(--card-bg)',
          borderRadius: 'var(--radius-lg)',
          border: '2px dashed var(--border)',
          padding: '32px 24px',
        }}>
          <EmptyState
            icon={<FolderKanban size={28} aria-hidden="true" />}
            title={t('empty.title')}
            description={t('empty.desc')}
            action={canCreateProject && (
              <a href="/setup?mode=project" style={{ textDecoration: 'none' }}>
                <Button variant="primary">{t('createFirst')}</Button>
              </a>
            )}
          />
        </div>
      )}

      {/* Active projects */}
      {activeProjects.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {t('active')} · {activeProjects.length}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {activeProjects.map(project => (
              <ProjectCard key={project.id} project={project as any} phases={phases ?? []} />
            ))}
          </div>
        </section>
      )}

      {/* Inactive projects */}
      {inactiveProjects.length > 0 && (
        <section>
          <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {t('inactive')} · {inactiveProjects.length}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {inactiveProjects.map(project => (
              <ProjectCard key={project.id} project={project as any} phases={phases ?? []} inactive />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
