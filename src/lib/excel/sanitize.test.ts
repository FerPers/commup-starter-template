import { describe, expect, it } from 'vitest'
import { sanitizeAoa, sanitizeCell, sanitizeRow, toSafeCsv, xlsxCell } from './sanitize'

describe('guard anti fórmulas (F-09 / A-29)', () => {
  it('neutraliza celdas que Excel evaluaría', () => {
    for (const bad of ['=1+1', '+1', '-1+2', '@SUM(A1)', '\t=1', '\r=1', '  =HYPERLINK("http://x")', '\u00a0=1', '\n=1']) {
      expect(sanitizeCell(bad)).toBe(`'${bad}`)
    }
  })
  it('deja pasar texto normal y no-strings', () => {
    expect(sanitizeCell('PT-101')).toBe('PT-101')
    expect(sanitizeCell('')).toBe('')
    expect(sanitizeCell(42)).toBe(42)
    expect(sanitizeCell(null)).toBe(null)
  })
  it('toSafeCsv: entrecomilla, escapa comillas y aplica el guard', () => {
    expect(toSafeCsv([['a', '=HYPERLINK("x")', 3, null]])).toBe('"a","\'=HYPERLINK(""x"")","3",""')
  })
  it('XLSX (F-32): el texto queda intacto — una cadena nunca se evalúa como fórmula en XLSX', () => {
    expect(sanitizeAoa([['=x', '- Falta perno', 3]])).toEqual([['=x', '- Falta perno', 3]])
    expect(sanitizeRow({ a: '\t=1', b: '+56 9 1234' })).toEqual({ a: '=1', b: '+56 9 1234' })
    expect(xlsxCell(null)).toBe(null)
  })
})
