import { describe, expect, it } from 'vitest'
import { parseTagScan, tag360Path, tagQrUrl } from './qr'

describe('QR de tags (S13, F-18/C-31)', () => {
  it('la etiqueta lleva el UUID', () => {
    expect(tagQrUrl('https://commup.app/', 'abc')).toBe('https://commup.app/tag_360/abc')
  })

  it('lee URLs de Tag 360 sin cortar en «/», «.», «#» ni «%»', () => {
    expect(parseTagScan('https://commup.app/tag_360/FT-101%2FA')).toBe('FT-101/A')
    expect(parseTagScan('https://commup.app/tag_360/FT-101.A?x=1')).toBe('FT-101.A')
    expect(parseTagScan('https://commup.app/tag_360/PT-1001#top')).toBe('PT-1001')
    expect(parseTagScan('commup://tag/ESDV-7621001')).toBe('ESDV-7621001')
  })

  it('acepta texto plano de cualquier formato y conserva las mayúsculas', () => {
    expect(parseTagScan('  PT-101 ')).toBe('PT-101')
    expect(parseTagScan('21-PT-1001A')).toBe('21-PT-1001A')
    expect(parseTagScan('pt-101')).toBe('pt-101')
  })

  it('rechaza vacío, saltos de línea y textos demasiado largos', () => {
    expect(parseTagScan('   ')).toBeNull()
    expect(parseTagScan('a\nb')).toBeNull()
    expect(parseTagScan('x'.repeat(121))).toBeNull()
  })

  it('arma la ruta codificada con el último proyecto', () => {
    expect(tag360Path('FT-101/A')).toBe('/tag_360/FT-101%2FA')
    expect(tag360Path('PT-1', 'p1')).toBe('/tag_360/PT-1?p=p1')
  })
})
