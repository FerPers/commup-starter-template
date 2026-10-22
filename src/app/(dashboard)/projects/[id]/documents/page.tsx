import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { documentPolicy, isDocumentController, type DocType, type RevisionStatus } from '@/lib/documents/catalog'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import DocumentsView, { type DocRow, type PidInfo } from './DocumentsView'
import { DOC_TYPES } from '@/lib/documents/catalog'
import { normalizePidRef } from '@/lib/excel/normalize'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'

// Registro maestro de documentos (fase 8, sesión 1; libro 19.6): número, revisión vigente, estado, sistemas y
// cuántos registros (ITR / procedimientos) usan una revisión superada.
export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const initialType = (DOC_TYPES as readonly string[]).includes(sp.type ?? '') ? (sp.type as DocType) : ''
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  // S09 (F-07): PostgREST corta en 1000 filas aunque se pida .limit(5000); se pagina con .range().
  const [docsRes, refsRes, { data: systems }, { data: disciplines }, { data: companies }, { data: org }] = await Promise.all([
    fetchAllRowsFlagged(() => supabase.from('documents')
      .select('id, number, title, doc_type, discipline_id, company_id, current_revision_id, updated_at, current:document_revisions!documents_current_revision_fkey(id, rev, status, issued_on, file_path), document_systems(system_id), document_revisions!document_revisions_document_id_fkey(status)')
      .eq('project_id', id).order('number')),
    fetchAllRowsFlagged(() => supabase.from('document_references').select('id, document_id, revision_id').eq('project_id', id), { maxRows: 200_000 }),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('disciplines').select('id, code, name').eq('org_id', ctx.orgId).order('code'),
    supabase.from('companies').select('id, name, short_name').eq('org_id', ctx.orgId).eq('is_active', true).order('name'),
    supabase.from('organizations').select('settings').eq('id', ctx.orgId).single(),
  ])

  const docs = docsRes.rows
  const refs = refsRes.rows
  const truncated = docsRes.truncated || refsRes.truncated

  const refsByDoc = new Map<string, { total: number; outdated: number }>()
  const current = new Map(docs.map(d => [d.id, d.current_revision_id]))
  for (const r of refs) {
    const e = refsByDoc.get(r.document_id) ?? { total: 0, outdated: 0 }
    e.total += 1
    const cur = current.get(r.document_id)
    if (cur && cur !== r.revision_id) e.outdated += 1
    refsByDoc.set(r.document_id, e)
  }

  const rows: DocRow[] = docs.map(d => {
    const cur = d.current as unknown as { id: string; rev: string; status: RevisionStatus; issued_on: string | null; file_path: string | null } | null
    const revs = (d.document_revisions as unknown as { status: string }[] | null) ?? []
    return {
      id: d.id, number: d.number, title: d.title, docType: d.doc_type as DocType, disciplineId: d.discipline_id, companyId: d.company_id,
      currentRev: cur?.rev ?? null, currentStatus: cur?.status ?? null, issuedOn: cur?.issued_on ?? null,
      hasDraft: revs.some(r => r.status === 'draft'),
      systemIds: ((d.document_systems as unknown as { system_id: string }[] | null) ?? []).map(s => s.system_id),
      refs: refsByDoc.get(d.id)?.total ?? 0, outdatedRefs: refsByDoc.get(d.id)?.outdated ?? 0,
      currentHasFile: !!cur?.file_path,
    }
  })

  // N2d: P&ID del registro — pines de la revisión vigente y planos citados por tags que no tienen documento.
  const pidDocs = docs.filter(d => d.doc_type === 'pid')
  const currentPidRevs = pidDocs.map(d => d.current_revision_id).filter((r): r is string => !!r)
  const docByRev = new Map(pidDocs.map(d => [d.current_revision_id, d.id]))
  const pid: PidInfo = { pins: {}, missing: [] }
  if (currentPidRevs.length) {
    const { rows: pins } = await fetchAllRowsFlagged(() => supabase.from('pid_hotspots').select('id, revision_id, needs_review')
      .eq('project_id', id).in('revision_id', currentPidRevs.slice(0, 300)))
    for (const h of pins) {
      const doc = docByRev.get(h.revision_id)
      if (!doc) continue
      const e = pid.pins[doc] ?? { count: 0, review: 0 }
      e.count += 1
      if (h.needs_review) e.review += 1
      pid.pins[doc] = e
    }
  }
  if (initialType === 'pid') {
    const { rows: tagPids } = await fetchAllRowsFlagged(() => supabase.from('tags').select('id, pid_drawing')
      .eq('project_id', id).not('pid_drawing', 'is', null))
    const have = new Set(pidDocs.map(d => normalizePidRef(d.number)))
    pid.missing = [...new Set(tagPids.map(t => normalizePidRef(t.pid_drawing)).filter((n): n is string => !!n && !have.has(n)))].sort()
  }

  const tl = await getTranslations('Common')
  return (
    <>
    {truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
    <DocumentsView
      project={project}
      rows={rows}
      systems={systems ?? []}
      disciplines={disciplines ?? []}
      companies={(companies ?? []).map(c => ({ id: c.id, name: c.short_name?.trim() ? c.short_name : c.name }))}
      canEdit={isDocumentController(ctx.role)}
      policy={documentPolicy(org?.settings)}
      canAdmin={ctx.role === 'owner' || ctx.role === 'admin'}
      initialType={initialType}
      pid={pid}
    />
    </>
  )
}
