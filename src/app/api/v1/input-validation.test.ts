import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A05 (revisión 2026-10-23 hallazgo 11): «fuzzing acotado» de la API v1. Con null, arreglos, números, tipos
// equivocados, JSON roto y cuerpos excesivos, cada ruta responde 400/413/422 y NUNCA llega a la BD ni lanza.
const db = vi.hoisted(() => ({ touched: 0 }))
vi.mock('@/lib/api/auth', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  authenticateApiKey: async () => ({ ok: true, orgId: 'org', keyId: 'key', projectId: null, scopes: [] }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  // Si una entrada inválida llegara a la BD, este cliente lo delata.
  createAdminClient: () => new Proxy({}, { get: () => { db.touched++; throw new Error('la validación dejó pasar una entrada inválida hasta la BD') } }),
}))

import * as tags from './tags/route'
import * as itrs from './itrs/route'
import * as punches from './punches/route'
import * as transfer from './punches/[id]/transfer-to-ops/route'
import * as opsUpdate from './punches/[id]/ops-update/route'
import * as handover from './handover/export/route'
import * as samples from './signals/samples/route'
import * as certificates from './certificates/route'
import * as events from './events/route'
import * as systems from './systems/route'
import * as postHandover from './punches/post-handover/route'
import * as packages from './handover/packages/[id]/route'

const ID = '7d1e5c2a-0f3b-4c55-9a51-3f0f2f1b6c10'
const params = (id: string) => ({ params: Promise.resolve({ id }) })

function post(body: string, method = 'POST', url = 'https://commup.app/api/v1/x') {
  return new NextRequest(url, { method, body, headers: { 'content-type': 'application/json', authorization: 'Bearer k' } })
}
function get(query: string) {
  return new NextRequest(`https://commup.app/api/v1/x?${query}`, { headers: { authorization: 'Bearer k' } })
}

/** Cuerpos hostiles que valen para cualquier ruta de escritura. */
const HOSTILE = [
  '', '{', 'null', '[]', '[{}]', '42', '"texto"', 'true', '{}',
  JSON.stringify({ project_id: null }), JSON.stringify({ project_id: ['a'] }), JSON.stringify({ project_id: 7 }),
  JSON.stringify({ project_id: 'no-es-uuid', tag_id: {}, template_id: [] }),
  JSON.stringify({ status: 5, transferred_to: false, samples: 'x', format: [1] }),
]

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const WRITES: Array<[string, Handler, string?]> = [
  ['POST /tags', tags.POST],
  ['POST /itrs', itrs.POST],
  ['POST /punches', punches.POST],
  ['POST /punches/:id/transfer-to-ops', transfer.POST],
  ['PATCH /punches/:id/ops-update', opsUpdate.PATCH, 'PATCH'],
  ['POST /handover/export', handover.POST],
  ['POST /signals/samples', samples.POST],
]

beforeEach(() => { db.touched = 0 })

describe('API v1: cuerpos hostiles (A05)', () => {
  for (const [name, handler, method] of WRITES) {
    it(`${name} responde 400/413/422 y no toca la BD`, async () => {
      for (const body of HOSTILE) {
        const res = await handler(post(body, method), params(ID))
        expect([400, 413, 422], `${name} con ${body.slice(0, 40)} → ${res.status}`).toContain(res.status)
        const json: { error?: unknown } = await res.json()
        expect(typeof json.error).toBe('string')
      }
      expect(db.touched).toBe(0)
    })
  }

  it('un cuerpo por encima del tope es 413', async () => {
    const res = await tags.POST(post(JSON.stringify({ description: 'x'.repeat(300 * 1024) })))
    expect(res.status).toBe(413)
  })

  it('un 422 dice qué campo falló', async () => {
    const res = await punches.POST(post(JSON.stringify({ project_id: ID, tag_id: ID, category: 'Z', description: '' })))
    expect(res.status).toBe(422)
    const { issues }: { issues: Array<{ path: string }> } = await res.json()
    expect(issues.map(i => i.path)).toEqual(expect.arrayContaining(['category', 'description']))
  })

  it('handover: format [1] ya no llega a toLowerCase()', async () => {
    const res = await handover.POST(post(JSON.stringify({ project_id: ID, format: [1] })))
    expect(res.status).toBe(422)
  })

  it('muestras: null o números en samples son 422; más de 5000 es 413', async () => {
    expect((await samples.POST(post(JSON.stringify({ samples: [null] })))).status).toBe(422)
    expect((await samples.POST(post(JSON.stringify({ samples: [1, 2] })))).status).toBe(422)
    const many = Array.from({ length: 5001 }, () => ({ signal_name: 'PT', sampled_at: '2026-10-24T00:00:00Z', value: 1 }))
    expect((await samples.POST(post(JSON.stringify({ samples: many })))).status).toBe(413)
  })

  it('un cuerpo válido sí pasa la validación (llega a la BD)', async () => {
    await expect(tags.POST(post(JSON.stringify({ project_id: ID, tag_number: 'PT-1', subsystem_id: ID, discipline_id: ID })))).rejects.toThrow(/hasta la BD/)
    // La muestra deja que la RPC juzgue el valor (rechazo parcial 207), aunque no sea número.
    await expect(samples.POST(post(JSON.stringify({ samples: [{ signal_name: 'PT', sampled_at: 'ayer', value: 'abc' }] })))).rejects.toThrow(/hasta la BD/)
  })
})

describe('API v1: parámetros hostiles (A05)', () => {
  const READS: Array<[string, (req: NextRequest) => Promise<Response>]> = [
    ['GET /tags', tags.GET], ['GET /itrs', itrs.GET], ['GET /punches', punches.GET], ['GET /certificates', certificates.GET],
    ['GET /events', events.GET], ['GET /systems', systems.GET], ['GET /punches/post-handover', postHandover.GET], ['GET /handover/export', handover.GET],
  ]
  for (const [name, handler] of READS) {
    it(`${name}: sin project_id o con uno que no es UUID → 400`, async () => {
      for (const q of ['', 'project_id=', 'project_id=abc', `project_id=${ID}'--`]) {
        const res = await handler(get(q))
        expect(res.status, `${name}?${q}`).toBe(400)
      }
      expect(db.touched).toBe(0)
    })
  }

  it('filtros con id inválido o fecha inválida → 400', async () => {
    expect((await itrs.GET(get(`project_id=${ID}&tag_id=x`))).status).toBe(400)
    expect((await tags.GET(get(`project_id=${ID}&status=borrado`))).status).toBe(400)
    expect((await events.GET(get(`project_id=${ID}&since=ayer`))).status).toBe(400)
    expect(db.touched).toBe(0)
  })

  it('ids de ruta que no son UUID → 400', async () => {
    expect((await packages.GET(get(''), params('../../etc'))).status).toBe(400)
    expect((await transfer.POST(post('{}'), params('abc'))).status).toBe(400)
    expect((await opsUpdate.PATCH(post('{}', 'PATCH'), params('1 OR 1=1'))).status).toBe(400)
    expect(db.touched).toBe(0)
  })
})
