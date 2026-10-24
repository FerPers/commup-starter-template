import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { evaluateItrCompletion, type CompletionItem, type CompletionResponse } from '@/lib/itr/completion'
import { requireDbEnv } from './env'

/**
 * A29: evaluate_itr_capture (la que usa sign_itr_atomic) = evaluateItrCompletion (la que ve el inspector), sobre los
 * mismos datos en la BD. Una plantilla con texto, número, casilla, sí/no, selección con resultados, medición crítica
 * con límites, fecha y condiciones encadenadas; otra con condiciones inválidas (ciclo, valor nulo). Por escenario se
 * reemplazan las respuestas del ITR y se compara completitud, avance, aplicables, faltantes, condiciones inválidas y
 * rechazo crítico. Siembra en TEST_PROJECT_A_ID su propia jerarquía; al final borra todo.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const LEADER = 'e2e00000-0000-4000-8000-0000000000a2'
const pid = env.TEST_PROJECT_A_ID!
const stamp = `CP${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let userId = ''
const ids = { org: '', phase: '', disc: '', area: '', sub: '', tag: '', templates: [] as string[] }
const item: Record<string, string> = {}
const itr = { main: '', invalid: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

type ItemSpec = { key: string; item_type: string; is_required?: boolean; is_critical?: boolean; options?: unknown; option_outcomes?: unknown; acceptance_min?: number; acceptance_max?: number; condition?: [string, string | null] }

async function template(code: string, specs: ItemSpec[]) {
  const tpl = (await must<{ id: string }>('template', a.from('itr_templates').insert({
    org_id: ids.org, discipline_id: ids.disc, phase_id: ids.phase, code, title: 'paridad', is_active: true, required_signatures: ['executor', 'supervisor'],
  }).select('id').single())).id
  ids.templates.push(tpl)
  const sec = await must<{ id: string }>('section', a.from('itr_template_sections').insert({ template_id: tpl, title: 'test', order_index: 0 }).select('id').single())
  for (const [i, s] of specs.entries()) {
    item[s.key] = (await must<{ id: string }>(`item ${s.key}`, a.from('itr_template_items').insert({
      template_id: tpl, section_id: sec.id, description: s.key, item_type: s.item_type, is_required: s.is_required ?? true, is_critical: s.is_critical ?? false,
      options: s.options ?? null, option_outcomes: s.option_outcomes ?? {}, acceptance_min: s.acceptance_min ?? null, acceptance_max: s.acceptance_max ?? null, order_index: i,
    }).select('id').single())).id
  }
  for (const s of specs) if (s.condition) {
    await must(`condition ${s.key}`, a.from('itr_template_items').update({ condition_item_id: item[s.condition[0]], condition_value: s.condition[1] }).eq('id', item[s.key]).select('id'))
  }
  const created = await a.rpc('create_itr', {
    p_id: crypto.randomUUID(), p_project_id: pid, p_tag_id: ids.tag, p_subsystem_id: ids.sub, p_template_id: tpl,
    p_itr_number: `${code}-ITR`, p_assignments: { executor: userId, supervisor: LEADER },
  })
  if (created.error) throw new Error(`create_itr: ${created.error.message}`)
  return { templateId: tpl, itrId: (created.data as { id: string }).id }
}

type Answer = Partial<Pick<CompletionResponse, 'value_text' | 'value_numeric' | 'value_bool' | 'value_option' | 'remarks' | 'is_passed'>>

async function compare(itrId: string, templateId: string, answers: Record<string, Answer>) {
  await must('clear', a.from('itr_responses').delete().eq('itr_id', itrId).select('id'))
  const rows = Object.entries(answers).map(([key, v]) => ({ itr_id: itrId, item_id: item[key], ...v }))
  if (rows.length) await must('responses', a.from('itr_responses').insert(rows).select('id'))
  const [{ data: items }, { data: responses }, { data: sql, error }] = await Promise.all([
    a.from('itr_template_items').select('id, item_type, is_required, is_critical, requires_photo, requires_measurement, requires_document, condition_item_id, condition_value, options, option_outcomes, acceptance_min, acceptance_max').eq('template_id', templateId),
    a.from('itr_responses').select('item_id, value_text, value_numeric, value_bool, value_option, remarks, is_passed').eq('itr_id', itrId),
    a.rpc('evaluate_itr_capture', { p_itr_id: itrId }),
  ])
  if (error) throw new Error(error.message)
  const ts = evaluateItrCompletion((items ?? []) as CompletionItem[], (responses ?? []) as CompletionResponse[])
  const s = sql as Record<string, unknown>
  const sorted = (v: unknown) => [...(v as string[])].sort()
  return {
    ts: { complete: ts.isComplete, pct: ts.progressPct, fail: ts.hasCriticalFail, required: ts.requiredCount, done: ts.completedCount, applicable: sorted(ts.applicableItemIds), missing: sorted(ts.missingRequiredItemIds), invalid: sorted(ts.invalidConditionItemIds) },
    sql: { complete: s.is_complete, pct: Number(s.progress_pct), fail: s.has_critical_fail, required: s.required_count, done: s.completed_count, applicable: sorted(s.applicable_item_ids), missing: sorted(s.missing_required_item_ids), invalid: sorted(s.invalid_condition_item_ids) },
  }
}

const FULL: Record<string, Answer> = {
  text: { value_text: 'conforme' }, num: { value_numeric: 12.5 }, chk: { value_bool: true }, yn: { value_bool: true },
  meas: { value_numeric: 5 }, date: { value_text: '2026-10-24' }, ifYes: { value_text: 'detalle' }, ifNum: { value_text: 'número 12.5' },
}
const SCENARIOS: Array<[string, Record<string, Answer>, Partial<{ complete: boolean; fail: boolean }>]> = [
  ['sin respuestas', {}, { complete: false, fail: false }],
  ['todo diligenciado', FULL, { complete: true, fail: false }],
  ['sí/no = No sin observación', { ...FULL, yn: { value_bool: false } }, { complete: false }],
  ['sí/no = No con observación (la condicionada deja de aplicar)', { ...FULL, yn: { value_bool: false, remarks: 'no aplica en este equipo' }, ifYes: {} }, { complete: true }],
  ['selección N/A sin justificar (pasa a obligatoria)', { ...FULL, sel: { value_option: 'NA' } }, { complete: false }],
  ['selección N/A justificada', { ...FULL, sel: { value_option: 'NA', remarks: 'equipo fuera de servicio' } }, { complete: true }],
  ['selección con rechazo', { ...FULL, sel: { value_option: 'NOK' } }, { fail: true }],
  ['medición crítica fuera de límites', { ...FULL, meas: { value_numeric: 12 } }, { fail: true }],
  ['medición crítica en el límite', { ...FULL, meas: { value_numeric: 10 } }, { complete: true, fail: false }],
  ['fecha inexistente', { ...FULL, date: { value_text: '2026-02-30' } }, { complete: false }],
  ['casilla desmarcada', { ...FULL, chk: { value_bool: false } }, { complete: false }],
  ['número que no activa la condicionada', { ...FULL, num: { value_numeric: 7 }, ifNum: {} }, { complete: true }],
  ['crítico con is_passed = false guardado', { ...FULL, crit: { value_text: 'mal', is_passed: false } }, { fail: true }],
]

describe('completitud del ITR — SQL = TS (A29)', () => {
  let main = { templateId: '', itrId: '' }
  let bad = { templateId: '', itrId: '' }

  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    userId = auth.user!.id
    ids.org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', ids.org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', ids.org).limit(1).single()),
    ])
    ids.phase = phase.id; ids.disc = disc.id
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    ids.tag = (await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: ids.disc, tag_number: `${stamp}-PT`, description: 'test' }).select('id').single())).id

    main = await template(`${stamp}-M`, [
      { key: 'text', item_type: 'text' },
      { key: 'num', item_type: 'number' },
      { key: 'chk', item_type: 'checkbox' },
      { key: 'yn', item_type: 'yes_no' },
      { key: 'sel', item_type: 'select', is_required: false, options: ['OK', 'NOK', 'NA'], option_outcomes: { OK: 'pass', NOK: 'fail', NA: 'not_applicable' } },
      { key: 'meas', item_type: 'measurement', is_critical: true, acceptance_min: 0, acceptance_max: 10 },
      { key: 'date', item_type: 'date' },
      { key: 'ifYes', item_type: 'text', condition: ['yn', 'true'] },
      { key: 'ifNum', item_type: 'text', condition: ['num', '12.5'] },
      { key: 'crit', item_type: 'text', is_required: false, is_critical: true },
    ])
    bad = await template(`${stamp}-B`, [
      { key: 'base', item_type: 'text' },
      { key: 'loopA', item_type: 'text', condition: ['loopB', 'x'] },
      { key: 'loopB', item_type: 'text', condition: ['loopA', 'x'] },
      { key: 'noValue', item_type: 'text', condition: ['base', null] },
    ])
    itr.main = main.itrId; itr.invalid = bad.itrId
  }, 60_000)

  afterAll(async () => {
    if (ids.area) await a.from('areas').delete().eq('id', ids.area) // arrastra subsistema/tag/ITR/respuestas
    for (const t of ids.templates) await a.from('itr_templates').delete().eq('id', t)
  }, 30_000)

  for (const [name, answers, expected] of SCENARIOS) {
    it(name, async () => {
      const { ts, sql } = await compare(main.itrId, main.templateId, answers)
      expect(ts).toEqual(sql)
      expect(sql).toMatchObject(expected)
    }, 30_000)
  }

  it('condiciones inválidas (ciclo, valor nulo): las dos lo detectan igual', async () => {
    const { ts, sql } = await compare(bad.itrId, bad.templateId, { base: { value_text: 'ok' } })
    expect(ts).toEqual(sql)
    expect(sql.complete).toBe(false)
    expect(sql.invalid.length).toBeGreaterThan(0)
  }, 30_000)
})
