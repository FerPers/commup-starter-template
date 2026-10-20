import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { sanitize, truncateToWidth, wrapText } from './renderer'

describe('renderer: textos con caracteres de control (F-01)', () => {
  it('sanitize deja una sola línea codificable', () => {
    expect(sanitize('a\nb\r\tc')).toBe('a b  c')
    expect(sanitize('“ok” ≥ 3')).toBe('"ok" >= 3')
  })

  it('truncateToWidth y wrapText no lanzan con saltos de línea', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    expect(() => truncateToWidth('línea 1\nlínea 2\tcon tab', font, 9, 80)).not.toThrow()
    expect(wrapText('uno\r\ndos\n\ntres', font, 9, 300)).toEqual(['uno', 'dos', '', 'tres'])
  })
})
