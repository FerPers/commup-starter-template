import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import type { DocumentOption, DocumentRef } from '@/components/documents/DocumentReferences'
import type { ReferenceKind } from './catalog'

// Carga, para un ITR o una revisión de procedimiento, sus referencias a documentos (con revisión usada vs
// vigente) y los documentos del proyecto que se pueden referenciar (fase 8, sesión 1).

type Rev = { id: string; rev: string } | null

export async function loadDocumentRefs(
  db: SupabaseClient<Database>, projectId: string, kind: ReferenceKind, targetId: string,
): Promise<{ refs: DocumentRef[]; options: DocumentOption[] }> {
  const col = kind === 'itr' ? 'itr_id' : 'procedure_revision_id'
  const [{ data: rows }, { data: docs }] = await Promise.all([
    db.from('document_references')
      .select('id, document_id, revision_id, revalidated_at, revalidation_reason, used:document_revisions!document_references_revision_id_fkey(id, rev), from:document_revisions!document_references_revalidated_from_fkey(id, rev)')
      .eq('project_id', projectId).eq(col, targetId),
    db.from('documents')
      .select('id, number, title, current_revision_id, current:document_revisions!documents_current_revision_fkey(id, rev)')
      .eq('project_id', projectId).order('number').limit(2000),
  ])
  const byId = new Map((docs ?? []).map(d => [d.id, d]))
  const refs: DocumentRef[] = (rows ?? []).map(r => {
    const d = byId.get(r.document_id)
    const cur = (d?.current as unknown as Rev) ?? null
    return {
      id: r.id,
      document_id: r.document_id,
      number: d?.number ?? '—',
      title: d?.title ?? '',
      used_rev: (r.used as unknown as Rev)?.rev ?? '—',
      current_rev: cur?.rev ?? null,
      outdated: !!d?.current_revision_id && d.current_revision_id !== r.revision_id,
      revalidated_at: r.revalidated_at,
      revalidated_from_rev: (r.from as unknown as Rev)?.rev ?? null,
      revalidation_reason: r.revalidation_reason,
    }
  }).sort((a, b) => a.number.localeCompare(b.number))
  const options: DocumentOption[] = (docs ?? []).map(d => ({
    id: d.id, number: d.number, title: d.title, current_rev: (d.current as unknown as Rev)?.rev ?? null,
  }))
  return { refs, options }
}
