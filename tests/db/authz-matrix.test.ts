import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * A-17 (S01, 2026-10-19): matriz de autorización rol × tabla × operación DENTRO del tenant.
 * rls-smoke prueba el cruce entre orgs; esta suite prueba qué puede escribir cada rol de la MISMA org
 * por PostgREST directo (sin pasar por las actions), que es por donde se abrieron A-01…A-06.
 *
 * Corre contra la BD de CI, que hoy es PRODUCCIÓN (decisión D2, 2026-10-19). Por eso ninguna sonda
 * puede escribir, ni siquiera cuando la política la deja pasar:
 *   - INSERT: el payload omite una columna NOT NULL sin default. Postgres evalúa el WITH CHECK de RLS
 *     ANTES de las restricciones: denegado → 42501; permitido → 23502 (not_null_violation). Nunca inserta.
 *   - UPDATE: pone en NULL una columna NOT NULL de una fila existente. Denegado → el USING la filtra
 *     y no hay error (0 filas); permitido → 23502 (o el error de un trigger, que también prueba que la
 *     fila llegó a la escritura). La transacción falla, así que nada cambia.
 *   - SELECT de una columna: denegado → 42501 (privilegio de columna); permitido → sin error. Solo lee.
 *   - DELETE no tiene sonda segura: queda para cuando exista la base de pruebas (D2).
 *
 * Usuarios: TEST_ROLE_<ROL>_EMAIL / TEST_ROLE_<ROL>_PASSWORD (OWNER, ADMIN, ARCHITECT, LEADER,
 * INSPECTOR, CLIENT), todos miembros de la org de TEST_PROJECT_A_ID. TEST_USER_A cubre su propio rol si
 * falta esa variable, y TEST_USER_B (otra org) es el «outsider». Las columnas de un rol sin usuario se
 * omiten (skip) en lugar de fallar.
 *
 * `gap`: lo que HOY está abierto y debería no estarlo. Esas celdas corren con `it.fails`: pasan mientras
 * el hueco exista y se ponen rojas cuando la sesión que lo corrige lo cierra — ahí se quita el `gap`.
 */
const env = process.env
const enabled = !!(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && env.TEST_PROJECT_A_ID)

const ROLES = ['owner', 'admin', 'architect', 'leader', 'inspector', 'client'] as const
type Role = (typeof ROLES)[number]
type Actor = Role | 'outsider'
const EDITORS: Role[] = ['owner', 'admin', 'architect', 'leader']
const PRIVILEGED: Role[] = ['owner', 'admin', 'architect']

type Fixtures = {
  orgId: string
  projectId: string
  subsystemId: string
  disciplineId: string
  ownerMemberId: string | null
  tagId: string | null
  punchId: string | null
  certificateId: string | null
  pssrReviewId: string | null
}

type Probe =
  | { op: 'insert'; table: string; payload: (fx: Fixtures, uid: string) => Record<string, unknown> | null }
  | { op: 'update'; table: string; column: string; rowId: (fx: Fixtures) => string | null }
  | { op: 'select'; table: string; column: string }

type Case = Probe & {
  name: string
  /** Roles que DEBERÍAN poder escribir (el outsider nunca). */
  allow: Role[]
  /** Roles que hoy pueden aunque no deberían, con el hallazgo y la sesión que lo cierra. */
  gap?: { roles: Role[]; finding: string; session: string }
}

const fakeUuid = '00000000-0000-4000-8000-00000000a17a'

const CASES: Case[] = [
  {
    // A-01 cerrado en el hotfix 7eb0a7c: api_keys solo tiene política de SELECT; se crea por la action.
    name: 'api_keys: crear directo por PostgREST', op: 'insert', table: 'api_keys',
    payload: fx => ({ org_id: fx.orgId, name: 'authz-probe', key_prefix: 'probe' }), // falta key_hash
    allow: [],
  },
  {
    name: 'org_members: invitar un miembro', op: 'insert', table: 'org_members',
    payload: fx => ({ org_id: fx.orgId, role: 'inspector' }), // falta user_id
    allow: [], // S15 (A-02/I-12): por REST nadie; se invita con la RPC add_org_member (owner/admin)
  },
  {
    name: 'org_members: cambiar la fila de un owner', op: 'update', table: 'org_members', column: 'role',
    rowId: fx => fx.ownerMemberId,
    allow: [], // A-02: trigger en S02; desde S15 sin escritura directa (RPC set_member_role, solo owner toca owners)
  },
  {
    name: 'projects: editar el proyecto', op: 'update', table: 'projects', column: 'name',
    rowId: fx => fx.projectId,
    allow: ['owner', 'admin', 'architect'],
  },
  {
    name: 'areas: crear un área', op: 'insert', table: 'areas',
    payload: fx => ({ project_id: fx.projectId, code: 'AUTHZ-PROBE' }), // falta name
    allow: EDITORS,
  },
  {
    name: 'tags: editar un tag', op: 'update', table: 'tags', column: 'description',
    rowId: fx => fx.tagId,
    allow: EDITORS,
  },
  {
    name: 'punches: levantar un punch', op: 'insert', table: 'punches',
    payload: (fx, uid) => ({
      project_id: fx.projectId, subsystem_id: fx.subsystemId, discipline_id: fx.disciplineId,
      category: 'C', punch_number: 'TMP', raised_by: uid, // la política exige raised_by = auth.uid()
    }), // falta description
    allow: [...EDITORS, 'inspector'],
  },
  {
    name: 'punches: editar descripción por PostgREST', op: 'update', table: 'punches', column: 'description',
    rowId: fx => fx.punchId,
    allow: EDITORS, // S06 (A-06): inspector → trigger 42501; client → fuera de la RLS
  },
  {
    // S06 (A-06/C-11): la categoría solo cambia por review_punch_category (supervisor, con motivo): nadie por REST.
    name: 'punches: cambiar categoría por PostgREST', op: 'update', table: 'punches', column: 'category',
    rowId: fx => fx.punchId,
    allow: [],
  },
  {
    name: 'certificates: editar un certificado', op: 'update', table: 'certificates', column: 'title',
    rowId: fx => fx.certificateId,
    allow: [], // A-05 cerrado en S17: emitir/revocar/reabrir y el bloqueo solo por RPC (issue/revoke/reopen_certificate)
  },
  {
    name: 'certificate_signatures: firmar a nombre de otro', op: 'insert', table: 'certificate_signatures',
    payload: fx => (fx.certificateId ? { certificate_id: fx.certificateId, user_id: fakeUuid } : null), // falta role
    allow: [], // S17: firmar solo por sign_certificate (capacidad del rol, una persona por rol)
  },
  {
    name: 'pssr_reviews: editar una revisión (estado/aprobación)', op: 'update', table: 'pssr_reviews', column: 'title',
    rowId: fx => fx.pssrReviewId,
    allow: [], // A-04 cerrado en S16: sin UPDATE directo; notas/fecha por update_pssr_meta, estado por submit/approve/reject_pssr
  },
  {
    name: 'pssr_signatures: firmar a nombre de otro', op: 'insert', table: 'pssr_signatures',
    payload: fx => (fx.pssrReviewId ? { review_id: fx.pssrReviewId, user_id: fakeUuid } : null), // falta signature_data
    allow: [], // A-04 cerrado en S16: firmas solo por sign_pssr (user_id = auth.uid(), por capacidad)
  },
  {
    // I-11 (S02): las reglas llevan headers de terceros en action_payload; solo owner/admin/architect.
    name: 'workflow_rules: crear una regla', op: 'insert', table: 'workflow_rules',
    payload: fx => ({ org_id: fx.orgId, trigger_event: 'itrs.updated', action_type: 'notify_user' }), // falta name
    allow: PRIVILEGED,
  },
  {
    // I-11 (S02): el secreto HMAC solo se muestra al crearlo; nadie lo lee por PostgREST.
    name: 'webhook_subscriptions: leer el secreto', op: 'select', table: 'webhook_subscriptions', column: 'secret',
    allow: [],
  },
  {
    name: 'itr_signatures: insertar directo (solo por RPC)', op: 'insert', table: 'itr_signatures',
    payload: () => ({ itr_id: fakeUuid, user_id: fakeUuid }), // falta role; además sin GRANT de INSERT
    allow: [],
  },
]

type Outcome = 'allow' | 'deny'

async function probe(c: SupabaseClient, p: Probe, fx: Fixtures): Promise<Outcome | 'n/a'> {
  if (p.op === 'insert') {
    const { data: me } = await c.auth.getUser()
    const payload = p.payload(fx, me.user!.id)
    if (!payload) return 'n/a'
    const { error } = await c.from(p.table).insert(payload)
    if (!error) throw new Error(`${p.table}: el INSERT de sonda se ejecutó (no debía poder escribir nada)`)
    if (error.code === '42501') return 'deny'
    if (error.code === '23502') return 'allow'
    throw new Error(`${p.table}: resultado inesperado ${error.code} ${error.message}`)
  }
  if (p.op === 'select') {
    const { error } = await c.from(p.table).select(p.column).limit(1)
    if (!error) return 'allow'
    if (error.code === '42501') return 'deny'
    throw new Error(`${p.table}.${p.column}: resultado inesperado ${error.code} ${error.message}`)
  }
  const id = p.rowId(fx)
  if (!id) return 'n/a'
  const { error } = await c.from(p.table).update({ [p.column]: null }).eq('id', id)
  if (!error) return 'deny'
  if (error.code === '42501') return 'deny'
  return 'allow' // 23502 o el error de un trigger: la fila pasó el USING
}

async function signIn(email: string, password: string) {
  const c = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return c
}

const actors = new Map<Actor, SupabaseClient>()
let fx: Fixtures

async function firstId(c: SupabaseClient, table: string, filter: Record<string, string>) {
  let q = c.from(table).select('id').limit(1)
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
  const { data } = await q.maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

describe.skipIf(!enabled)('autorización rol × tabla × operación (A-17)', () => {
  beforeAll(async () => {
    const a = await signIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    const { data: me } = await a.auth.getUser()
    const pid = env.TEST_PROJECT_A_ID!
    const { data: project } = await a.from('projects').select('org_id').eq('id', pid).single()
    const orgId = project!.org_id as string
    const { data: mine } = await a.from('org_members').select('role').eq('org_id', orgId).eq('user_id', me.user!.id).single()

    for (const role of ROLES) {
      const email = env[`TEST_ROLE_${role.toUpperCase()}_EMAIL`]
      const password = env[`TEST_ROLE_${role.toUpperCase()}_PASSWORD`]
      if (email && password) actors.set(role, await signIn(email, password))
      else if (mine?.role === role) actors.set(role, a)
    }
    if (env.TEST_USER_B_EMAIL && env.TEST_USER_B_PASSWORD) actors.set('outsider', await signIn(env.TEST_USER_B_EMAIL, env.TEST_USER_B_PASSWORD))

    const { data: owner } = await a.from('org_members').select('id').eq('org_id', orgId).eq('role', 'owner').limit(1).maybeSingle()
    fx = {
      orgId,
      projectId: pid,
      subsystemId: (await firstId(a, 'subsystems', { project_id: pid }))!,
      disciplineId: (await firstId(a, 'disciplines', { org_id: orgId }))!,
      ownerMemberId: owner?.id ?? null,
      tagId: await firstId(a, 'tags', { project_id: pid }),
      punchId: await firstId(a, 'punches', { project_id: pid }),
      certificateId: await firstId(a, 'certificates', { project_id: pid }),
      pssrReviewId: await firstId(a, 'pssr_reviews', { project_id: pid }),
    }
  })

  for (const c of CASES) {
    describe(c.name, () => {
      for (const actor of [...ROLES, 'outsider'] as Actor[]) {
        const isGap = actor !== 'outsider' && !!c.gap?.roles.includes(actor)
        const expected: Outcome = actor !== 'outsider' && c.allow.includes(actor) ? 'allow' : 'deny'
        const title = isGap
          ? `${actor}: debería ${expected === 'deny' ? 'denegar' : 'permitir'} — hueco abierto ${c.gap!.finding}, se cierra en ${c.gap!.session}`
          : `${actor}: ${expected === 'deny' ? 'denegado' : 'permitido'}`
        const run = isGap ? it.fails : it
        run(title, async ({ skip }) => {
          const client = actors.get(actor)
          if (!client) return skip(`sin usuario de prueba para ${actor}`)
          const got = await probe(client, c, fx)
          if (got === 'n/a') return skip('sin fila de prueba en el proyecto')
          expect(got).toBe(expected)
        })
      }
    })
  }
})

/**
 * A-19 (S02): ninguna función de public es ejecutable por anon, y las DEFINER internas solo por service
 * role. La sonda llama con un UUID que no existe: si la llamada pasara, no tocaría ninguna fila.
 */
describe.skipIf(!enabled)('EXECUTE de funciones (A-19)', () => {
  const ghost = '00000000-0000-4000-8000-0000000a1900'

  it('anon no ejecuta funciones de public', async () => {
    const anon = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    for (const [fn, args] of [
      ['document_is_controller', { p_role: 'owner' }],
      ['vendor_checklist_keys', { p_phase: 'fat' }],
      ['evaluate_itr_capture', { p_itr_id: ghost }],
    ] as const) {
      const { error } = await anon.rpc(fn, args)
      expect(error?.code, fn).toBe('42501')
    }
  })

  it('un miembro no ejecuta las DEFINER internas', async () => {
    const a = await signIn(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    for (const [fn, args] of [
      ['bump_push_subscription_failure', { p_sub_id: ghost }],
      ['itr_test_equipment_blocker', { p_itr_id: ghost }],
    ] as const) {
      const { error } = await a.rpc(fn, args)
      expect(error?.code, fn).toBe('42501')
    }
  })
})
