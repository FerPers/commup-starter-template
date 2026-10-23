import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { renderLoshPdf, type LoshPdfInput } from './losh'
import type { Markup } from '@/lib/pid/markups'
import type { SystemLosh } from '@/lib/pid/losh-server'

/** Plano de prueba: hoja A1 apaisada; la 2.ª página girada 90° (como muchos P&ID escaneados). */
async function drawing(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([2384, 1684])
  doc.addPage([1684, 2384]).setRotation(degrees(90))
  return doc.save()
}

const mk = (over: Partial<Markup>): Markup => ({
  id: 'm', page_num: 1, kind: 'line', system_id: 'S', other_system_id: null, points: [{ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.5 }],
  page_width: 2384, page_height: 1684, page_rotation: 0, label: null, needs_review: false, target_document_id: null, target_page: null, ...over,
})

function losh(markups: Markup[], pages: number[]): SystemLosh {
  return {
    system: { id: 'S', code: 'A100-S01', name: 'Separación — tren 1', color: '#2563eb' },
    sheets: [{ document_id: 'D1', number: 'PID-A100-001', title: 'Separador', revision_id: 'R1', rev: 'B', rev_status: 'ifc', file_path: 'x.pdf', pages, markups, review: markups.filter(m => m.needs_review).length }],
    conflicts: [{ document_id: 'D1', number: 'PID-A100-001', page_num: 1, tag_id: 't', tag_number: 'PT-1001', system_id: 'S', other_system_id: 'T', own: true }],
    unpaired: [{ markup_id: 'c', document_id: 'D1', number: 'PID-A100-001', page_num: 1, target_document_id: 'D2', target_number: 'PID-A100-002', target_page: 1 }],
    codes: { S: 'A100-S01', T: 'A200-S01' },
    pidNumbers: { D1: 'PID-A100-001', D2: 'PID-A100-002' },
  }
}

const base = { projectName: 'Demo GLP', projectCode: 'DEMO-GLP', timezone: 'America/Bogota', branding: null, omitted: [], recordUrl: 'https://commup.app/x' }

describe('PDF LOSH (P4)', () => {
  it('portada + cada página con marcas del sistema, también la girada', async () => {
    const markups = [
      mk({ id: 'l1' }),
      mk({ id: 'b1', kind: 'limit', points: [{ x: 0.6, y: 0.47 }, { x: 0.6, y: 0.53 }], other_system_id: 'T' }),
      mk({ id: 'e1', kind: 'label', points: [{ x: 0.3, y: 0.45 }], label: 'Ñandú «tren» 1' }),
      mk({ id: 'c1', kind: 'connector', points: [{ x: 0.1, y: 0.5 }], target_document_id: 'D2', target_page: 3 }),
      mk({ id: 'l2', page_num: 2, page_width: 2384, page_height: 1684, page_rotation: 90, needs_review: true }),
    ]
    const input: LoshPdfInput = { ...base, losh: losh(markups, [1, 2]), sources: { R1: await drawing() } }
    const bytes = await renderLoshPdf(input)
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(3)
    expect(out.getPage(2).getRotation().angle).toBe(90)
    expect(out.getTitle()).toBe('LOSH A100-S01')
  })

  it('sin PDF original, PDF dañado o página inexistente: solo la portada, sin romperse', async () => {
    const markups = [mk({ id: 'l1', page_num: 5 })]
    expect((await PDFDocument.load(await renderLoshPdf({ ...base, losh: losh(markups, [5]), sources: {} }))).getPageCount()).toBe(1)
    expect((await PDFDocument.load(await renderLoshPdf({ ...base, losh: losh(markups, [5]), sources: { R1: new Uint8Array([1, 2, 3]) } }))).getPageCount()).toBe(1)
    expect((await PDFDocument.load(await renderLoshPdf({ ...base, losh: losh(markups, [5]), sources: { R1: await drawing() } }))).getPageCount()).toBe(1)
  })

  it('sistema sin marcas: portada que lo dice', async () => {
    const empty = { ...losh([], []), sheets: [], conflicts: [], unpaired: [] }
    expect((await PDFDocument.load(await renderLoshPdf({ ...base, losh: empty, sources: {} }))).getPageCount()).toBe(1)
  })
})
