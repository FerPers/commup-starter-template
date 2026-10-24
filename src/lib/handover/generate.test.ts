import { beforeEach, describe, expect, it, vi } from 'vitest'

// A10 (revisión 2026-10-23 hallazgo 5): un paquete con anexos omitidos no queda ISSUED, en la fila ni en el evento.
const h = vi.hoisted(() => ({ omitted: [] as { path: string; reason: string }[], updates: [] as Record<string, unknown>[], events: [] as Record<string, unknown>[] }))
vi.mock('./sign', () => ({ loadSigningKey: async () => ({ keyId: 'k1' }) }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }))
vi.mock('./bundle', () => ({
  buildHandoverBundle: async () => ({
    dataSha256: 'a'.repeat(64), json: new Uint8Array([1]), indexPdf: new Uint8Array([2]), zip: new Uint8Array([3]), signature: 'sig',
    manifest: { omitted: h.omitted, complete: h.omitted.length === 0 },
  }),
}))
import { generateHandoverPackage } from './generate'

function db() {
  return {
    rpc: async () => ({ data: { handover_package: { systems: [] } }, error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'u' } }) }) },
    from(table: string) {
      const q = {
        insert: (row: Record<string, unknown>) => { if (table === 'domain_events') h.events.push(row); return q },
        update: (row: Record<string, unknown>) => { if (table === 'handover_packages') h.updates.push(row); return q },
        select: () => q, eq: () => q,
        single: async () => ({ data: table === 'handover_packages' ? { id: 'pkg' } : { name: 'Org' }, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      }
      return q
    },
  }
}
const input = { orgId: 'org', projectId: 'p', systemIds: null, formats: ['zip' as const], actorId: 'u', source: 'ui' as const }

beforeEach(() => { h.omitted = []; h.updates = []; h.events = [] })

describe('generateHandoverPackage (A10)', () => {
  it('sin omisiones: ISSUED y handover.issued', async () => {
    // @ts-expect-error cliente de prueba con solo lo que usa el generador
    const res = await generateHandoverPackage(db(), input)
    expect(res).toMatchObject({ status: 'ISSUED', omittedCount: 0 })
    expect(h.updates.at(-1)).toMatchObject({ status: 'ISSUED', omitted_count: 0 })
    expect(h.events[0]).toMatchObject({ event_type: 'handover.issued', payload: { complete: true, omitted: 0 } })
  })

  it('con un anexo omitido: PARTIAL, nunca ISSUED, y handover.partial', async () => {
    h.omitted = [{ path: 'anexos/S01/itr/x.pdf', reason: 'más de 600 ITR por paquete' }]
    // @ts-expect-error cliente de prueba con solo lo que usa el generador
    const res = await generateHandoverPackage(db(), input)
    expect(res).toMatchObject({ status: 'PARTIAL', omittedCount: 1 })
    expect(h.updates.map(u => u.status)).not.toContain('ISSUED')
    expect(h.updates.at(-1)).toMatchObject({ status: 'PARTIAL', omitted_count: 1 })
    expect(h.events[0]).toMatchObject({ event_type: 'handover.partial', payload: { complete: false, omitted: 1 } })
  })
})
