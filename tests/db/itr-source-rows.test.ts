import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TABLE_PRESETS, evaluateTable, parseSourceRows, reshapeTable } from '../../src/lib/itr/table'

/**
 * ITR generados desde un lazo (fase 4 · bloque D, sesión 2; migración 20261016230000) contra la BD real:
 *   - el trigger toma la foto de las señales del lazo e ignora la que mande el cliente;
 *   - la foto es inmutable; una plantilla con tabla «source» no sirve para ITR por tag;
 *   - evaluate_itr_table (con la cantidad de la foto) coincide con evaluateTable en TS.
 *
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía, lazo, señal y plantilla; al final borra todo.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)

const pid = env.TEST_PROJECT_A_ID!
const stamp = `SR${Date.now().toString(36).toUpperCase()}`
const config = structuredClone(TABLE_PRESETS.find(p => p.id === 'loop_check')!.config)
let a: SupabaseClient
const ids = { org: '', area: '', sub: '', tag: '', loop: '', template: '', phase: '', itr: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

describe.skipIf(!enabled)('ITR desde lazo — foto de filas inmutable y evaluación TS = SQL', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)

    ids.org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', ids.org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', ids.org).limit(1).single()),
    ])
    ids.phase = phase.id
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    ids.tag = (await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: disc.id, tag_number: `${stamp}-PT`, description: 'test' }).select('id').single())).id
    ids.loop = (await must<{ id: string }>('loop', a.from('loops').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: disc.id, loop_number: `${stamp}-L` }).select('id').single())).id
    await must('señal', a.from('signals').insert({ tag_id: ids.tag, signal_tag: `${stamp}-PT`, signal_type: 'AI', loop_id: ids.loop, junction_box: 'JB-01', io_channel: 'CH-04', dcs_tag: 'PI-101' }).select('id'))

    ids.template = (await must<{ id: string }>('template', a.from('itr_templates').insert({
      org_id: ids.org, discipline_id: disc.id, phase_id: phase.id, code: `${stamp}-LC`, title: 'test', is_active: false,
    }).select('id').single())).id
    const section = await must<{ id: string }>('section', a.from('itr_template_sections').insert({ template_id: ids.template, title: 'test', order_index: 0 }).select('id').single())
    await must('item', a.from('itr_template_items').insert({
      template_id: ids.template, section_id: section.id, description: 'loop check', item_type: 'table', is_required: true, order_index: 0, options: config,
    }).select('id'))
  }, 30_000)

  afterAll(async () => {
    if (ids.area) await a.from('areas').delete().eq('id', ids.area) // arrastra subsistema/tag/señal/lazo/ITR
    if (ids.template) await a.from('itr_templates').delete().eq('id', ids.template)
  }, 30_000)

  it('una plantilla con tabla desde lazo no sirve para un ITR por tag', async () => {
    const { error } = await a.from('itrs').insert({ project_id: pid, subsystem_id: ids.sub, tag_id: ids.tag, template_id: ids.template, phase_id: ids.phase, itr_number: `${stamp}-X`, status: 'not_started' })
    expect(error?.message).toMatch(/se genera desde un lazo/)
  }, 30_000)

  it('toma la foto del lazo (ignora la del cliente) y no deja cambiarla', async () => {
    const itr = await must<{ id: string; source_rows: unknown }>('itr', a.from('itrs').insert({
      project_id: pid, subsystem_id: ids.sub, tag_id: ids.tag, template_id: ids.template, phase_id: ids.phase,
      itr_number: `${stamp}-LC`, status: 'not_started', loop_id: ids.loop, source_rows: [{ key: 'x', label: 'FALSO', refs: {} }],
    }).select('id, source_rows').single())
    ids.itr = itr.id
    const rows = parseSourceRows(itr.source_rows)
    expect(rows?.map(r => r.label)).toEqual([`${stamp}-PT`])
    expect(rows?.[0].refs).toMatchObject({ junction_box: 'JB-01', io_channel: 'CH-04', dcs_tag: 'PI-101', signal_type: 'AI' })
    const { error } = await a.from('itrs').update({ source_rows: [] }).eq('id', itr.id)
    expect(error?.message).toMatch(/inmutable/)
  }, 30_000)

  it('evaluate_itr_table con la foto coincide con evaluateTable', async () => {
    const { data } = await a.from('itrs').select('source_rows').eq('id', ids.itr).single()
    const rows = parseSourceRows(data?.source_rows)!
    const base = reshapeTable(config, null, rows.length, rows)
    const cases = [
      { wiring: 'pass', hmi_ok: 'pass', result: 'pass' },
      { wiring: 'fail', hmi_ok: 'pass', result: 'fail' },
      { wiring: 'pass', result: 'pass' },
      { wiring: 'pass', hmi_ok: 'pass', result: 'pass', junction_box: 'FALSO' },
    ]
    for (const cells of cases) {
      const value = JSON.stringify({ ...base, rows: base.rows.map(row => ({ ...row, cells: { ...row.cells, ...cells } })) })
      const ts = evaluateTable(config, value, rows)
      const { data: sql, error } = await a.rpc('evaluate_itr_table', { p_options: config, p_value: value, p_source_count: rows.length })
      expect(error).toBeNull()
      expect({ is_complete: ts.isComplete, has_fail: ts.hasFail }).toEqual({ is_complete: sql.is_complete, has_fail: sql.has_fail })
    }
    // Otra cantidad de filas que la foto: inválido en ambos.
    const value = JSON.stringify(base)
    const { data: wrong } = await a.rpc('evaluate_itr_table', { p_options: config, p_value: value, p_source_count: rows.length + 1 })
    expect(wrong).toMatchObject({ is_complete: false, has_fail: false })
  }, 30_000)
})
