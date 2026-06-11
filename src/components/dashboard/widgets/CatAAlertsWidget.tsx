import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

export default async function CatAAlertsWidget({ orgId }: { orgId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId)

  const projectIds = (projects ?? []).map(p => p.id)
  if (projectIds.length === 0) return null

  const { data } = await supabase
    .from('punches')
    .select('id, punch_number, description, project_id, projects(code, name)')
    .in('project_id', projectIds)
    .eq('category', 'A')
    .in('status', ['open', 'in_progress'])
    .is('assigned_to', null)
    .order('created_at', { ascending: true })
    .limit(8)

  const unassignedCatA = data ?? []
  if (unassignedCatA.length === 0) return null

  return (
    <div role="alert" style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid #f97316', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} color="#9a3412" aria-hidden="true" />
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: '#9a3412' }}>{t('architect.catATitle')}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: '#c2410c' }}>{t('architect.catADesc', { count: unassignedCatA.length })}</div>
          </div>
        </div>
        <a href="/punch-list" style={{ fontSize: 'var(--text-sm)', color: '#ea580c', fontWeight: 600, textDecoration: 'none' }}>{t('architect.catAViewAll')}</a>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(unassignedCatA ?? []).slice(0, 5).map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid #fed7aa' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9a3412', background: 'var(--danger-50)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap' }}>Cat A</span>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--gray-700)', fontFamily: 'ui-monospace, monospace' }}>{p.punch_number}</span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
            <span style={{ fontSize: 10, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{p.projects?.code}</span>
          </div>
        ))}
        {unassignedCatA.length > 5 && (
          <p style={{ fontSize: 'var(--text-xs)', color: '#c2410c', margin: '4px 0 0', paddingLeft: 4 }}>{t('architect.catAMore', { count: unassignedCatA.length - 5 })}</p>
        )}
      </div>
    </div>
  )
}
