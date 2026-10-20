import { describe, expect, it } from 'vitest'
import { fetchAllRows, fetchAllRowsFlagged, TruncatedError } from './fetch-all'

/** Builder falso: guarda las órdenes pedidas y sirve `total` filas por rango. */
function fakeBuilder(total: number, log: string[][]) {
  return () => {
    const orders: string[] = []
    const q = {
      order(col: string) { orders.push(col); return q },
      range(from: number, to: number) {
        log.push(orders)
        const n = Math.max(0, Math.min(to, total - 1) - from + 1)
        return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: from + i })), error: null })
      },
    }
    return q
  }
}

describe('fetchAllRows (S09, B-08)', () => {
  it('pagina hasta agotar y ordena siempre por la clave única', async () => {
    const log: string[][] = []
    const rows = await fetchAllRows(fakeBuilder(2500, log))
    expect(rows).toHaveLength(2500)
    expect(log).toHaveLength(3)
    expect(log.every(o => o.at(-1) === 'id')).toBe(true)
  })

  it('usa la clave indicada (vistas o RPC sin id)', async () => {
    const log: string[][] = []
    await fetchAllRows(fakeBuilder(10, log), { key: 'subsystem_id' })
    expect(log[0]).toEqual(['subsystem_id'])
  })

  it('exactamente el tope no es truncado', async () => {
    const r = await fetchAllRowsFlagged(fakeBuilder(2000, []), { maxRows: 2000 })
    expect(r).toMatchObject({ truncated: false })
    expect(r.rows).toHaveLength(2000)
  })

  it('pasar el tope marca truncated o lanza TruncatedError (antes cortaba en silencio)', async () => {
    const r = await fetchAllRowsFlagged(fakeBuilder(2001, []), { maxRows: 2000 })
    expect(r.truncated).toBe(true)
    expect(r.rows).toHaveLength(2000)
    await expect(fetchAllRows(fakeBuilder(2001, []), { maxRows: 2000 })).rejects.toBeInstanceOf(TruncatedError)
  })
})
