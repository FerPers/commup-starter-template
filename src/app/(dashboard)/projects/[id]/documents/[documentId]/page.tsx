import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { isDocumentController, type DocType, type RevisionStatus } from '@/lib/documents/catalog'
import DocumentDetail, { type RevisionRow, type UsageRow } from './DocumentDetail'

// Ficha de un documento del registro maestro (fase 8, sesión 1): revisiones (PDF y/o enlace al EDMS), vigente,
// sistemas y dónde se usa (ITR / procedimientos), con la revisión que referencia cada uno.
export default async function DocumentPage({ params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: doc } = await supabase.from('documents')
    .select('id, number, title, doc_type, discipline_id, company_id, current_revision_id, document_systems(system_id)')
    .eq('id', documentId).eq('project_id', id).maybeSingle()
  if (!doc) notFound()

  const [{ data: revisions }, { data: refs }, { data: systems }, { data: disciplines }, { data: companies }, { data: members }] = await Promise.all([
    supabase.from('document_revisions').select('id, seq, rev, status, issued_on, file_path, file_name, external_url, notes, created_by, created_at')
      .eq('document_id', documentId).order('seq', { ascending: false }),
    supabase.from('document_references')
      .select('id, target_kind, revision_id, revalidated_at, revalidation_reason, itrs(id, itr_number, tag_id, status), procedure_revisions(id, rev, status, procedure_id, procedures!procedure_revisions_procedure_id_fkey(number, title))')
      .eq('document_id', documentId).eq('project_id', id),
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('disciplines').select('id, code, name').eq('org_id', ctx.orgId).order('code'),
    supabase.from('companies').select('id, name, short_name').eq('org_id', ctx.orgId).order('name'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string | null } | null
    if (p?.full_name) names[m.user_id] = p.full_name
  }
  const revById = new Map((revisions ?? []).map(r => [r.id, r.rev]))

  const usage: UsageRow[] = (refs ?? []).map(r => {
    const itr = r.itrs as unknown as { id: string; itr_number: string; tag_id: string; status: string } | null
    const pr = r.procedure_revisions as unknown as { id: string; rev: number; status: string; procedure_id: string; procedures: { number: string; title: string } | null } | null
    return {
      id: r.id,
      kind: r.target_kind as 'itr' | 'procedure_revision',
      label: itr ? itr.itr_number : pr ? `${pr.procedures?.number ?? ''} R${pr.rev}` : '—',
      detail: itr ? itr.status : pr ? `${pr.procedures?.title ?? ''} · ${pr.status}` : '',
      href: itr ? `/projects/${id}/tags/${itr.tag_id}/itrs/${itr.id}` : pr ? `/projects/${id}/startup/procedures/${pr.procedure_id}?rev=${pr.id}` : null,
      usedRev: revById.get(r.revision_id) ?? '—',
      outdated: !!doc.current_revision_id && doc.current_revision_id !== r.revision_id,
      revalidated: !!r.revalidated_at,
      reason: r.revalidation_reason,
    }
  }).sort((a, b) => Number(b.outdated) - Number(a.outdated) || a.label.localeCompare(b.label))

  return (
    <DocumentDetail
      project={project}
      doc={{
        id: doc.id, number: doc.number, title: doc.title, docType: doc.doc_type as DocType, disciplineId: doc.discipline_id ?? '',
        companyId: doc.company_id ?? '', currentRevisionId: doc.current_revision_id,
        systemIds: ((doc.document_systems as unknown as { system_id: string }[] | null) ?? []).map(s => s.system_id),
      }}
      revisions={(revisions ?? []).map(r => ({ ...r, status: r.status as RevisionStatus })) as RevisionRow[]}
      usage={usage}
      systems={systems ?? []}
      disciplines={disciplines ?? []}
      companies={(companies ?? []).map(c => ({ id: c.id, name: c.short_name?.trim() ? c.short_name : c.name }))}
      names={names}
      canEdit={isDocumentController(ctx.role)}
    />
  )
}
