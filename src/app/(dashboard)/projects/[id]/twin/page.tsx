import { Diamond, FolderTree } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import TwinView, { type Tag360 } from './TwinView'

export const metadata = { title: 'Digital Twin — CommUp' }

export default async function TwinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) notFound()

  // Fetch tag_360 view for this project
  const { data: tags, error } = await supabase
    .from('tag_360')
    .select('*')
    .eq('project_id', id)
    .eq('org_id', membership.org_id)
    .order('tag_number')

  if (error) {
    console.error('tag_360 error:', error)
  }

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <Link
          href={`/projects/${id}`}
          style={{
            fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '12px',
          }}
        >
          ← {project.name}
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Diamond size={20} color="var(--primary-500)" aria-hidden="true" />
              Digital Twin — {project.code}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
              Vista 360° por tag · Sistema › Subsistema › Asset card · Semáforo en tiempo real
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link
              href={`/projects/${id}/explorer`}
              style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none', background: 'var(--gray-50)', color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}
            >
              <FolderTree size={14} aria-hidden="true" />
              Explorador
            </Link>
            <Link
              href={`/projects/${id}/pid-documents`}
              style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none', background: '#eff6ff', color: '#3b82f6',
                border: '1px solid #bfdbfe',
              }}
            >
              📄 P&IDs
            </Link>
          </div>
        </div>
      </div>

      {/* Main view */}
      <TwinView
        projectId={id}
        tags={(tags ?? []) as Tag360[]}
      />
    </div>
  )
}
