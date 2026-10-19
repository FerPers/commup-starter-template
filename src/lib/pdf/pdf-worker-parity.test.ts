import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// G-24 (2026-10-19): el visor P&ID carga /pdf.worker.min.mjs, copiado a mano en public/. Si se
// actualiza react-pdf (y con él pdfjs-dist) sin volver a copiarlo, el visor falla en runtime con
// «API version does not match Worker version». Este test lo detecta en CI.
// Arreglo: cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

describe('pdf.worker.min.mjs', () => {
  it('public/ coincide con la versión instalada de pdfjs-dist', () => {
    expect(sha('public/pdf.worker.min.mjs')).toBe(sha('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'))
  })
})
