import type { ActiveContext } from '@/lib/supabase/membership'
import type { CandidateTemplate } from './ai-adjust'

// R4: carga del lado del servidor para los ajustes con IA (la usan la acción y la página del costo estimado).

type Db = ActiveContext['supabase']

/**
 * Plantillas que la IA puede proponer: activas (última versión por código), de una disciplina del alcance del
 * proyecto y que no se generan desde lazo o matriz C&E (el motor de requisitos no las toma por tag).
 */
export async function loadAdjustCandidates(db: Db, orgId: string, projectId: string): Promise<CandidateTemplate[]> {
  const [{ data: tpls }, { data: scope }] = await Promise.all([
    // bounded: plantillas activas de una org (cientos)
    db.from('itr_templates').select('id, code, title, version, created_at, discipline_id, disciplines(code), project_phases(code)')
      .eq('org_id', orgId).eq('is_active', true).limit(3000),
    // bounded: disciplinas del alcance de un proyecto (decenas)
    db.from('project_disciplines').select('discipline_id').eq('project_id', projectId).limit(500),
  ])
  const inScope = new Set((scope ?? []).map(s => s.discipline_id))
  const latest = new Map<string, NonNullable<typeof tpls>[number]>()
  for (const t of tpls ?? []) {
    const cur = latest.get(t.code)
    if (!cur || t.version > cur.version || (t.version === cur.version && t.created_at > cur.created_at)) latest.set(t.code, t)
  }
  const chosen = [...latest.values()].filter(t => t.discipline_id && inScope.has(t.discipline_id))
  const { data: bySource } = chosen.length
    // bounded: ítems tabla «desde fuente» de las plantillas elegidas (pocos)
    ? await db.from('itr_template_items').select('template_id').in('template_id', chosen.map(t => t.id))
      .eq('item_type', 'table').eq('options->rows->>mode', 'source').limit(3000)
    : { data: [] as { template_id: string }[] }
  const source = new Set((bySource ?? []).map(r => r.template_id))
  return chosen.filter(t => !source.has(t.id))
    .map(t => ({
      code: t.code, title: t.title,
      discipline: (t.disciplines as { code: string } | null)?.code ?? null,
      phase: (t.project_phases as { code: string } | null)?.code ?? null,
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

