import { describe, expect, it } from 'vitest'
import { dedupeLast, mergeCounts, runBatches } from './batches'

describe('importación por lotes (S07)', () => {
  it('dedupeLast: gana la última fila', () => {
    expect(dedupeLast([{ t: 'A', v: 1 }, { t: 'B', v: 1 }, { t: 'a', v: 2 }], r => r.t.toUpperCase())).toEqual([{ t: 'B', v: 1 }, { t: 'a', v: 2 }])
  })

  it('runBatches: lotes, progreso, filas corregidas por desplazamiento y suma', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => i)
    const progress: number[] = []
    const res = await runBatches(rows,
      async batch => ({ result: { imported: batch.length, errors: [{ row: 2, tag: 'X', reason: 'r' }], warnings: ['w'] } }),
      mergeCounts, done => progress.push(done), 2)
    expect(res.result).toMatchObject({ imported: 5, warnings: ['w'] })
    expect(res.result!.errors.map(e => e.row)).toEqual([2, 4, 6])
    expect(progress).toEqual([2, 4, 5])
  })

  it('runBatches se detiene ante un error de la action', async () => {
    let calls = 0
    const res = await runBatches([1, 2, 3], async () => (++calls === 2 ? { error: 'boom' } : { result: { errors: [], warnings: [] } }), mergeCounts, undefined, 1)
    expect(res.error).toBe('boom')
    expect(calls).toBe(2)
  })

  it('runBatches: una action que lanza devuelve error (el asistente no queda en «Importando…»)', async () => {
    let calls = 0
    const res = await runBatches([1, 2], async () => { if (++calls === 2) throw new Error('fetch failed'); return { result: { errors: [], warnings: [] } } }, mergeCounts, undefined, 1)
    expect(res.error).toContain('fetch failed')
    expect(res.result).toEqual({ errors: [], warnings: [] })
  })
})
