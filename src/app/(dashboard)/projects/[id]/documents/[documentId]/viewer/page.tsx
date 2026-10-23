import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import PidViewer from './PidViewer'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { fetchAllRows } from '@/lib/list/fetch-all'
import { fromStoredPoints, type MarkupKind } from '@/lib/pid/markups'
import { normalizeRotation } from '@/lib/pid/geometry'
import type { ApprovedGates, Hotspot, MarkupView, SystemRef } from './types'

// N2d: visor de un documento P&ID (doc_type = 'pid'). Abre la revisión vigente o la de `?rev=`; los pines son de esa
// revisión. Al emitirse una revisión nueva, los de la anterior llegan copiados y «por revisar» hasta confirmarlos.
export default async function PidViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; documentId: string }>
  searchParams: Promise<{ rev?: string }>
}) {
  const [{ id, documentId }, sp] = await Promise.all([params, searchParams])

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

  const { data: doc } = await supabase
    .from('documents')
    .select('id, number, title, doc_type, current_revision_id')
    .eq('id', documentId)
    .eq('project_id', id)
    .maybeSingle()
  if (!doc || doc.doc_type !== 'pid') notFound()

  // bounded: revisiones de un documento
  const { data: revisions } = await supabase
    .from('document_revisions')
    .select('id, seq, rev, status, issued_on, file_path')
    .eq('document_id', documentId)
    .neq('status', 'void')
    .order('seq', { ascending: false })
    .limit(100)
  const revs = revisions ?? []
  const revision = revs.find(r => r.id === sp.rev) ?? revs.find(r => r.id === doc.current_revision_id) ?? revs.find(r => r.file_path) ?? null
  const t = await getTranslations('PidViewer')
  if (!revision?.file_path) {
    return (
      <div style={{ padding: 'clamp(12px, 4vw, 32px)' }}>
        <Link href={`/projects/${id}/documents/${documentId}`} style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>← {doc.number}</Link>
        <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>{t('noFile')}</p>
      </div>
    )
  }

  // Generate signed URL (1hr) — los PDF del registro (bucket project-documents, inmutables).
  const { data: signedData } = await supabase.storage
    .from('project-documents')
    .createSignedUrl(revision.file_path, 3600)

  if (!signedData?.signedUrl) notFound()

  // P2: marcas LOSH de la revisión (capa losh; redline llega con F-21), sistemas del proyecto para elegir a cuál
  // pertenece una marca, y liberaciones aprobadas por sistema (editar sus marcas queda registrado).
  // Topes = el de PostgREST (1000): una revisión de un plano no llega a mil marcas, ni un proyecto a mil sistemas.
  const [{ data: rawMarkups }, { data: projectSystems }, { data: approvals }] = await Promise.all([
    supabase
      .from('pid_markups')
      .select('id, page_num, kind, system_id, other_system_id, points, page_width, page_height, page_rotation, label, needs_review')
      .eq('revision_id', revision.id)
      .eq('project_id', id)
      .eq('layer', 'losh')
      .order('created_at')
      .limit(1000),
    supabase.from('systems').select('id, code, name, color').eq('project_id', id).order('code').limit(1000),
    supabase
      .from('system_gate_approvals')
      .select('system_id, readiness_gates(code, order_index)')
      .eq('project_id', id)
      .is('revoked_at', null)
      .limit(1000),
  ])
  const markups: MarkupView[] = (rawMarkups ?? []).flatMap(m => (m.system_id ? [{
    id: m.id,
    page_num: m.page_num,
    kind: m.kind as MarkupKind,
    system_id: m.system_id,
    other_system_id: m.other_system_id,
    points: fromStoredPoints(m.points),
    page_width: Number(m.page_width),
    page_height: Number(m.page_height),
    page_rotation: normalizeRotation(m.page_rotation),
    label: m.label,
    needs_review: m.needs_review,
  }] : []))
  const systems: SystemRef[] = projectSystems ?? []
  const approvedGates: ApprovedGates = {}
  for (const a of [...(approvals ?? [])].sort((x, y) => (x.readiness_gates?.order_index ?? 0) - (y.readiness_gates?.order_index ?? 0))) {
    const code = a.readiness_gates?.code
    if (!code) continue
    const list = (approvedGates[a.system_id] ??= [])
    if (!list.includes(code)) list.push(code)
  }

  // S09 (B-07, F-08): el estado de cada pin se calcula SOLO con los tags que tienen pin en este plano
  // (antes se leían todos los tags/punches/ITR del proyecto y PostgREST cortaba en 1000 filas, así que
  // `itr_completion_pct` salía de una muestra). P1: el selector de tags busca en el servidor (searchPidTags).
  // bounded: pines de una revisión de un plano (tope 5000)
  const { data: rawHotspots } = await supabase
      .from('pid_hotspots')
      .select(`
        id, tag_id, page_num, x_pct, y_pct, needs_review, created_by, created_at,
        tags:tag_id ( id, tag_number, description, status,
          disciplines:discipline_id ( id, code, name, color ),
          subsystems:subsystem_id ( systems:system_id ( id, code, name, color ) )
        )
      `)
      .eq('revision_id', revision.id)
      .eq('project_id', id)
      .limit(5000)

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

  // Sistema del tag (fase 2): el visor colorea (P1: con el color del sistema) y filtra los pines por sistema.
  const systemOf = (sub: unknown): SystemRef | null =>
    ((sub as { systems: SystemRef | null } | null)?.systems) ?? null

  // Enrich hotspots

  const hotspots: Hotspot[] = (rawHotspots ?? []).map(h => {
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
      needs_review: h.needs_review,
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

  return (
    // P2: alto = pantalla menos el Topbar (56 px); con 100dvh los controles de zoom de abajo quedaban fuera.
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 56px)', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', flexWrap: 'wrap',
        background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <Link href={`/projects/${id}/documents/${documentId}`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← {t('back')}
        </Link>
        <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>{doc.number}</span>
        {doc.title && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{doc.title}</span>}
        <nav aria-label={t('revisions')} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {revs.filter(r => r.file_path).map(r => {
            const on = r.id === revision.id
            return (
              <Link key={r.id} href={`/projects/${id}/documents/${documentId}/viewer?rev=${r.id}`} aria-current={on ? 'page' : undefined}
                style={{ padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: 'none',
                  border: `1px solid ${on ? 'var(--text-strong)' : 'var(--border)'}`, background: on ? 'var(--text-strong)' : 'transparent', color: on ? 'var(--card-bg)' : 'var(--text-muted)' }}>
                {t('rev', { rev: r.rev })}{r.id === doc.current_revision_id ? ` · ${t('current')}` : ''}
              </Link>
            )
          })}
        </nav>
        {revision.id !== doc.current_revision_id && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#b45309' }}>{t('notCurrent')}</span>
        )}
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
          {t('pins', { count: hotspots.length })} · {t('markups', { count: markups.length })}
        </div>
      </div>

      {/* Viewer */}
      <PidViewer
        signedUrl={signedData.signedUrl}
        hotspots={hotspots}
        markups={markups}
        systems={systems}
        approvedGates={approvedGates}
        projectId={id}
        documentId={documentId}
        revisionId={revision.id}
        canEdit={canEdit}
      />
    </div>
  )
}
