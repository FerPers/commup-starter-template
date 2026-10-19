import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { isDocumentController, type DocType, type RevisionStatus } from '@/lib/documents/catalog'
import DocumentsView, { type DocRow } from './DocumentsView'

// Registro maestro de documentos (fase 8, sesión 1; libro 19.6): número, revisión vigente, estado, sistemas y
// cuántos registros (ITR / procedimientos) usan una revisión superada.
export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: docs }, { data: refs }, { data: systems }, { data: disciplines }, { data: companies }] = await Promise.all([
    supabase.from('documents')
      .select('id, number, title, doc_type, discipline_id, company_id, current_revision_id, updated_at, current:document_revisions!documents_current_revision_fkey(rev, status, issued_on), document_systems(system_id), document_revisions!document_revisions_document_id_fkey(status)')
      .eq('project_id', id).order('number').limit(5000),
    supabase.from('document_references').select('document_id, revision_id').eq('project_id', id).limit(20000),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('disciplines').select('id, code, name').eq('org_id', ctx.orgId).order('code'),
    supabase.from('companies').select('id, name, short_name').eq('org_id', ctx.orgId).eq('is_active', true).order('name'),
  ])

  const refsByDoc = new Map<string, { total: number; outdated: number }>()
  const current = new Map((docs ?? []).map(d => [d.id, d.current_revision_id]))
  for (const r of refs ?? []) {
    const e = refsByDoc.get(r.document_id) ?? { total: 0, outdated: 0 }
    e.total += 1
    const cur = current.get(r.document_id)
    if (cur && cur !== r.revision_id) e.outdated += 1
    refsByDoc.set(r.document_id, e)
  }

  const rows: DocRow[] = (docs ?? []).map(d => {
    const cur = d.current as unknown as { rev: string; status: RevisionStatus; issued_on: string | null } | null
    const revs = (d.document_revisions as unknown as { status: string }[] | null) ?? []
    return {
      id: d.id, number: d.number, title: d.title, docType: d.doc_type as DocType, disciplineId: d.discipline_id, companyId: d.company_id,
      currentRev: cur?.rev ?? null, currentStatus: cur?.status ?? null, issuedOn: cur?.issued_on ?? null,
      hasDraft: revs.some(r => r.status === 'draft'),
      systemIds: ((d.document_systems as unknown as { system_id: string }[] | null) ?? []).map(s => s.system_id),
      refs: refsByDoc.get(d.id)?.total ?? 0, outdatedRefs: refsByDoc.get(d.id)?.outdated ?? 0,
    }
  })

  return (
    <DocumentsView
      project={project}
      rows={rows}
      systems={systems ?? []}
      disciplines={disciplines ?? []}
      companies={(companies ?? []).map(c => ({ id: c.id, name: c.short_name?.trim() ? c.short_name : c.name }))}
      canEdit={isDocumentController(ctx.role)}
    />
  )
}
