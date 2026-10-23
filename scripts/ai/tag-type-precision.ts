// R3: prueba de precisión de la clasificación de tipos por firma (Haiku 5.5 vs Sonnet 5.5).
//
//   npx tsx --env-file=.env.local scripts/ai/tag-type-precision.ts <project_code> [model]
//
// Toma los tags YA tipados del proyecto, arma sus firmas y le pide a la IA el tipo con el prefijo OCULTO (solo
// descripción y disciplina, sin ejemplos aprendidos): mide si entiende la descripción, que es lo que la detección
// gratis no resuelve. Después muestra lo que propondría para las firmas sin tipo. Solo lee la BD (service role) y
// no guarda nada; el costo sale al final.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createClient } from '@supabase/supabase-js'
import { aiCostUsd } from '../../src/lib/ai/pricing'
import { TYPE_RULES, TypeClassification, buildTypePrompt, reconcileTypeProposals, type ClassifyGroup } from '../../src/lib/tags/type-ai'
import { normDesc, tagPrefix, type CatalogType } from '../../src/lib/tags/type-signature'

const [code, model = 'claude-haiku-5-5'] = process.argv.slice(2)
if (!code) { console.error('Uso: tag-type-precision.ts <project_code> [model]'); process.exit(1) }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ai = new Anthropic()

async function main() {
  const { data: project } = await db.from('projects').select('id, org_id').eq('code', code).single()
  if (!project) throw new Error(`Proyecto ${code} no encontrado`)
  const [{ data: cat }, { data: tags }, { data: discs }] = await Promise.all([
    db.from('equipment_types').select('id, code, name, category').eq('org_id', project.org_id).order('code'),
    db.from('tags').select('tag_number, description, discipline_id, equipment_type_id').eq('project_id', project.id).limit(5000),
    db.from('disciplines').select('id, code, name').eq('org_id', project.org_id),
  ])
  const catalog = (cat ?? []) as CatalogType[]
  const disc = new Map((discs ?? []).map(d => [d.id, d]))

  type G = ClassifyGroup & { truth: string | null }
  function group(rows: typeof tags, hidePrefix: boolean): G[] {
    const m = new Map<string, G>()
    for (const t of rows ?? []) {
      const g = { prefix: tagPrefix(t.tag_number), desc: normDesc(t.description) }
      const key = `${g.prefix}|${t.discipline_id ?? ''}|${g.desc}|${t.equipment_type_id ?? ''}`
      const cur = m.get(key)
      if (cur) { cur.n++; if (cur.samples.length < 4) cur.samples.push(hidePrefix ? '—' : t.tag_number); continue }
      const d = t.discipline_id ? disc.get(t.discipline_id) : null
      m.set(key, {
        prefix: hidePrefix ? '' : g.prefix, discipline_id: t.discipline_id, discipline_code: d?.code ?? null, discipline_name: d?.name ?? null,
        desc_norm: g.desc, description: t.description, n: 1, samples: [hidePrefix ? '—' : t.tag_number], truth: t.equipment_type_id,
      })
    }
    return [...m.values()]
  }

  let cost = 0
  async function classify(groups: G[]) {
    const res = await ai.messages.parse({
      model, max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(TypeClassification) },
      system: TYPE_RULES,
      messages: [{ role: 'user', content: buildTypePrompt(groups, catalog, []) }],
    })
    cost += aiCostUsd(res.model, res.usage)
    if (!res.parsed_output) throw new Error(`Sin salida (${res.stop_reason})`)
    return reconcileTypeProposals(res.parsed_output, groups, catalog)
  }

  const codeOf = new Map(catalog.map(t => [t.id, t.code]))
  const typed = group((tags ?? []).filter(t => t.equipment_type_id), true)
  const out = await classify(typed)
  let ok = 0, okTags = 0, total = 0
  console.log(`\n== ${model} · ${typed.length} firmas tipadas (prefijo oculto) ==`)
  typed.forEach((g, i) => {
    const p = out.get(i)
    const got = p?.outcome === 'type' ? codeOf.get(p.typeId) : p?.outcome === 'new_type' ? `nuevo ${p.newType.code}` : 'nada'
    const truth = codeOf.get(g.truth!)
    const hit = got === truth
    ok += hit ? 1 : 0; okTags += hit ? g.n : 0; total += g.n
    console.log(`${hit ? '✓' : '✗'} «${g.description}» (${g.discipline_code ?? '—'}, ${g.n}) → ${got} ${hit ? '' : `[real ${truth}]`} · ${p?.confidence.toFixed(2)} · ${p?.reason}`)
  })
  console.log(`\nAcierto: ${ok}/${typed.length} firmas (${((100 * ok) / typed.length).toFixed(0)} %) · ${okTags}/${total} tags (${((100 * okTags) / total).toFixed(0)} %)`)

  const untyped = group((tags ?? []).filter(t => !t.equipment_type_id), false)
  if (untyped.length) {
    const u = await classify(untyped)
    console.log(`\n== ${untyped.length} firmas sin tipo ==`)
    untyped.forEach((g, i) => {
      const p = u.get(i)
      const got = p?.outcome === 'type' ? codeOf.get(p.typeId) : p?.outcome === 'new_type' ? `nuevo ${p.newType.code} «${p.newType.name}» (${p.newType.category})` : 'nada'
      console.log(`${g.prefix} «${g.description}» (${g.discipline_code ?? '—'}, ${g.n}) → ${got} · ${p?.confidence.toFixed(2)} · ${p?.reason}`)
    })
  }
  console.log(`\nCosto: US$ ${cost.toFixed(4)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
