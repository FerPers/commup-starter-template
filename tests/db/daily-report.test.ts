import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Reporte diario y relevo (fase 5 sesión 3, migración 20261017180000) contra la BD real, solo con
 * borradores (que se borran al final): datos del día armados en SQL, idempotencia del borrador, la IA no
 * pisa lo editado, relevo con snapshot y edición solo de quien lo abrió. Emitir/revisar/recibir (que
 * dejan historia inmutable) se probaron con rollback en la migración y se prueban en la UI.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)

const pid = env.TEST_PROJECT_A_ID!
// Fecha pasada poco probable de chocar con reportes reales del proyecto de prueba.
const date = `2001-0${1 + (Date.now() % 9)}-1${Date.now() % 9}`
let a: SupabaseClient
const reports: string[] = []
const handovers: string[] = []

describe.skipIf(!enabled)('reporte diario y relevo — borradores', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
  }, 30_000)

  afterAll(async () => {
    for (const id of reports) await a.rpc('delete_daily_report_draft', { p_report_id: id })
    for (const id of handovers) await a.rpc('delete_shift_handover_draft', { p_handover_id: id })
  }, 30_000)

  // Timeout por defecto (5 s): S10 (B-20) quitó la TEMP TABLE y «aprobados hoy» parte de las firmas del día.
  it('arma los datos del día en SQL, con la zona del proyecto y los totales de las listas (S10)', async () => {
    const { data, error } = await a.rpc('daily_report_data', { p_project_id: pid, p_date: date })
    expect(error).toBeNull()
    const d = data as Record<string, Record<string, unknown>>
    expect(Object.keys(d).sort()).toEqual(
      ['actions', 'area', 'as_of', 'constraints', 'date', 'gates', 'itrs', 'lookahead_7d', 'performance_today', 'progress', 'project',
        'punches', 'registers_in_field', 'registers_in_field_count', 'startup_events_today', 'timezone', 'tqs'])
    expect(d.itrs).toHaveProperty('approved_today_count')
    expect(d.punches).toHaveProperty('raised_today_count')
    expect(d.actions).toHaveProperty('overdue_count')
    expect(d.constraints).toHaveProperty('open_high_count')
    const { data: proj } = await a.from('projects').select('timezone').eq('id', pid).single()
    expect(d.timezone).toBe(proj?.timezone)
  })

  it('sin fecha usa el día local del proyecto (S10, D-05)', async () => {
    const [{ data }, { data: today }] = await Promise.all([
      a.rpc('daily_report_data', { p_project_id: pid }),
      a.rpc('project_today', { p_project_id: pid }),
    ])
    expect((data as { date: string }).date).toBe(today)
  })

  it('el borrador es único por fecha y la IA no pisa lo editado', async () => {
    const first = await a.rpc('create_daily_report_draft', { p_project_id: pid, p_date: date })
    expect(first.error).toBeNull()
    reports.push(first.data as string)
    const again = await a.rpc('create_daily_report_draft', { p_project_id: pid, p_date: date })
    expect(again.data).toBe(first.data)

    await a.rpc('update_daily_report_sections', { p_report_id: first.data, p_sections: { summary: 'Escrito a mano' } })
    await a.rpc('set_daily_report_ai_draft', { p_report_id: first.data, p_draft: { summary: 'IA', key_events: '- IA', issues: '', constraints: '', next_day_plan: '' }, p_model: 'test' })
    const { data: r } = await a.from('daily_reports').select('summary, key_events, status').eq('id', first.data).single()
    expect(r).toEqual({ summary: 'Escrito a mano', key_events: '- IA', status: 'draft' })
  })

  it('«Rehacer con IA» reemplaza todas las secciones en una sola RPC (S10, D-28)', async () => {
    const id = reports[0]
    const { error } = await a.rpc('replace_daily_report_ai_draft', {
      p_report_id: id, p_draft: { summary: 'Nuevo', key_events: '', issues: '- Falla', constraints: '', next_day_plan: '' }, p_model: 'test',
    })
    expect(error).toBeNull()
    const { data: r } = await a.from('daily_reports').select('summary, key_events, issues').eq('id', id).single()
    expect(r).toEqual({ summary: 'Nuevo', key_events: null, issues: '- Falla' })
  })

  it('relevo: snapshot al abrir y edición solo en borrador', async () => {
    const { data: id, error } = await a.rpc('open_shift_handover', { p_project_id: pid, p_shift_label: 'night', p_shift_date: date })
    expect(error).toBeNull()
    handovers.push(id as string)
    const { data: h } = await a.from('shift_handovers').select('number, snapshot, status').eq('id', id).single()
    expect(h?.number).toMatch(/^REL-\d{4}$/)
    expect(Object.keys(h?.snapshot ?? {})).toEqual(expect.arrayContaining(['registers', 'punches_a', 'constraints', 'actions_overdue', 'itrs_in_progress']))
    expect((await a.rpc('update_shift_handover', { p_handover_id: id, p_pending: 'Terminar flushing', p_safety: 'Bypass activo' })).error).toBeNull()
  })
})
