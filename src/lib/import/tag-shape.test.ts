import { describe, expect, it } from 'vitest'
import { expandTagCell, looksLikeTag } from './tag-shape'

describe('looksLikeTag', () => {
  it('acepta tags ISA y con un espacio', () => {
    for (const t of ['FT-101', 'ESDV-7621001', 'PSV-7621001A', '12"-DPF-00712-AB2A521-SP', 'P-101 A', 'FT 101', '1-I-B-3-SDY-7621002']) expect(looksLikeTag(t)).toBe(true)
  })
  it('rechaza títulos de sección y notas de las listas de ingeniería', () => {
    for (const t of [
      'SEPARADORES GENERALES 762101A/B', 'CUARTO SATÉLITE 1', 'TANQUES FWKO TK-762101/02', 'NOTAS:', 'HOLD', 'F&G', 'ESD-DCS', 'Tabla',
      '1. Los diagramas de lazo y cableado serán elaborados en la siguiente etapa', '2) Ver plano', 'CAFETERÍA', '', 'A',
    ]) expect(looksLikeTag(t)).toBe(false)
  })
})

describe('expandTagCell', () => {
  it('un tag queda igual', () => {
    expect(expandTagCell('ESDV-7621001')).toEqual(['ESDV-7621001'])
    expect(expandTagCell('FT 101')).toEqual(['FT 101'])
  })
  it('trenes por letra (listas mecánicas de CPF Orotoy)', () => {
    expect(expandTagCell('P-762402 \nA/B/C/D/E/F')).toEqual(['P-762402A', 'P-762402B', 'P-762402C', 'P-762402D', 'P-762402E', 'P-762402F'])
    expect(expandTagCell('P-762401A/B')).toEqual(['P-762401A', 'P-762401B'])
    expect(expandTagCell('F-762002 A/C')).toEqual(['F-762002A', 'F-762002C'])
    expect(expandTagCell('P-762002 A')).toEqual(['P-762002A'])
  })
  it('equipos por número: el sufijo cambia los últimos dígitos', () => {
    expect(expandTagCell('TK-762101 / 02')).toEqual(['TK-762101', 'TK-762102'])
    expect(expandTagCell('BG-762103/ 04')).toEqual(['BG-762103', 'BG-762104'])
    expect(expandTagCell('P-762101/2/3')).toEqual(['P-762101', 'P-762102', 'P-762103'])
  })
  it('tags completos a cada lado de la barra y letra después de guion (ELE-LI-102)', () => {
    expect(expandTagCell('TRF-76029001/TRF-76029002')).toEqual(['TRF-76029001', 'TRF-76029002'])
    expect(expandTagCell('PR02-DB-01A / PR02-DB-01B')).toEqual(['PR02-DB-01A', 'PR02-DB-01B'])
    expect(expandTagCell('PR03-COND-01-A/B')).toEqual(['PR03-COND-01-A', 'PR03-COND-01-B'])
    expect(expandTagCell('KSEC-11501.01/02.01')).toEqual(['KSEC-11501.01/02.01'])
    expect(expandTagCell('CPF-DPS-A/B')).toEqual(['CPF-DPS-A', 'CPF-DPS-B'])
    expect(expandTagCell('TA-AC-URV')).toEqual(['TA-AC-URV'])
  })
  it('paquete y su bomba en la misma celda', () => {
    expect(expandTagCell('PQUIM-762102\nP-762106')).toEqual(['PQUIM-762102', 'P-762106'])
  })
  it('títulos, N/D y HOLD no son tags', () => {
    for (const t of ['SEPARADORES GENERALES 762101A/B', 'TANQUES FWKO TK-762101/02', 'N/D', 'HOLD', 'CUARTO SATÉLITE 1', '']) expect(expandTagCell(t)).toEqual([])
  })
})
