import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDbEnv } from './env'

/**
 * S15 — Miembros, auditoría y cuotas (migración 20261110120000) contra la BD real, solo rechazos (nunca escribe):
 *   - org_members no se escribe por REST (A-02/I-12): solo por RPC;
 *   - activity_log no acepta entradas a nombre de otra persona y notifications no acepta inserts de usuarios (A-11);
 *   - ai_usage no se escribe directo; ai_quota_status y auth_user_id_by_email no son ejecutables por usuarios.
 * Invitación, aceptación, suspensión, vencimiento y «nunca sin owner activo» se probaron con ROLLBACK en la migración.
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD'])
let a: SupabaseClient
let me: string
let org: string

describe('Miembros, auditoría y cuotas (S15)', () => {
  beforeAll(async () => {
    a = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data, error } = await a.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error) throw new Error(`login A: ${error.message}`)
    me = data.user!.id
    const { data: m } = await a.from('org_members').select('org_id').eq('user_id', me).eq('status', 'active').limit(1).single()
    org = m!.org_id
  }, 30_000)

  it('org_members no se escribe por REST', async () => {
    const upd = await a.from('org_members').update({ role: 'owner' }).eq('user_id', me).eq('org_id', org)
    expect(upd.error).not.toBeNull()
    const ins = await a.from('org_members').insert({ org_id: org, user_id: crypto.randomUUID(), role: 'owner' })
    expect(ins.error).not.toBeNull()
  })

  it('activity_log solo a nombre propio; notificaciones no se insertan', async () => {
    const forged = await a.from('activity_log').insert({ org_id: org, user_id: crypto.randomUUID(), entity_type: 'user', action: 'forged' })
    expect(forged.error).not.toBeNull()
    const notif = await a.from('notifications').insert({ org_id: org, recipient_user_id: me, kind: 'x', title: 'x', link_url: '/' })
    expect(notif.error).not.toBeNull()
  })

  it('cuotas e identidad solo para el servidor', async () => {
    const usage = await a.from('ai_usage').insert({ org_id: org, feature: 'x', model: 'x' })
    expect(usage.error).not.toBeNull()
    const quota = await a.rpc('ai_quota_status', { p_org_id: org })
    expect(quota.error).not.toBeNull()
    const lookup = await a.rpc('auth_user_id_by_email', { p_email: 'nadie@example.com' })
    expect(lookup.error).not.toBeNull()
  })
})
