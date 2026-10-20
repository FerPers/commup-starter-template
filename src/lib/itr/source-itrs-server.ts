import type { SupabaseClient } from '@supabase/supabase-js'
import type { GenerationMember, GenerationTemplate } from '@/components/itr/GenerateSourceItrsModal'
import { requiredForTemplate } from '@/lib/itr/signatures'
import { fetchAllRows } from '@/lib/list/fetch-all'
import { isOutdated, latestItr, rowResults, type RowResult } from '@/lib/ce/test-status'

// Datos de los ITR generados desde lazos o causas C&E (fase 4-D, sesión 2) para las pantallas de lazos
// y de la matriz: plantillas utilizables, miembros asignables y el ITR vigente de cada lazo/causa con su
// estado, si quedó desactualizado frente al lazo/matriz actual y el resultado por fila.

export type SourceItrInfo = {
  id: string
  itrNumber: string
  status: string
  tagId: string | null
  outdated: boolean
  /** Resultado por señal/efecto (clave = id de la señal o del efecto). */
  rows: Record<string, RowResult>
}

export async function loadGenerationTemplates(supabase: SupabaseClient, orgId: string, source: 'loop_signals' | 'ce_effects'): Promise<GenerationTemplate[]> {
  const { data } = await supabase
    .from('itr_template_items')
    .select('template_id, itr_templates!inner(id, code, title, version, is_active, org_id, required_signatures, project_phases(itr_client_signature))')
    .eq('item_type', 'table')
    .eq('options->rows->>source', source)
    .eq('itr_templates.org_id', orgId)
    .eq('itr_templates.is_active', true)
  const map = new Map<string, GenerationTemplate>()
  for (const row of data ?? []) {
    const t = row.itr_templates as unknown as { id: string; code: string; title: string; version: number; required_signatures: string[]; project_phases: { itr_client_signature: boolean } | null }
    map.set(t.id, { id: t.id, code: t.code, title: t.title, version: t.version, requiredSignatures: requiredForTemplate(t.required_signatures, t.project_phases?.itr_client_signature) })
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code) || b.version - a.version)
}

export async function loadMembers(supabase: SupabaseClient, orgId: string): Promise<GenerationMember[]> {
  const { data } = await supabase.from('org_members').select('user_id, role, profiles(full_name)').eq('org_id', orgId).order('role')
  return (data ?? []).map(m => ({ user_id: m.user_id, role: String(m.role), name: (m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? m.user_id }))
}

const IN_CHUNK = 200

async function inChunks<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(...(await load(ids.slice(i, i + IN_CHUNK))))
  return out
}

/** ITR vigente (el más reciente) por lazo o por causa, con desactualización y resultados por fila. */
export async function loadSourceItrs(supabase: SupabaseClient, kind: 'loop' | 'cause', ids: string[]): Promise<Record<string, SourceItrInfo>> {
  if (!ids.length) return {}
  const column = kind === 'loop' ? 'loop_id' : 'ce_cause_id'
  // S09 (B-07): en lotes de 200 ids (largo de URL) y paginado (antes un .limit(5000) que PostgREST corta en 1000)
  const itrs = await inChunks(ids, chunk => fetchAllRows(() => supabase
    .from('itrs')
    .select('id, itr_number, status, tag_id, created_at, source_rows, template_id, loop_id, ce_cause_id')
    .in(column, chunk)))
  const byOwner = new Map<string, typeof itrs>()
  for (const itr of itrs) {
    const owner = (kind === 'loop' ? itr.loop_id : itr.ce_cause_id) as string
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), itr])
  }
  const latest = [...byOwner.entries()].map(([owner, list]) => [owner, latestItr(list)!] as const)
  if (!latest.length) return {}

  const itrIds = latest.map(([, itr]) => itr.id)
  const templateIds = [...new Set(latest.map(([, itr]) => itr.template_id))]
  const rpc = kind === 'loop' ? 'itr_loop_source_rows' : 'itr_cause_source_rows'
  const [{ data: items }, { data: responses }, current] = await Promise.all([
    supabase.from('itr_template_items').select('id, template_id, item_type, options').in('template_id', templateIds).eq('item_type', 'table'),
    inChunks(itrIds, chunk => fetchAllRows(() => supabase.from('itr_responses').select('itr_id, item_id, value_text').in('itr_id', chunk)))
      .then(data => ({ data })),
    Promise.all(latest.map(([owner]) => supabase.rpc(rpc, kind === 'loop' ? { p_loop_id: owner } : { p_cause_id: owner }).then(r => [owner, r.data] as const))),
  ])
  const currentRows = new Map(current)
  const out: Record<string, SourceItrInfo> = {}
  for (const [owner, itr] of latest) {
    const results = rowResults(
      (items ?? []).filter(i => i.template_id === itr.template_id),
      (responses ?? []).filter(r => r.itr_id === itr.id),
      itr.source_rows,
    )
    out[owner] = {
      id: itr.id, itrNumber: itr.itr_number, status: String(itr.status), tagId: itr.tag_id,
      outdated: isOutdated(itr.source_rows, currentRows.get(owner)),
      rows: Object.fromEntries(results),
    }
  }
  return out
}
