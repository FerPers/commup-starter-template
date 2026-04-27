import { FolderKanban } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card, EmptyState } from '@/components/ui'
import type { OrgMemberRole } from '@/types/database'
import { ProjectRow } from './_shared'

export default async function ProjectsActiveWidget({ orgId, role }: { orgId: string; role: OrgMemberRole }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const [{ data: projects }, { data: phases }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, location, client, start_date, end_date, status')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_phases')
      .select('id, name, code, color, order_index')
      .eq('org_id', orgId)
      .order('order_index'),
  ])

  const activeProjects = (projects ?? []).filter(p => p.status === 'active')
  const canCreateProject = ['owner', 'admin', 'architect'].includes(role)

  return (
    <Card padding="md">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)' }}>{t('projects.title')}</h3>
        {canCreateProject && (
          <a href="/setup?mode=project" style={{ padding: '8px 16px', background: 'var(--primary-500)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 500, textDecoration: 'none' }}>
            {t('projects.newProject')}
          </a>
        )}
      </div>
      {activeProjects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={24} aria-hidden="true" />}
          title={t('projects.empty')}
          description={t('projects.emptyDesc')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeProjects.map(project => (
            <ProjectRow
              key={project.id}
              project={project}
              phases={phases ?? []}
              noMetaText={t('projects.noMeta')}
              activeText={t('projects.active')}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
