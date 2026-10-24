import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * S09 «cero filas para contar» (migración 20261104120000) contra la BD real, solo lecturas:
 *   - los agregados SQL que reemplazan el conteo en JS coinciden con count(*) bajo RLS;
 *   - una sola definición de preservación vencida (activo y próxima fecha < hoy);
 *   - take_kpi_snapshot solo para service_role y kpi_snapshots sin escritura directa (B-25).
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_PROJECT_A_ID'])

const pid = env.TEST_PROJECT_A_ID!
let a: SupabaseClient

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: n, error } = await q
  if (error) throw new Error(error.message)
  return n ?? 0
}

describe('S09 — KPIs contados en SQL', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
  }, 30_000)

  it('subsystem_phase_itr_counts suma lo mismo que count(*) de itrs', async () => {
    const { data, error } = await a.rpc('subsystem_phase_itr_counts', { p_project_id: pid })
    expect(error).toBeNull()
    const rows = (data ?? []) as { itr_total: number; itr_approved: number }[]
    const total = await count(a.from('itrs').select('id', { count: 'exact', head: true })
      .eq('project_id', pid).not('subsystem_id', 'is', null).not('phase_id', 'is', null))
    const approved = await count(a.from('itrs').select('id', { count: 'exact', head: true })
      .eq('project_id', pid).not('subsystem_id', 'is', null).not('phase_id', 'is', null).eq('status', 'approved'))
    expect(rows.reduce((s, r) => s + Number(r.itr_total), 0)).toBe(total)
    expect(rows.reduce((s, r) => s + Number(r.itr_approved), 0)).toBe(approved)
  }, 30_000)

  it('preservation_due_counts usa la definición única de vencida', async () => {
    const { data, error } = await a.rpc('preservation_due_counts', { p_project_ids: [pid], p_days: 7 })
    expect(error).toBeNull()
    const row = ((data ?? []) as { active: number; overdue: number }[])[0] ?? { active: 0, overdue: 0 }
    const today = new Date().toISOString().slice(0, 10)
    expect(Number(row.active)).toBe(await count(a.from('preservation_plans').select('id', { count: 'exact', head: true })
      .eq('project_id', pid).eq('status', 'active')))
    expect(Number(row.overdue)).toBe(await count(a.from('preservation_plans').select('id', { count: 'exact', head: true })
      .eq('project_id', pid).eq('status', 'active').lt('next_due_date', today)))
  }, 30_000)

  it('take_kpi_snapshot no es ejecutable por usuarios y kpi_snapshots no acepta escritura directa', async () => {
    const { error: rpcErr } = await a.rpc('take_kpi_snapshot', { p_project_id: pid, p_date: '2000-01-01' })
    expect(rpcErr).not.toBeNull()
    const { error: insErr } = await a.from('kpi_snapshots').insert({ project_id: pid, snapshot_date: '2000-01-01' })
    expect(insErr).not.toBeNull()
    const { data: rows } = await a.from('kpi_snapshots').select('id').eq('project_id', pid).eq('snapshot_date', '2000-01-01')
    expect(rows ?? []).toHaveLength(0)
  }, 30_000)
})
