import { describe, expect, it } from 'vitest'
import { looksLikeTag } from './tag-shape'
import { sectionCode, sectionsByRow } from './sections'

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
