/**
 * N2d: un P&ID es un documento del registro (doc_type = 'pid', número = número de plano normalizado como el campo
 * «P&ID» de tags y señales). Resuelve números de plano → documento, revisión vigente y PDF firmado (bucket
 * project-documents), en una consulta y una firma por lote.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { normalizePidRef } from '@/lib/excel/normalize'

export type PidDrawing = { documentId: string; number: string; revisionId: string | null; rev: string | null; signedUrl: string | null }

export async function loadPidDrawings(
  supabase: SupabaseClient<Database>,
  projectId: string,
  drawings: readonly (string | null | undefined)[],
  ttlSeconds = 3600,
): Promise<Map<string, PidDrawing>> {
  const numbers = [...new Set(drawings.map(d => normalizePidRef(d)).filter((d): d is string => !!d))]
  const out = new Map<string, PidDrawing>()
  if (!numbers.length) return out
  const { data } = await supabase
    .from('documents')
    .select('id, number, current:document_revisions!documents_current_revision_fkey(id, rev, file_path)')
    .eq('project_id', projectId)
    .eq('doc_type', 'pid')
    .in('number', numbers.slice(0, 500))
    .limit(500)
  const rows = (data ?? []).map(d => ({ ...d, current: d.current as unknown as { id: string; rev: string; file_path: string | null } | null }))
  const paths = rows.map(r => r.current?.file_path).filter((p): p is string => !!p)
  const { data: signed } = paths.length
    ? await supabase.storage.from('project-documents').createSignedUrls(paths, ttlSeconds)
    : { data: [] as { path: string | null; signedUrl: string }[] }
  const urlByPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))
  for (const r of rows) {
    out.set(normalizePidRef(r.number) ?? r.number, {
      documentId: r.id, number: r.number, revisionId: r.current?.id ?? null, rev: r.current?.rev ?? null,
      signedUrl: r.current?.file_path ? urlByPath.get(r.current.file_path) ?? null : null,
    })
  }
  return out
}

export function pidViewerHref(projectId: string, documentId: string, tagId?: string): string {
  return `/projects/${projectId}/documents/${documentId}/viewer${tagId ? `?tag=${tagId}` : ''}`
}
