import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import PidViewer from './PidViewer'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { fetchAllRows, fetchAllRowsFlagged } from '@/lib/list/fetch-all'

export default async function PidViewerPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>
}) {
  const { id, docId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  // F-27: ubicar tags en el plano = EDITOR, igual que upsertHotspot (política 2026-05-24)
  const canEdit = EDITOR_ROLES.includes(membership.role)

  // Verify project belongs to org
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) notFound()

  // Fetch document
  const { data: doc } = await supabase
    .from('pid_documents')
    .select('id, drawing_number, title, file_path, file_name')
    .eq('id', docId)
    .eq('project_id', id)
    .single()

  if (!doc) notFound()

  // Generate signed URL (1hr)
  const { data: signedData } = await supabase.storage
    .from('pid-documents')
    .createSignedUrl(doc.file_path, 3600)

  if (!signedData?.signedUrl) notFound()

  // S09 (B-07, F-08): el estado de cada pin se calcula SOLO con los tags que tienen pin en este plano
  // (antes se leían todos los tags/punches/ITR del proyecto y PostgREST cortaba en 1000 filas, así que
  // `itr_completion_pct` salía de una muestra). La lista del selector de tags (solo para editores) se pagina.
  const pickerTagsSelect = 'id, tag_number, description, status, discipline_id, disciplines:discipline_id(id, code, name, color), subsystems:subsystem_id(systems:system_id(id, code, name))'
  const [{ data: rawHotspots }, pickerRes] = await Promise.all([
    supabase
      .from('pid_hotspots')
      .select(`
        id, tag_id, page_num, x_pct, y_pct, created_by, created_at,
        tags:tag_id ( id, tag_number, description, status,
          disciplines:discipline_id ( id, code, name, color ),
          subsystems:subsystem_id ( systems:system_id ( id, code, name ) )
        )
      `)
      .eq('pid_document_id', docId)
      .eq('project_id', id),
    canEdit
      ? fetchAllRowsFlagged(() => supabase
          .from('tags')
          .select(pickerTagsSelect)
          .eq('project_id', id)
          .order('tag_number'))
      : Promise.resolve({ rows: [], truncated: false }),
  ])
  const allTags = pickerRes.rows

  // Estado por tag con pin, en lotes de 200 ids (largo de URL de PostgREST).
  const hotspotTagIds = [...new Set((rawHotspots ?? []).map(h => h.tag_id).filter(Boolean))]
  const chunks: string[][] = []
  for (let i = 0; i < hotspotTagIds.length; i += 200) chunks.push(hotspotTagIds.slice(i, i + 200))
  const [punchChunks, itrChunks] = await Promise.all([
    Promise.all(chunks.map(ids => fetchAllRows(() => supabase
      .from('punches')
      .select('id, tag_id, category')
      .eq('project_id', id)
      .in('tag_id', ids)
      .in('category', ['A', 'B'])
      .in('status', ['open', 'in_progress'])))),
    Promise.all(chunks.map(ids => fetchAllRows(() => supabase
      .from('itrs')
      .select('id, tag_id, status')
      .eq('project_id', id)
      .in('tag_id', ids)))),
  ])
  const openPunches = punchChunks.flat()
  const itrData = itrChunks.flat()

  // Build enrichment maps
  const punchACountByTag = new Map<string, number>()
  const punchBCountByTag = new Map<string, number>()
  for (const p of openPunches) {
    if (!p.tag_id) continue
    const map = p.category === 'A' ? punchACountByTag : punchBCountByTag
    map.set(p.tag_id, (map.get(p.tag_id) ?? 0) + 1)
  }

  const itrTotalByTag = new Map<string, number>()
  const itrApprovedByTag = new Map<string, number>()
  for (const itr of itrData) {
    if (!itr.tag_id) continue
    itrTotalByTag.set(itr.tag_id, (itrTotalByTag.get(itr.tag_id) ?? 0) + 1)
    if (itr.status === 'approved') {
      itrApprovedByTag.set(itr.tag_id, (itrApprovedByTag.get(itr.tag_id) ?? 0) + 1)
    }
  }

  // Sistema del tag (fase 2): el visor colorea y filtra los pines por sistema.
  type SystemRef = { id: string; code: string; name: string }
  const systemOf = (sub: unknown): SystemRef | null =>
    ((sub as { systems: SystemRef | null } | null)?.systems) ?? null

  // Enrich hotspots

  const hotspots = (rawHotspots ?? []).map(h => {
    const tag = h.tags
    const tagId = h.tag_id
    const total = itrTotalByTag.get(tagId) ?? 0
    const approved = itrApprovedByTag.get(tagId) ?? 0
    return {
      id: h.id,
      tag_id: tagId,
      page_num: h.page_num,
      x_pct: Number(h.x_pct),
      y_pct: Number(h.y_pct),
      tag: {
        id: tag?.id ?? tagId,
        tag_number: tag?.tag_number ?? '',
        description: tag?.description ?? '',
        status: tag?.status ?? 'not_started',
      },
      discipline: {
        id: tag?.disciplines?.id ?? '',
        code: tag?.disciplines?.code ?? '??',
        name: tag?.disciplines?.name ?? '',
        color: tag?.disciplines?.color ?? '#94a3b8',
      },
      system: systemOf(tag?.subsystems),
      open_punches_a: punchACountByTag.get(tagId) ?? 0,
      open_punches_b: punchBCountByTag.get(tagId) ?? 0,
      itr_completion_pct: total > 0 ? Math.round((approved / total) * 100) : 0,
    }
  })

  type TagItem = {
    id: string; tag_number: string; description: string; status: string
    discipline: { id: string; code: string; name: string; color: string }
    system: SystemRef | null
  }

  const tags: TagItem[] = allTags.map(t => {
    const disc = t.disciplines
    return {
      id: t.id,
      tag_number: t.tag_number,
      description: t.description,
      status: t.status,
      discipline: {
        id: disc?.id ?? '',
        code: disc?.code ?? '??',
        name: disc?.name ?? '',
        color: disc?.color ?? '#94a3b8',
      },
      system: systemOf(t.subsystems),
    }
  })

  const tl = await getTranslations('Common')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px',
        background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <Link
          href={`/projects/${id}/pid-documents`}
          style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          ← P&IDs
        </Link>
        <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
          {doc.drawing_number}
        </span>
        {doc.title && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{doc.title}</span>
        )}
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#94a3b8' }}>
          {hotspots.length} hotspot{hotspots.length !== 1 ? 's' : ''} marcados
        </div>
      </div>

      {pickerRes.truncated && (
        <div style={{ padding: '6px 20px', background: 'var(--warning-50)', color: 'var(--warning-700)', fontSize: '12px', flexShrink: 0 }}>
          {tl('listPartial')}
        </div>
      )}

      {/* Viewer */}
      <PidViewer
        signedUrl={signedData.signedUrl}
        hotspots={hotspots}
        tags={tags}
        projectId={id}
        docId={docId}
        canEdit={canEdit}
      />
    </div>
  )
}
