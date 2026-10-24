import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { itrEvidencePath, isAlreadyStored } from '../../src/lib/sync/outbox-utils'
import { requireDbEnv } from './env'

/**
 * A02 (migración 20261217120000) contra la BD real: identidad y fechas de la evidencia del ITR.
 *   - diez reenvíos de la misma captura (misma ruta, mismo capture_id) dejan un objeto y un adjunto;
 *   - captured_at = hora del dispositivo, acotada a [creación del ITR, ahora] con capture_clamped;
 *     uploaded_at = hora de recepción, la pone la BD;
 *   - la identidad y las horas no se cambian después.
 *
 * Siembra en TEST_PROJECT_A_ID su propia jerarquía, plantilla e ITR; al final borra todo (el objeto de storage
 * queda: el bucket es inmutable para los usuarios y la BD es la local).
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const pid = env.TEST_PROJECT_A_ID!
const stamp = `EV${Date.now().toString(36).toUpperCase()}`
let a: SupabaseClient
let userId = ''
const ids = { area: '', sub: '', tag: '', template: '', phase: '', itr: '', itrCreatedAt: '' }

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error || !data) throw new Error(`${label}: ${error?.message ?? 'sin datos'}`)
  return data as NonNullable<T>
}

async function storeCapture(captureId: string) {
  const path = itrEvidencePath(ids.itr, null, captureId, 'foto.png')
  const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
  const { error } = await a.storage.from('itr-attachments').upload(path, png, { contentType: 'image/png', upsert: false })
  if (error && !isAlreadyStored(error)) throw new Error(`upload: ${error.message}`)
  return path
}

function attach(captureId: string, path: string, capturedAt: string) {
  return a.from('itr_attachments').insert({
    itr_id: ids.itr, item_id: null, file_url: path, file_type: 'image/png', capture_id: captureId, captured_at: capturedAt, uploaded_by: userId,
  }).select('id, captured_at, uploaded_at, capture_clamped').single()
}

describe('evidencia del ITR — una captura, un adjunto, con su hora de dispositivo (A02)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    userId = auth.user!.id

    const org = (await must<{ org_id: string }>('project', a.from('projects').select('org_id').eq('id', pid).single())).org_id
    const [phase, disc] = await Promise.all([
      must<{ id: string }>('phase', a.from('project_phases').select('id').eq('org_id', org).order('order_index').limit(1).single()),
      must<{ id: string }>('discipline', a.from('disciplines').select('id').eq('org_id', org).limit(1).single()),
    ])
    ids.phase = phase.id
    ids.area = (await must<{ id: string }>('area', a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single())).id
    const sys = await must<{ id: string }>('system', a.from('systems').insert({ project_id: pid, area_id: ids.area, code: `${stamp}-S`, name: 'test' }).select('id').single())
    ids.sub = (await must<{ id: string }>('subsystem', a.from('subsystems').insert({ project_id: pid, system_id: sys.id, code: `${stamp}-SS`, name: 'test' }).select('id').single())).id
    ids.tag = (await must<{ id: string }>('tag', a.from('tags').insert({ project_id: pid, subsystem_id: ids.sub, discipline_id: disc.id, tag_number: `${stamp}-PT`, description: 'test' }).select('id').single())).id
    ids.template = (await must<{ id: string }>('template', a.from('itr_templates').insert({
      org_id: org, discipline_id: disc.id, phase_id: phase.id, code: `${stamp}-EV`, title: 'test', is_active: false,
    }).select('id').single())).id
    const section = await must<{ id: string }>('section', a.from('itr_template_sections').insert({ template_id: ids.template, title: 'test', order_index: 0 }).select('id').single())
    await must('item', a.from('itr_template_items').insert({
      template_id: ids.template, section_id: section.id, description: 'evidencia', item_type: 'photo', is_required: true, order_index: 0,
    }).select('id'))
    const itr = await must<{ id: string; created_at: string }>('itr', a.from('itrs').insert({
      project_id: pid, subsystem_id: ids.sub, tag_id: ids.tag, template_id: ids.template, phase_id: ids.phase, itr_number: `${stamp}-EV`, status: 'not_started',
    }).select('id, created_at').single())
    ids.itr = itr.id
    ids.itrCreatedAt = itr.created_at
  }, 30_000)

  afterAll(async () => {
    if (ids.area) await a.from('areas').delete().eq('id', ids.area) // arrastra subsistema/tag/ITR/adjuntos
    if (ids.template) await a.from('itr_templates').delete().eq('id', ids.template)
  }, 30_000)

  it('diez reenvíos de la misma captura dejan un objeto y un adjunto', async () => {
    const captureId = crypto.randomUUID()
    const capturedAt = new Date(Date.now() - 1000).toISOString()
    let accepted = 0
    for (let i = 0; i < 10; i++) {
      const path = await storeCapture(captureId)
      const { error } = await attach(captureId, path, capturedAt)
      if (!error) accepted++
      else expect(error.code).toBe('23505')
    }
    expect(accepted).toBe(1)
    const { data: rows } = await a.from('itr_attachments').select('id').eq('capture_id', captureId)
    expect(rows).toHaveLength(1)
    const { data: objects } = await a.storage.from('itr-attachments').list(`${ids.itr}/general`, { search: captureId })
    expect(objects?.map(o => o.name)).toEqual([`${captureId}.png`])
  }, 30_000)

  it('captured_at = hora del dispositivo; uploaded_at = recepción', async () => {
    const captureId = crypto.randomUUID()
    // Entre la creación del ITR y la recepción (reloj de la BD): se espera 1 s para que quepa sin acotar.
    const deviceTime = new Date(Date.parse(ids.itrCreatedAt) + 500)
    await new Promise(r => setTimeout(r, 1000))
    const row = await must<{ captured_at: string; uploaded_at: string; capture_clamped: boolean }>('attach', attach(captureId, await storeCapture(captureId), deviceTime.toISOString()))
    expect(Date.parse(row.captured_at)).toBe(deviceTime.getTime())
    expect(row.capture_clamped).toBe(false)
    expect(Date.parse(row.uploaded_at)).toBeGreaterThanOrEqual(Date.parse(row.captured_at))
  }, 30_000)

  it('una hora fuera de rango se acota y queda marcada', async () => {
    const future = crypto.randomUUID()
    const late = await must<{ captured_at: string; uploaded_at: string; capture_clamped: boolean }>('attach', attach(future, await storeCapture(future), '2099-01-01T00:00:00Z'))
    expect(late.capture_clamped).toBe(true)
    expect(late.captured_at).toBe(late.uploaded_at)

    const past = crypto.randomUUID()
    const early = await must<{ captured_at: string; capture_clamped: boolean }>('attach', attach(past, await storeCapture(past), '2000-01-01T00:00:00Z'))
    expect(early.capture_clamped).toBe(true)
    expect(Date.parse(early.captured_at)).toBe(Date.parse(ids.itrCreatedAt))
  }, 30_000)

  it('la identidad y las horas no cambian después', async () => {
    const captureId = crypto.randomUUID()
    const row = await must<{ id: string; captured_at: string; uploaded_at: string }>('attach', attach(captureId, await storeCapture(captureId), new Date().toISOString()))
    await a.from('itr_attachments').update({ capture_id: crypto.randomUUID(), captured_at: '2001-01-01T00:00:00Z', uploaded_at: '2001-01-01T00:00:00Z' }).eq('id', row.id)
    const { data: after } = await a.from('itr_attachments').select('capture_id, captured_at, uploaded_at').eq('id', row.id).single()
    expect(after).toEqual({ capture_id: captureId, captured_at: row.captured_at, uploaded_at: row.uploaded_at })
  }, 30_000)
})
