import { describe, expect, it } from 'vitest'
import { looksLikeTag } from './tag-shape'

describe('looksLikeTag', () => {
  it('acepta tags ISA y con un espacio', () => {
    for (const t of ['FT-101', 'ESDV-7621001', 'PSV-7621001A', '12"-DPF-00712-AB2A521-SP', 'P-101 A', 'FT 101', '1-I-B-3-SDY-7621002']) expect(looksLikeTag(t)).toBe(true)
  })
  it('rechaza títulos de sección y notas de las listas de ingeniería', () => {
    for (const t of [
      'SEPARADORES GENERALES 762101A/B', 'CUARTO SATÉLITE 1', 'TANQUES FWKO TK-762101/02', 'NOTAS:',
      '1. Los diagramas de lazo y cableado serán elaborados en la siguiente etapa', '2) Ver plano', 'CAFETERÍA', '', 'A',
    ]) expect(looksLikeTag(t)).toBe(false)
  })
})
