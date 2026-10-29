import { describe, expect, it } from 'vitest'
import { looksLikeTag } from './tag-shape'
import { sectionCode, sectionsByRow, subsystemCode } from './sections'

// Secuencia real de títulos de la lista de instrumentos de Akacías A2.2 (INS-LI-006) y de la de F&G (LI-002).
const H = (t: string) => ['', '', t]
const D = (tag: string) => ['1', tag, 'Descripción']
const isData = (r: unknown[]) => looksLikeTag(String(r[1] ?? ''))

describe('sectionsByRow', () => {
  const rows: unknown[][] = [
    H('SISTEMA DE CRUDO'), H('MULTIPLES DE RECIBO'), D('PIT-7621001'),
    H('SEPARADORES GENERALES 762101A/B'), D('LIT-7621001'),
    H('SISTEMA DE GAS'), H('SISTEMA DE GAS'), D('PIT-7625001'),
    H('UNIDAD RECUPERADORA DE VAPORES - URV'), D('PIT-7625101'),
    H('SISTEMA DE TEA'), D('PIT-7626001'),
    H('SISTEMAS AUXILIARES'), H('TANQUE SUMIDERO'), D('LIT-7627001'),
    ['', '', 'NOTAS:'], ['', '', '1. Los diagramas de lazo serán elaborados en la siguiente etapa.'],
  ]
  const s = sectionsByRow(rows, 0, isData)
  const at = (tag: string) => s.get(rows.findIndex(r => r[1] === tag))

  it('dos títulos seguidos = sistema › subsistema', () => {
    expect(at('PIT-7621001')).toEqual({ system: 'SISTEMA DE CRUDO', subsystem: 'MULTIPLES DE RECIBO' })
    expect(at('PIT-7625001')).toEqual({ system: 'SISTEMA DE GAS', subsystem: 'SISTEMA DE GAS' })
    expect(at('LIT-7627001')).toEqual({ system: 'SISTEMAS AUXILIARES', subsystem: 'TANQUE SUMIDERO' })
  })
  it('un título solo = subsistema nuevo del sistema anterior', () => {
    expect(at('LIT-7621001')).toEqual({ system: 'SISTEMA DE CRUDO', subsystem: 'SEPARADORES GENERALES 762101A/B' })
    expect(at('PIT-7625101')).toEqual({ system: 'SISTEMA DE GAS', subsystem: 'UNIDAD RECUPERADORA DE VAPORES - URV' })
  })
  it('un «SISTEMA …» solo es sistema y subsistema', () => {
    expect(at('PIT-7626001')).toEqual({ system: 'SISTEMA DE TEA', subsystem: 'SISTEMA DE TEA' })
  })
  it('sin títulos «SISTEMA» (lista F&G por zonas): subsistema sin sistema; una zona vacía no se vuelve sistema', () => {
    const fg: unknown[][] = [H('CONTROLADOR PRINCIPAL F&G'), H('SEPARADORES BIFÁSICOS HORIZONTALES SEP-762101A/B/C/D'), D('GD-762501'), H('CUARTO DE CONTROL'), D('SD-762609')]
    const f = sectionsByRow(fg, 0, isData)
    expect(f.get(2)).toEqual({ system: null, subsystem: 'SEPARADORES BIFÁSICOS HORIZONTALES SEP-762101A/B/C/D' })
    expect(f.get(4)).toEqual({ system: null, subsystem: 'CUARTO DE CONTROL' })
  })
  it('un título con el número de ítem en otra celda sigue siendo título (LI-006 de CPF Orotoy)', () => {
    const numbered: unknown[][] = [
      H('SISTEMA DE TEA'), D('PIT-7626001'),
      ['625', '', 'SISTEMA DE NAFTA'], ['626', '', 'RECIBO, ALMACENAMIENTO Y ENVÍO DE DILUYENTE'], D('PIT-7627001'),
      ['627', 'PIT-7627002', 'Descripción'],
    ]
    const n = sectionsByRow(numbered, 0, isData)
    expect(n.get(4)).toEqual({ system: 'SISTEMA DE NAFTA', subsystem: 'RECIBO, ALMACENAMIENTO Y ENVÍO DE DILUYENTE' })
    expect(n.get(5)).toEqual({ system: 'SISTEMA DE NAFTA', subsystem: 'RECIBO, ALMACENAMIENTO Y ENVÍO DE DILUYENTE' })
  })
  it('las notas al pie y el texto en minúsculas no son títulos', () => {
    const r: unknown[][] = [H('SISTEMA DE AGUA'), H('Ver nota 3 del documento'), D('PIT-7624001')]
    expect(sectionsByRow(r, 0, isData).get(2)).toEqual({ system: 'SISTEMA DE AGUA', subsystem: 'SISTEMA DE AGUA' })
  })
})

describe('sectionCode', () => {
  it('código estable y corto', () => {
    expect(sectionCode('SISTEMA DE CRUDO')).toBe('SISTEMA-CRUDO')
    expect(sectionCode('SEPARADORES GENERALES 762101A/B')).toBe('SEPARADORES-GENERALES-762101A-B')
    expect(sectionCode('TANQUES DE ALMACENAMIENTO FUERA DE ESPECIFICACIÓN').length).toBeLessThanOrEqual(40)
    expect(sectionCode('ÁREA PERSONAL EN CONTINGENCIA')).toBe('AREA-PERSONAL-CONTINGENCIA')
  })
})

describe('códigos sin choques', () => {
  it('dos títulos que se cortan igual tienen códigos distintos', () => {
    const a = sectionCode('TANQUES DE ALMACENAMIENTO DE CRUDO EN ESPECIFICACIÓN TK-762002A/B')
    const b = sectionCode('TANQUES DE ALMACENAMIENTO DE CRUDO EN ESPECIFICACIÓN TK-762002A/B Y TANQUE DE ALMACENAMIENTO DE CRUDO FUERA DE ESPECIFICACIÓN TK-762003')
    expect(a).not.toBe(b)
    expect(a.length).toBeLessThanOrEqual(40)
    expect(b.length).toBeLessThanOrEqual(40)
  })
  it('el mismo subsistema en dos sistemas no choca; el código lleva el sistema', () => {
    expect(subsystemCode('TANQUES DE LAVADO TK-762501/02', 'SISTEMA DE CRUDO')).toBe('CRUDO-TANQUES-LAVADO-TK-762501-02')
    expect(subsystemCode('TANQUES DE LAVADO TK-762501/02', 'SISTEMA F&G')).toBe('F-G-TANQUES-LAVADO-TK-762501-02')
    expect(subsystemCode('SISTEMA DE TEA', 'SISTEMA DE TEA')).toBe('SISTEMA-TEA')
    expect(subsystemCode('CUARTO DE CONTROL', null)).toBe('CUARTO-CONTROL')
  })
})
