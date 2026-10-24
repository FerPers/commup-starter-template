import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * Matriz causa-efecto y cadena del lazo (fase 4 · bloque D, migración 20261016210000) contra la BD real:
 *   - el trigger ce_guard deriva org/proyecto (el cliente no los puede falsear);
 *   - tags de otro proyecto y cruces entre matrices distintas se rechazan;
 *   - un cruce con retardo exige el retardo; borrar una causa arrastra sus cruces;
 *   - la cadena del loop check se guarda en la señal.
 *
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía y dos matrices; al final borra todo. Usuario A: owner/admin/architect.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const pid = env.TEST_PROJECT_A_ID!
const stamp = `CE${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
const ids = { org: '', area: '', system: '', tag: '', loop: '', m1: '', m2: '', cause: '', effect: '', otherEffect: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

describe('matriz C&E — integridad por trigger y cadena del lazo', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)

    ids.org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const disc = await must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', ids.org).limit(1).single())
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    ids.system = (await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())).id
    const sub = await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: ids.system, code: `${stamp}-SS`, name: 'test' }).select('id').single())
    ids.tag = (await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: sub.id, discipline_id: disc.id, tag_number: `${stamp}-PT`, description: 'test' }).select('id').single())).id
    ids.loop = (await must<{ id: string }>('loop', a.from('loops').insert({ project_id: pid, subsystem_id: sub.id, discipline_id: disc.id, loop_number: `${stamp}-L` }).select('id').single())).id

    // org_id falso a propósito: el trigger lo reemplaza con el del proyecto.
    ids.m1 = (await must<{ id: string }>('matriz 1', a.from('ce_matrices').insert({ org_id: '00000000-0000-0000-0000-000000000000', project_id: pid, system_id: ids.system, code: `${stamp}-M1`, title: 'test' }).select('id').single())).id
    ids.m2 = (await must<{ id: string }>('matriz 2', a.from('ce_matrices').insert({ org_id: ids.org, project_id: pid, code: `${stamp}-M2`, title: 'test' }).select('id').single())).id
    ids.cause = (await must<{ id: string }>('causa', a.from('ce_causes').insert({ matrix_id: ids.m1, project_id: pid, code: 'C-01', description: 'PAHH', tag_id: ids.tag, voting: '1oo1' }).select('id').single())).id
    ids.effect = (await must<{ id: string }>('efecto', a.from('ce_effects').insert({ matrix_id: ids.m1, project_id: pid, code: 'E-01', description: 'Cierre SDV', action: 'close' }).select('id').single())).id
    ids.otherEffect = (await must<{ id: string }>('efecto m2', a.from('ce_effects').insert({ matrix_id: ids.m2, project_id: pid, code: 'E-01', description: 'otro', action: 'trip' }).select('id').single())).id
  }, 30_000)

  afterAll(async () => {
    for (const id of [ids.m1, ids.m2]) if (id) await a.from('ce_matrices').delete().eq('id', id)
    if (ids.area) await a.from('areas').delete().eq('id', ids.area) // arrastra sistema/subsistema/tag/lazo/señal
  }, 30_000)

  it('deriva la org de la matriz desde el proyecto', async () => {
    const m = await must<{ org_id: string }>('matriz', a.from('ce_matrices').select('org_id').eq('id', ids.m1).single())
    expect(m.org_id).toBe(ids.org)
  }, 30_000)

  it('rechaza un tag que no es del proyecto', async () => {
    const { error } = await a.from('ce_effects').insert({ matrix_id: ids.m1, project_id: pid, code: 'E-99', description: 'x', action: 'open', tag_id: crypto.randomUUID() })
    expect(error?.message).toMatch(/no pertenece al proyecto/)
  }, 30_000)

  it('rechaza un cruce entre matrices distintas y un retardo sin valor', async () => {
    const cross = await a.from('ce_links').insert({ cause_id: ids.cause, effect_id: ids.otherEffect, project_id: pid })
    expect(cross.error?.message).toMatch(/misma matriz/)
    const noDelay = await a.from('ce_links').insert({ cause_id: ids.cause, effect_id: ids.effect, project_id: pid, link_type: 'delayed' })
    expect(noDelay.error).not.toBeNull()
  }, 30_000)

  it('guarda el cruce con retardo y lo borra con la causa', async () => {
    await must('cruce', a.from('ce_links').insert({ cause_id: ids.cause, effect_id: ids.effect, project_id: pid, link_type: 'delayed', delay_s: 5 }).select('cause_id'))
    const { count: before } = await a.from('ce_links').select('cause_id', { count: 'exact', head: true }).eq('effect_id', ids.effect)
    expect(before).toBe(1)
    await must('borrar causa', a.from('ce_causes').delete().eq('id', ids.cause).select('id'))
    const { count: after } = await a.from('ce_links').select('cause_id', { count: 'exact', head: true }).eq('effect_id', ids.effect)
    expect(after).toBe(0)
  }, 30_000)

  it('guarda la cadena del loop check en la señal', async () => {
    const chain = { junction_box: 'JB-01', marshalling: 'MC-01', io_card: 'R1-S3', io_channel: 'CH-04', dcs_tag: 'PI-101', hmi_display: 'BOMBAS-01' }
    await must('señal', a.from('signals').insert({ tag_id: ids.tag, signal_tag: `${stamp}-PT`, signal_type: 'AI', loop_id: ids.loop, ...chain }).select('id'))
    const loop = await must<{ signals: Record<string, unknown>[] }>('lazo', a.from('loops').select('signals(junction_box, marshalling, io_card, io_channel, dcs_tag, hmi_display)').eq('id', ids.loop).single())
    expect(loop.signals).toEqual([chain])
  }, 30_000)
})
