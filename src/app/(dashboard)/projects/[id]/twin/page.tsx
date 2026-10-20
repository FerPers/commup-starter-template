import { Diamond, FolderTree } from 'lucide-react'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import TwinView, { type Tag360 } from './TwinView'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

export const metadata = { title: 'Digital Twin — CommUp' }

export default async function TwinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, code')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) notFound()

  // Vista tag_360 del proyecto. S09 (B-07): PostgREST corta en 1000 filas → se pagina (clave única de la
  // vista = tag_id).
  let tags: Tag360[] = []
  let truncated = false
  try {
    const res = await fetchAllRowsFlagged(() => supabase
      .from('tag_360')
      .select('*')
      .eq('project_id', id)
      .eq('org_id', membership.org_id)
      .order('tag_number'), { key: 'tag_id' })
    tags = res.rows as Tag360[]
    truncated = res.truncated
  } catch (error) {
    console.error('tag_360 error:', error)
  }

  const tl = await getTranslations('Common')
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

      {truncated && (
        <PartialNote>{tl('listPartial')}</PartialNote>
      )}

      {/* Main view */}
      <TwinView
        projectId={id}
        tags={tags}
      />
    </div>
  )
}
