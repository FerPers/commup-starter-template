import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import type { DocumentOption, DocumentRef } from '@/components/documents/DocumentReferences'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import type { ReferenceKind } from './catalog'

const DOC_SELECT = 'id, number, title, current_revision_id, current:document_revisions!documents_current_revision_fkey(id, rev, status)'
const IN_CHUNK = 200

export async function loadDocumentRefs(
  db: SupabaseClient<Database>, projectId: string, kind: ReferenceKind, targetId: string,
): Promise<{ refs: DocumentRef[]; options: DocumentOption[] }> {
  const col = kind === 'itr' ? 'itr_id' : 'procedure_revision_id'
  // S09 (F-07): PostgREST corta en 1000 filas. Los documentos referenciados se cargan por id (en lotes) para que
  // una referencia a un documento más allá de la fila 1000 nunca salga como «—» / vigente; las opciones del
  // selector se paginan completas.
  const [{ data: rows }, { rows: docs }] = await Promise.all([
    db.from('document_references')
      .select('id, document_id, revision_id, revalidated_at, revalidation_reason, used:document_revisions!document_references_revision_id_fkey(id, rev, status), from:document_revisions!document_references_revalidated_from_fkey(id, rev)')
      .eq('project_id', projectId).eq(col, targetId),
    fetchAllRowsFlagged(() => db.from('documents').select(DOC_SELECT).eq('project_id', projectId).order('number')),
  ])
  const byId = new Map(docs.map(d => [d.id, d]))
  const missing = [...new Set((rows ?? []).map(r => r.document_id))].filter(docId => !byId.has(docId))
  for (let i = 0; i < missing.length; i += IN_CHUNK) {
    const { data: extra, error } = await db.from('documents').select(DOC_SELECT)
      .eq('project_id', projectId).in('id', missing.slice(i, i + IN_CHUNK))
    if (error) throw new Error(error.message)
    for (const d of extra ?? []) byId.set(d.id, d)
  }
  const refs: DocumentRef[] = (rows ?? []).map(r => {
    const d = byId.get(r.document_id)
    const cur = (d?.current) ?? null
    return {
      id: r.id,
      document_id: r.document_id,
      number: d?.number ?? '—',
      title: d?.title ?? '',
      used_rev: (r.used)?.rev ?? '—',
      used_status: (r.used)?.status ?? null,
      current_rev: cur?.rev ?? null,
      outdated: !!d?.current_revision_id && d.current_revision_id !== r.revision_id,
      revalidated_at: r.revalidated_at,
      revalidated_from_rev: (r.from)?.rev ?? null,
      revalidation_reason: r.revalidation_reason,
    }
  }).sort((a, b) => a.number.localeCompare(b.number))
  const options: DocumentOption[] = docs.map(d => ({
    id: d.id, number: d.number, title: d.title, current_rev: (d.current)?.rev ?? null,
    current_status: (d.current)?.status ?? null,
  }))
  return { refs, options }
}
