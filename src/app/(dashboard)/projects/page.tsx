import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { FolderKanban, Plus } from 'lucide-react'
import { EmptyState, Button } from '@/components/ui'
import { textOr } from '@/lib/excel/normalize'
import ProjectCard, { type ProjectCardData, type PhaseData } from './ProjectCard'

// Agrupa por país cuando la org tiene proyectos en más de uno (jerarquía
// corporativa País → Región → Campo). Con un solo país no se muestra el grupo.
function groupByCountry(projects: ProjectCardData[], noCountry: string): { label: string; items: ProjectCardData[] }[] {
  const groups = new Map<string, ProjectCardData[]>()
  for (const p of projects) {
    const key = textOr(p.country, noCountry)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }
  return [...groups]
    .sort(([a], [b]) => (a === noCountry ? 1 : b === noCountry ? -1 : a.localeCompare(b)))
    .map(([label, items]) => ({ label, items }))
}

function ProjectGrid({ projects, phases, inactive = false }: { projects: ProjectCardData[]; phases: PhaseData[]; inactive?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
      {projects.map(project => (
        <ProjectCard key={project.id} project={project} phases={phases} inactive={inactive} />
      ))}
    </div>
  )
}

export default async function ProjectsPage() {
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canCreateProject = ['owner', 'admin', 'architect'].includes(membership.role)

  const [{ data: projects }, { data: phases }, t] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, location, client, country, region, start_date, end_date, status, created_at')
      .eq('org_id', membership.org_id)
      .order('country', { ascending: true, nullsFirst: false })
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
  const countries        = new Set((projects ?? []).map(p => textOr(p.country, '')))
  const multiCountry     = countries.size > 1
  const activeGroups     = multiCountry ? groupByCountry(activeProjects, t('noCountry')) : []

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

      {/* Active projects — agrupados por país si hay más de uno */}
      {activeProjects.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {t('active')} · {activeProjects.length}
          </h2>
          {multiCountry ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {activeGroups.map(group => (
                <div key={group.label}>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {group.label}
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>· {group.items.length}</span>
                  </h3>
                  <ProjectGrid projects={group.items} phases={phases ?? []} />
                </div>
              ))}
            </div>
          ) : (
            <ProjectGrid projects={activeProjects} phases={phases ?? []} />
          )}
        </section>
      )}

      {/* Inactive projects */}
      {inactiveProjects.length > 0 && (
        <section>
          <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {t('inactive')} · {inactiveProjects.length}
          </h2>
          <ProjectGrid projects={inactiveProjects} phases={phases ?? []} inactive />
        </section>
      )}
    </div>
  )
}
