import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import TagsView from './TagsView'

export default async function TagsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner', 'admin', 'architect'].includes(membership.role)

  const [{ data: project }, { data: tags }, { data: pidDocs }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name')
      .eq('id', id)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('tags')
      .select(`
        id, tag_number, description, status, manufacturer, model, serial_number, preservation_required, pid_drawing,
        disciplines(id, code, name, color),
        subsystems(id, code, name, systems(id, code, name, areas(id, code, name)))
      `)
      .eq('project_id', id)
      .order('tag_number'),
    supabase
      .from('pid_documents')
      .select('drawing_number, file_path')
      .eq('project_id', id),
  ])

  if (!project) notFound()

  // Build signed URL map: drawing_number → signed URL
  const pidUrlMap: Record<string, string> = {}
  for (const doc of pidDocs ?? []) {
    const { data } = await supabase.storage
      .from('pid-documents')
      .createSignedUrl(doc.file_path, 3600)
    if (data?.signedUrl) pidUrlMap[doc.drawing_number] = data.signedUrl
  }

  const tagCount = (tags ?? []).length

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <a href={`/projects/${id}`} style={{
          fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px',
        }}>
          ← {project.name}
        </a>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
              Tags / Equipos
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {tagCount === 0 ? 'Sin tags importados' : `${tagCount} tags importados`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <a
              href={`/projects/${id}/pid-documents`}
              style={{
                padding: '9px 18px', background: 'var(--card-bg)', color: 'var(--text-muted)',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none', whiteSpace: 'nowrap',
                border: '1px solid var(--border)',
              }}
            >
              Documentos P&ID
            </a>
            {canEdit && (
              <a
                href={`/projects/${id}/import`}
                style={{
                  padding: '9px 18px', background: '#3b82f6', color: '#fff',
                  borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                + Importar tags
              </a>
            )}
          </div>
        </div>
      </div>

      {tagCount === 0 ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '64px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>⊟</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 6px' }}>
            Aún no hay tags importados
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px' }}>
            Carga tu lista de equipos desde Excel para comenzar.
          </p>
          {canEdit && (
            <a
              href={`/projects/${id}/import`}
              style={{
                display: 'inline-block', padding: '10px 22px',
                background: '#3b82f6', color: '#fff', borderRadius: '8px',
                fontSize: '13px', fontWeight: 500, textDecoration: 'none',
              }}
            >
              Importar lista de equipos
            </a>
          )}
        </div>
      ) : (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <TagsView projectId={id} tags={(tags ?? []) as any} canEdit={canEdit} pidUrlMap={pidUrlMap} />
      )}

    </div>
  )
}
