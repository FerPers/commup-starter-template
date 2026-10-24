import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * Evidencia del punch (fase 4 · bloque A, migración 20261016120000) contra la BD real:
 *   - cerrar directo (UPDATE status='closed') está prohibido: se cierra solo verificando;
 *   - resolver exige descripción; marca resolved_at/by y deja el punch en in_progress (sigue abierto);
 *   - quien resolvió no puede verificar; el rechazo pide motivo;
 *   - las columnas de resolución/revisión no se escriben directo; reabrir limpia la resolución;
 *   - quien levantó el punch no revisa su categoría.
 * La verificación aceptada por OTRA persona se prueba en la UI con dos usuarios.
 *
 * Siembra su propia área/sistema/subsistema en TEST_PROJECT_A_ID (los tests de BD corren en paralelo:
 * un punch en un subsistema ajeno altera los conteos de readiness.test) y la borra al final.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const pid = env.TEST_PROJECT_A_ID!
let a: SupabaseClient
let punchId = ''
let areaId = ''
const stamp = `PE${Date.now().toString(36).toUpperCase()}`

async function punch() {
  const { data, error } = await a.from('punches').select('status, resolved_at, resolved_by, category_reviewed_at').eq('id', punchId).single()
  if (error) throw new Error(error.message)
  return data
}

describe('punch — resolver y verificar en campo por otra persona', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: auth, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)

    const { data: project } = await a.from('projects').select('org_id').eq('id', pid).single()
    const { data: disc } = await a.from('disciplines').select('id').eq('org_id', project!.org_id).limit(1).single()
    const { data: area, error: aErr } = await a.from('areas').insert({ project_id: pid, code: `${stamp}-A`, name: 'test' }).select('id').single()
    if (aErr) throw new Error(`area: ${aErr.message}`)
    areaId = area!.id
    const { data: sys } = await a.from('systems').insert({ project_id: pid, area_id: areaId, code: `${stamp}-S`, name: 'test' }).select('id').single()
    const { data: sub, error: sErr } = await a.from('subsystems').insert({ project_id: pid, system_id: sys!.id, code: `${stamp}-SS`, name: 'test' }).select('id').single()
    if (sErr) throw new Error(`subsystem: ${sErr.message}`)
    const { data: created, error: insErr } = await a.from('punches').insert({
      project_id: pid, subsystem_id: sub!.id, discipline_id: disc!.id, raised_by: auth.user!.id,
      category: 'B', description: `TEST evidencia ${Date.now().toString(36)}`, punch_number: 'TMP',
      // Un cliente no puede sembrar la resolución al crear: el trigger lo limpia.
      resolved_at: new Date().toISOString(), resolved_by: auth.user!.id,
    }).select('id').single()
    if (insErr) throw new Error(`insert punch: ${insErr.message}`)
    punchId = created!.id
  })

  afterAll(async () => {
    if (punchId) await a.from('punches').delete().eq('id', punchId)
    if (areaId) await a.from('areas').delete().eq('id', areaId)
  })

  it('al crear no se puede sembrar la resolución', async () => {
    expect((await punch()).resolved_at).toBeNull()
  })

  it('cerrar directo está prohibido', async () => {
    const { error } = await a.from('punches').update({ status: 'closed' }).eq('id', punchId)
    expect(error?.message).toMatch(/verificarlo en campo/)
    expect((await punch()).status).toBe('open')
  })

  it('resolver exige descripción y deja el punch abierto (in_progress)', async () => {
    const short = await a.rpc('resolve_punch', { p_punch_id: punchId, p_comment: 'ok' })
    expect(short.error?.message).toMatch(/Describe/)
    const { error } = await a.rpc('resolve_punch', { p_punch_id: punchId, p_comment: 'Junta reemplazada y reapretada' })
    expect(error).toBeNull()
    const p = await punch()
    expect(p.status).toBe('in_progress')
    expect(p.resolved_at).not.toBeNull()
  })

  it('quien resolvió no verifica, y no se escribe la resolución directo', async () => {
    const own = await a.rpc('verify_punch', { p_punch_id: punchId, p_accept: true })
    expect(own.error?.message).toMatch(/distinta de quien lo resolvió/)
    const direct = await a.from('punches').update({ resolved_at: null }).eq('id', punchId)
    expect(direct.error?.message).toMatch(/se registran con su acción/)
  })

  it('reabrir limpia la resolución', async () => {
    const { error } = await a.from('punches').update({ status: 'open' }).eq('id', punchId)
    expect(error).toBeNull()
    const p = await punch()
    expect(p.status).toBe('open')
    expect(p.resolved_at).toBeNull()
  })

  it('quien levantó el punch no revisa su categoría', async () => {
    const { error } = await a.rpc('review_punch_category', { p_punch_id: punchId, p_category: 'C', p_note: 'menor' })
    expect(error?.message).toMatch(/distinta de quien levantó/)
    expect((await punch()).category_reviewed_at).toBeNull()
  })
})
