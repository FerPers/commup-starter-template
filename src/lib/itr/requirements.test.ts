import { describe, expect, it } from 'vitest'
import { buildChain, isRequired, parseReqParams, reqQuery, type ReqChip } from './requirements'

const chip = (code: string, phase: string, state: ReqChip['state'] = 'missing'): ReqChip =>
  ({ code, title: null, state, origin: 'matrix', itr_id: null, phase, reason: null })

describe('parámetros', () => {
  it('ignora lo desconocido y omite lo por defecto', () => {
    const p = parseReqParams({ filter: 'raro', system: 'no-uuid', q: '  pt-1 ', page: '0' })
    expect(p).toEqual({ filter: 'all', area: undefined, system: undefined, subsystem: undefined, q: 'pt-1', page: 1 })
    expect(reqQuery(p)).toBe('?q=pt-1')
    expect(reqQuery({ filter: 'missing', page: 3 })).toBe('?filter=missing&page=3')
  })
})

describe('buildChain', () => {
  const disc = (c: ReqChip) => (c.code.startsWith('E') ? 'Eléctrica' : 'Mecánica')

  it('agrupa por disciplina y fase, y marca el eslabón que falta entre la primera y la última fase', () => {
    const rows = buildChain([chip('M12A', 'A'), chip('M51C', 'C'), chip('E13B', 'B')], ['A', 'B', 'C', 'SU'], disc)
    expect(rows.map(r => r.discipline)).toEqual(['Eléctrica', 'Mecánica'])
    const mech = rows[1]
    expect(mech.columns.map(c => c.chips.map(x => x.code))).toEqual([['M12A'], [], ['M51C'], []])
    expect(mech.gaps).toEqual(['B'])
    expect(rows[0].gaps).toEqual([])
  })

  it('un ITR fuera de requisitos no cuenta para la cadena', () => {
    const rows = buildChain([chip('M12A', 'A'), chip('M99C', 'C', 'outside')], ['A', 'B', 'C'], disc)
    expect(rows[0].gaps).toEqual([])
  })

  it('isRequired deja fuera lo excluido y lo que sobra', () => {
    expect(['missing', 'generated', 'in_progress', 'approved', 'excluded', 'outside'].map(s => isRequired(s as ReqChip['state'])))
      .toEqual([true, true, true, true, false, false])
  })
})
