import { describe, expect, it } from 'vitest'
import { normalizeTag, reviewErrors, splitGroupedEffects, toReview, type AiCeOutput } from './import'

const output: AiCeOutput = {
  matrix_title: 'Paro compresor', source_document: 'CE-001', revision: 'B',
  causes: [
    { code: 'C-01', description: 'PAHH succión', tag: 'pt-101', signal: 'PAHH-101', condition: 'HH', setpoint: '9,5 barg', voting: '1oo1', uncertain: false, note: null },
    { code: 'C-02', description: 'Paro manual', tag: 'HS-999', signal: null, condition: 'manual', setpoint: null, voting: null, uncertain: true, note: 'tag borroso' },
  ],
  effects: [
    { code: 'E-01', description: 'Cierre ESDV', tag: 'ESDV-7621003', action: 'close', uncertain: false, note: null },
    { code: 'E-02', description: 'Paro compresor', tag: null, action: 'stop', uncertain: false, note: null },
  ],
  links: [
    { cause_code: 'C-01', effect_code: 'E-01', delay_s: null, uncertain: false },
    { cause_code: 'c-01', effect_code: 'E-02', delay_s: 5, uncertain: false },
    { cause_code: 'C-01', effect_code: 'E-01', delay_s: null, uncertain: false },
    { cause_code: 'C-09', effect_code: 'E-01', delay_s: null, uncertain: false },
  ],
  warnings: [],
}

describe('importación C&E con IA', () => {
  it('empareja tags del proyecto y arma los cruces', () => {
    const r = toReview(output, ['PT-101', 'ESDV-7621003'])
    expect(normalizeTag(' pt 101 ')).toBe('PT101')
    // S13 (F-15): guiones, «_», puntos y barras tampoco cuentan (= SQL tags.tag_key).
    expect(normalizeTag('pt-101')).toBe('PT101')
    expect(normalizeTag('PT_101')).toBe('PT101')
    expect(normalizeTag('21-PT-1001/A')).toBe('21PT1001A')
    expect(r.causes.map(c => [c.code, c.tagMatched])).toEqual([['C-01', true], ['C-02', false]])
    expect(r.effects.map(e => e.tagMatched)).toEqual([true, true]) // sin tag no es «sin pareja»
    expect(r.links).toEqual([
      { cause: 'c0', effect: 'e0', delay: '', uncertain: false },
      { cause: 'c0', effect: 'e1', delay: '5', uncertain: false },
    ])
    expect(r.warnings).toEqual(['Cruce C-09 × E-01: la causa o el efecto no está en la lista'])
  })

  it('no deja guardar códigos repetidos, descripciones vacías ni retardos inválidos', () => {
    const r = toReview(output, [])
    expect(reviewErrors(r)).toEqual([])
    r.causes[1].code = 'c-01'
    r.effects[0].description = ' '
    r.links[1].delay = '-2'
    expect(reviewErrors(r)).toEqual(['Causa C-01 está repetida', 'Efecto E-01: falta la descripción', 'Hay un retardo que no es un número de segundos ≥ 0'])
  })
})

describe('splitGroupedEffects (GG-007 de CPF Orotoy)', () => {
  const grouped: AiCeOutput = {
    ...output,
    effects: [
      { code: 'E-01', description: 'Para mezcladores', tag: 'MZ-762101A/B, MZ-762102A/B', action: 'stop', uncertain: false, note: null },
      { code: 'E-02', description: 'Cierra tanques', tag: 'TK-762103/104', action: 'close', uncertain: false, note: null },
      { code: 'E-03', description: 'Cierre ESDV', tag: 'ESDV-7621003', action: 'close', uncertain: false, note: null },
    ],
    links: [
      { cause_code: 'C-01', effect_code: 'E-01', delay_s: null, uncertain: false },
      { cause_code: 'C-02', effect_code: 'e-02', delay_s: 5, uncertain: false },
      { cause_code: 'C-01', effect_code: 'E-03', delay_s: null, uncertain: false },
    ],
  }
  const out = splitGroupedEffects(grouped)

  it('un efecto por equipo, con sufijo en el código', () => {
    expect(out.effects.map(e => `${e.code}=${e.tag}`)).toEqual([
      'E-01.1=MZ-762101A', 'E-01.2=MZ-762101B', 'E-01.3=MZ-762102A', 'E-01.4=MZ-762102B',
      'E-02.1=TK-762103', 'E-02.2=TK-762104', 'E-03=ESDV-7621003',
    ])
  })
  it('los cruces se copian a cada equipo, con su retardo', () => {
    expect(out.links.map(l => `${l.cause_code}×${l.effect_code}${l.delay_s ? `/${l.delay_s}` : ''}`)).toEqual([
      'C-01×E-01.1', 'C-01×E-01.2', 'C-01×E-01.3', 'C-01×E-01.4', 'C-02×E-02.1/5', 'C-02×E-02.2/5', 'C-01×E-03',
    ])
    expect(out.warnings).toHaveLength(2)
  })
  it('sin efectos agrupados devuelve la misma salida', () => {
    expect(splitGroupedEffects(output)).toBe(output)
  })
})
