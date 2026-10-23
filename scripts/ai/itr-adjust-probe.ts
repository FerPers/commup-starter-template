// R4: sonda del prompt de ajustes con firmas sintéticas (no guarda nada). Uso:
//   npx tsx --env-file=.env.local scripts/ai/itr-adjust-probe.ts <project_code>
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createClient } from '@supabase/supabase-js'
import { aiCostUsd } from '../../src/lib/ai/pricing'
import { ADJUST_RULES, AdjustOutput, buildAdjustPrompt, catalogPrompt, reconcileAdjust, type AiSignature } from '../../src/lib/itr/ai-adjust'
import { loadAdjustCandidates } from '../../src/lib/itr/ai-adjust-server'

async function main() {
  const code = process.argv[2]
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: project } = await db.from('projects').select('id, org_id').eq('code', code).single()
  if (!project) throw new Error('proyecto no encontrado')
  const candidates = await loadAdjustCandidates(db as never, project.org_id, project.id)
  const base: Omit<AiSignature, 'prefix' | 'description' | 'desc_norm' | 'sil_level' | 'fluid_type' | 'signal_type' | 'samples' | 'type_code' | 'type_name' | 'base'> = {
    equipment_type_id: 'x', discipline_id: 'd', discipline_code: 'INST', discipline_name: 'Instruments', n: 6, review_state: 'pending', proposals: [], open: 0,
  }
  const groups: AiSignature[] = [
    { ...base, type_code: 'XV', type_name: 'Válvula de Bloqueo / ESD', prefix: 'HV', description: 'Válvula manual de bloqueo 2" (sin actuador)', desc_norm: '', sil_level: null, fluid_type: 'Agua', signal_type: null, samples: ['HV-201', 'HV-202'], base: ['I01A', 'I05A', 'I08A', 'I11A', 'I11B', 'I27B'] },
    { ...base, type_code: 'TT', type_name: 'Transmisor de Temperatura', prefix: 'TT', description: 'Transmisor de temperatura con termopozo, al SIS (SIL 2)', desc_norm: '', sil_level: 'SIL 2', fluid_type: 'Gas', signal_type: '4-20 mA HART', samples: ['TT-301A', 'TT-301B'], base: ['I01A', 'I05A', 'I10A', 'I42B'] },
  ]
  const res = await new Anthropic().messages.parse({
    model: 'claude-opus-5-5', max_tokens: 16000,
    output_config: { effort: 'medium', format: zodOutputFormat(AdjustOutput) },
    system: [{ type: 'text', text: ADJUST_RULES }, { type: 'text', text: `CATÁLOGO (código | título | disciplina | fase):\n${catalogPrompt(candidates)}` }],
    messages: [{ role: 'user', content: buildAdjustPrompt(groups) }],
  })
  console.log(JSON.stringify(res.parsed_output, null, 1))
  console.log('conciliado:', JSON.stringify([...reconcileAdjust(res.parsed_output!, groups, new Set(candidates.map(c => c.code))).entries()]))
  console.log('costo', aiCostUsd(res.model, res.usage).toFixed(4))
}
main().catch(e => { console.error(e); process.exit(1) })
