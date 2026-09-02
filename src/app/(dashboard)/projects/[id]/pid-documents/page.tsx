import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { normalizePidRef } from '@/lib/excel/normalize'
import PidDocumentsView, { type PidCoverage } from './PidDocumentsView'

// Fila mínima que necesitamos de tags para armar "sistemas por plano".
type TagPidRow = {
  pid_drawing: string | null
  subsystems: { code: string; systems: { code: string } | null } | null
}

const PAGE = 1000 // PostgREST limita a 1000 filas por respuesta; paginamos

export default async function PidDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const canEdit = ['owner', 'admin', 'architect'].includes(membership.role)

  const [{ data: project }, { data: documents }] = await Promise.all([
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
  ])

  if (!project) notFound()

  // Tags con referencia a P&ID + su subsistema/sistema. De aquí se derivan
  // (a) los planos referenciados pero sin PDF y (b) qué sistemas cubre cada plano.
  const tagRows: TagPidRow[] = []
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data } = await supabase
      .from('tags')
      .select('pid_drawing, subsystems:subsystem_id(code, systems:system_id(code))')
      .eq('project_id', id)
      .not('pid_drawing', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    tagRows.push(...(data as TagPidRow[]))
    if (data.length < PAGE) break
  }

  const agg = new Map<string, { tags: number; systems: Map<string, Set<string>> }>()
  for (const t of tagRows) {
    const key = normalizePidRef(t.pid_drawing)
    if (!key) continue
    const entry = agg.get(key) ?? { tags: 0, systems: new Map() }
    entry.tags++
    const sysCode = t.subsystems?.systems?.code ?? '—'
    const subs = entry.systems.get(sysCode) ?? new Set<string>()
    if (t.subsystems?.code) subs.add(t.subsystems.code)
    entry.systems.set(sysCode, subs)
    agg.set(key, entry)
  }
  const coverage: Record<string, PidCoverage> = {}
  for (const [key, entry] of agg) {
    coverage[key] = {
      tags: entry.tags,
      systems: [...entry.systems]
        .map(([code, subs]) => ({ code, subsystems: [...subs].sort() }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    }
  }

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

  // P&IDs referenciados en tags pero sin documento subido (comparación normalizada)
  const uploadedNumbers = new Set(docs.map(d => normalizePidRef(d.drawing_number)))
  const missingPids = Object.keys(coverage).filter(p => !uploadedNumbers.has(p)).sort()

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <a href={`/projects/${id}/tags`} style={{
          fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px',
        }}>
          ← Tags / Equipos
        </a>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
              Documentos P&ID
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {project.name} · {docs.length === 0 ? 'Sin documentos subidos' : `${docs.length} PDF${docs.length !== 1 ? 's' : ''} subido${docs.length !== 1 ? 's' : ''}`}
              {Object.keys(coverage).length > 0 && ` · ${Object.keys(coverage).length} planos referenciados en tags`}
            </p>
          </div>
        </div>
      </div>

      <PidDocumentsView
        projectId={id}
        documents={signedDocs}
        missingPids={missingPids}
        coverage={coverage}
        canEdit={canEdit}
      />
    </div>
  )
}
