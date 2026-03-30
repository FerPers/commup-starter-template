import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PidDocumentsView from './PidDocumentsView'

export default async function PidDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: project }, { data: documents }, { data: tagPids }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name')
      .eq('id', id)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('pid_documents')
      .select('id, drawing_number, title, file_path, file_name, file_size, created_at')
      .eq('project_id', id)
      .order('drawing_number'),
    // Fetch distinct pid_drawing values from tags so we can show which ones have no document yet
    supabase
      .from('tags')
      .select('pid_drawing')
      .eq('project_id', id)
      .not('pid_drawing', 'is', null),
  ])

  if (!project) notFound()

  // Generate signed URLs for each document (60 min expiry)
  const docs = documents ?? []
  const signedDocs = await Promise.all(
    docs.map(async (doc) => {
      const { data } = await supabase.storage
        .from('pid-documents')
        .createSignedUrl(doc.file_path, 3600)
      return { ...doc, signed_url: data?.signedUrl ?? null }
    })
  )

  // Unique P&IDs referenced in tags but without an uploaded document
  const uploadedNumbers = new Set(docs.map(d => d.drawing_number))
  const allTagPids = [...new Set((tagPids ?? []).map(t => t.pid_drawing as string))]
  const missingPids = allTagPids.filter(p => !uploadedNumbers.has(p)).sort()

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <a href={`/projects/${id}/tags`} style={{
          fontSize: '13px', color: '#64748b', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px',
        }}>
          ← Tags / Equipos
        </a>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>
              Documentos P&ID
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>
              {project.name} · {docs.length === 0 ? 'Sin documentos subidos' : `${docs.length} PDF${docs.length !== 1 ? 's' : ''} subido${docs.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      </div>

      <PidDocumentsView
        projectId={id}
        documents={signedDocs}
        missingPids={missingPids}
        canEdit={canEdit}
      />
    </div>
  )
}
