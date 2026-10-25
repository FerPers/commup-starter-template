import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isActorKind } from '@/lib/readiness/actors'
import { requireDbEnv } from './env'

/**
 * A47 · E5 (migración 20270101120000): `project_gate_actors` contra la BD real. Solo lee.
 *   - una fila por sistema con liberación siguiente, del mismo gate que la matriz;
 *   - las personas que nombra son miembros de la org del proyecto;
 *   - quien no es del proyecto recibe «Access denied».
 */
const env = process.env
requireDbEnv(['TEST_USER_A_EMAIL', 'TEST_USER_A_PASSWORD', 'TEST_USER_B_EMAIL', 'TEST_USER_B_PASSWORD', 'TEST_PROJECT_A_ID'])

const pid = env.TEST_PROJECT_A_ID!
let a: SupabaseClient
let b: SupabaseClient

async function signIn(email: string, password: string) {
  const c = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

type Actor = { system_id: string; gate_id: string; kind: string; capacity: string | null; people: { id: string; name: string | null }[]; item_count: number | null }
type Gate = { gate_id: string; code: string; order: number; status: string }

describe('quién debe actuar (A47 · E5)', () => {
  beforeAll(async () => {
    a = await signIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    b = await signIn(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
  })

  it('un actor por sistema con liberación siguiente, en el mismo gate que la matriz, con personas de la org', async () => {
    const [{ data: actors, error }, { data: matrix }, { data: project }] = await Promise.all([
      a.rpc('project_gate_actors', { p_project_id: pid }),
      a.rpc('compute_project_gates', { p_project_id: pid }),
      a.from('projects').select('org_id').eq('id', pid).single(),
    ])
    expect(error).toBeNull()
    const { data: members } = await a.from('org_members').select('user_id').eq('org_id', project!.org_id)
    const memberIds = new Set((members ?? []).map(m => m.user_id))
    const next = new Map<string, string>()
    for (const r of (matrix ?? []) as { system_id: string; gates: Gate[] }[]) {
      const sorted = [...r.gates].sort((x, y) => x.order - y.order || x.code.localeCompare(y.code))
      const g = sorted.find(x => x.status === 'regressed' || x.status === 'approved_needs_review')
        ?? sorted.find(x => !['approved', 'approved_with_conditions', 'approved_needs_review', 'regressed'].includes(x.status))
      if (g) next.set(r.system_id, g.gate_id)
    }
    const rows = (actors ?? []) as Actor[]
    expect(rows.length).toBe(next.size)
    for (const r of rows) {
      expect(next.get(r.system_id)).toBe(r.gate_id)
      expect(typeof r.kind).toBe('string')
      if (r.kind === 'sign') expect(r.capacity).toBeTruthy()
      if (!isActorKind(r.kind)) expect(r.people).toEqual([])
      expect(r.people.length).toBeLessThanOrEqual(5)
      for (const p of r.people) expect(memberIds.has(p.id)).toBe(true)
    }
  })

  it('quien no es del proyecto no ve los actores', async () => {
    const { error } = await b.rpc('project_gate_actors', { p_project_id: pid })
    expect(error?.message).toMatch(/Access denied/)
  })
})
