import { ShieldCheck } from 'lucide-react'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import PssrListView from './PssrListView'

export default async function PssrListPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner','admin','architect','leader'].includes(membership.role)

  const [
    { data: project },
    { data: systems },
    { data: reviews },
    { data: templates },
  ] = await Promise.all([
    supabase.from('projects').select('id, name, code').eq('id', projectId).single(),
    supabase.from('systems').select('id, code, name').eq('project_id', projectId).order('code'),
    supabase
      .from('pssr_reviews')
      .select('id, review_number, title, status, system_id, created_at, approved_at, rfsu_certificate_id, systems(code, name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('pssr_templates')
      .select('id, name')
      .eq('org_id', membership.org_id)
      .eq('is_active', true)
      .order('created_at'),
  ])

  if (!project) redirect('/projects')

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <a href={`/projects/${projectId}`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← {project.name}
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0,
            background: 'var(--warning-50)', border: '1px solid var(--warning-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldCheck size={20} color="var(--warning-700)" aria-hidden="true" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
              Pre-Startup Safety Review
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Revisión de seguridad previa al arranque — {project.name}
            </p>
          </div>
        </div>
      </div>

      <PssrListView
        projectId={projectId}
        systems={(systems ?? []) as any[]}
        reviews={(reviews ?? []) as any[]}
        templates={(templates ?? []) as any[]}
        canEdit={canEdit}
      />
    </div>
  )
}