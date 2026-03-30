import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TagsView from './TagsView'

export default async function TagsPage({ params }: { params: Promise<{ id: string }> }) {
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
          fontSize: '13px', color: '#64748b', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px',
        }}>
          ← {project.name}
        </a>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>
              Tags / Equipos
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>
              {tagCount === 0 ? 'Sin tags importados' : `${tagCount} tags importados`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <a
              href={`/projects/${id}/pid-documents`}
              style={{
                padding: '9px 18px', background: 'white', color: '#475569',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                textDecoration: 'none', whiteSpace: 'nowrap',
                border: '1px solid #e2e8f0',
              }}
            >
              Documentos P&ID
            </a>
            {canEdit && (
              <a
                href={`/projects/${id}/import`}
                style={{
                  padding: '9px 18px', background: '#3b82f6', color: 'white',
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
          background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0',
          padding: '64px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>⊟</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: '#475569', margin: '0 0 6px' }}>
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
                background: '#3b82f6', color: 'white', borderRadius: '8px',
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
