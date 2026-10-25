import { describe, expect, it } from 'vitest'
import { actorText, peopleText, type GateActor } from './actors'

const t = {
  action: (kind: string, v: { capacity: string; count: number }) => ({ sign: `Firma de ${v.capacity}`, approve: 'Aprobar', review: 'Revisar', punch: `${v.count} Cat A`, itr_rejected: `${v.count} no conformes`, itrs: `${v.count} ITR por aprobar`, scope: 'Definir el alcance' } as Record<string, string>)[kind],
  capacity: (c: string) => c.toUpperCase(),
  criterion: (k: string) => `criterio ${k}`,
  more: (names: string, n: number) => `${names} y ${n} más`,
  nobody: 'sin responsable',
}
const a = (over: Partial<GateActor>): GateActor => ({ system_id: 's', gate_id: 'g', gate_code: 'MC', kind: 'approve', capacity: null, people: [], item_count: null, ...over })

describe('quién debe actuar (A47 · E5)', () => {
  it('hasta dos nombres y «y N más»', () => {
    expect(peopleText([{ id: '1', name: 'Ana' }, { id: '2', name: 'Leo' }, { id: '3', name: 'Óscar' }], t.more)).toBe('Ana, Leo y 1 más')
    expect(peopleText([{ id: '1', name: 'Ana' }], t.more)).toBe('Ana')
  })
  it('qué hacer · quién', () => {
    expect(actorText(a({ kind: 'sign', capacity: 'hse', people: [{ id: '1', name: 'Ana' }] }), t)).toBe('Firma de HSE · Ana')
    expect(actorText(a({ kind: 'itrs', item_count: 31, people: [{ id: '1', name: 'Leo' }] }), t)).toBe('31 ITR por aprobar · Leo')
    expect(actorText(a({ kind: 'punch', item_count: 2 }), t)).toBe('2 Cat A · sin responsable')
  })
  it('un motivo sin persona nombra el criterio', () => {
    expect(actorText(a({ kind: 'registers_clear' }), t)).toBe('criterio registers_clear')
  })
})
