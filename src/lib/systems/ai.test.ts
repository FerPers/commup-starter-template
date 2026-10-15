import { describe, expect, it } from 'vitest'
import { reconcileSuggestions } from './ai'

const systems = [
  { id: 'aire', code: 'U100-S01', name: 'Aire de instrumentos', system_type: 'utility' as const, priority: 1 },
  { id: 'n2', code: 'U100-S02', name: 'U100-S02', system_type: null, priority: null },
  { id: 'comp', code: 'A100-S01', name: 'A100-S01', system_type: null, priority: null },
]

describe('reconcileSuggestions', () => {
  it('cruza atributos con el estado real y respeta las decisiones humanas', () => {
    const res = reconcileSuggestions({
      systems: [
        { system_code: 'u100-s01', suggested_name: 'Aire', system_type: 'utility', priority: 1, confidence: 0.9, reason: 'r' },
        { system_code: 'U100-S02', suggested_name: 'Nitrógeno', system_type: 'utility', priority: 9, confidence: 1.4, reason: 'r' },
        { system_code: 'X999', suggested_name: 'x', system_type: 'process', priority: 2, confidence: 0.5, reason: 'r' },
      ],
      dependencies: [],
    }, systems, [])
    expect(res.attributes.map(a => [a.system_code, a.humanDecided, a.priority, a.confidence])).toEqual([
      ['U100-S01', true, 1, 0.9],
      ['U100-S02', false, 3, 1],
    ])
    expect(res.discarded).toEqual(['Sistema desconocido: X999'])
  })

  it('descarta dependencias existentes, inventadas y ciclos (gana la de más confianza)', () => {
    const res = reconcileSuggestions({
      systems: [],
      dependencies: [
        { system_code: 'A100-S01', depends_on_code: 'U100-S01', kind: 'utility', confidence: 0.9, reason: 'ya existe' },
        { system_code: 'U100-S01', depends_on_code: 'U100-S02', kind: 'utility', confidence: 0.8, reason: 'aire usa N2' },
        { system_code: 'U100-S02', depends_on_code: 'U100-S01', kind: 'utility', confidence: 0.4, reason: 'ciclo' },
        { system_code: 'A100-S01', depends_on_code: 'Z1', kind: 'process', confidence: 0.7, reason: 'inventado' },
      ],
    }, systems, [{ system_id: 'comp', depends_on_system_id: 'aire' }])
    expect(res.dependencies.map(d => `${d.system_code}→${d.depends_on_code}`)).toEqual(['U100-S01→U100-S02'])
    expect(res.discarded).toEqual([
      'Dependencia con sistema desconocido: A100-S01 → Z1',
      'Ciclo o autodependencia: U100-S02 → U100-S01',
    ])
  })
})
