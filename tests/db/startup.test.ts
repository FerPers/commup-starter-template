import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * Arranque (fase 6 sesión 1, migración 20261017210000) contra la BD real, solo con borradores (se borran al
 * final): pasos del procedimiento con hold point, sección fuera del catálogo rechazada, el autor no aprueba,
 * line-up generado y que no se emite sin posición requerida. Aprobación por otra persona, ejecución con hold
 * point y verificación independiente (que dejan historia) se probaron con rollback en la migración.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])
const pid = env.TEST_PROJECT_A_ID!
const stamp = `S${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let areaId = ''
let systemId = ''
const procedures: string[] = []
const sheets: string[] = []

async function one<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

describe('arranque — procedimientos y line-ups (borradores)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    areaId = (await one<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    systemId = (await one<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: areaId, code: `${stamp}-S`, name: 'test' }).select('id').single())).id
  }, 30_000)

  afterAll(async () => {
    for (const id of sheets) await a.rpc('delete_lineup_sheet_draft', { p_sheet_id: id })
    for (const id of procedures) await a.rpc('delete_procedure_draft', { p_procedure_id: id })
    if (areaId) await a.from('areas').delete().eq('id', areaId)
  }, 30_000)

  it('procedimiento: pasos con hold point, catálogo de secciones y el autor no aprueba', async () => {
    const { data: id, error } = await a.rpc('create_procedure', { p_project_id: pid, p_title: `${stamp} arranque`, p_kind: 'startup', p_system_id: systemId })
    expect(error).toBeNull()
    procedures.push(id as string)
    const rev = await one<{ id: string }>('rev', a.from('procedure_revisions').select('id').eq('procedure_id', id).eq('rev', 0).single())

    const bad = await a.rpc('save_procedure_revision', { p_revision_id: rev.id, p_sections: { nope: 'x' }, p_steps: null })
    expect(bad.error?.message).toMatch(/Sección desconocida/)
    const ok = await a.rpc('save_procedure_revision', {
      p_revision_id: rev.id, p_sections: { purpose: 'Probar' },
      p_steps: [{ action: 'Paso 1' }, { action: 'Arrancar', is_hold_point: true, hold_capacity: 'operations', stop_criteria: 'Vibración alta' }],
    })
    expect(ok.error).toBeNull()
    const { data: steps } = await a.from('procedure_steps').select('ord, is_hold_point, hold_capacity').eq('revision_id', rev.id).order('ord')
    expect(steps).toEqual([{ ord: 1, is_hold_point: false, hold_capacity: null }, { ord: 2, is_hold_point: true, hold_capacity: 'operations' }])

    expect((await a.rpc('transition_procedure_revision', { p_revision_id: rev.id, p_to: 'in_review' })).error).toBeNull()
    const self = await a.rpc('transition_procedure_revision', { p_revision_id: rev.id, p_to: 'approved' })
    expect(self.error?.message).toMatch(/persona distinta/)
    expect((await a.rpc('transition_procedure_revision', { p_revision_id: rev.id, p_to: 'draft', p_comment: 'volver a borrador' })).error).toBeNull()
  })

  it('line-up: no se emite sin posición requerida', async () => {
    const { data: id, error } = await a.rpc('create_lineup_sheet', { p_project_id: pid, p_system_id: systemId, p_title: `${stamp} LU`, p_generate: false })
    expect(error).toBeNull()
    sheets.push(id as string)
    expect((await a.rpc('save_lineup_items', { p_sheet_id: id, p_items: [{ label: 'Venteo V-1', is_critical: true }] })).error).toBeNull()
    const issue = await a.rpc('issue_lineup_sheet', { p_sheet_id: id })
    expect(issue.error?.message).toMatch(/posición requerida/)
  })
})
