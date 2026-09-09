import { expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { Renderer } from './renderer'
import { renderItrPdf, type ItrPdfData } from './itr'

it('preserves the end of long responses and paginates oversized rows', async () => {
  const draw = vi.spyOn(Renderer.prototype, 'drawText')
  const data = {
    itr_number: 'QA', status: 'completed', progress_pct: 100, scheduled_date: null,
    tags: null, projects: null, itr_signatures: [],
    itr_templates: { code: 'QA', title: 'Prueba', description: null, itr_template_sections: [{
      id: 'section', title: 'Datos', order_index: 0, itr_template_items: [{
        id: 'item', item_number: '1', description: 'Respuesta extensa', item_type: 'text',
        is_critical: false, acceptance_min: null, acceptance_max: null, acceptance_text: null, unit: null, order_index: 0,
      }],
    }] },
    itr_responses: [{ item_id: 'item', value_text: 'Contenido completo '.repeat(350) + 'FINVERIFICADO', value_numeric: null, value_bool: null, value_option: null, remarks: null, is_passed: null }],
  } satisfies ItrPdfData
  try {
    const bytes = await renderItrPdf(data)
    expect(draw.mock.calls.map(([text]) => text).join(' ')).toContain('FINVERIFICADO')
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  } finally { draw.mockRestore() }
})

it('renders continuity conductor rows as a paginated table without JSON or lost remarks', async () => {
  const draw = vi.spyOn(Renderer.prototype, 'drawText')
  const rows = Array.from({length: 80}, (_, i) => ({id: `C${i + 1}`, from: `TB1-${i + 1}`, to: `TB2-${i + 1}`, result: i === 79 ? 'fail' : 'pass', reading: 0.25, unit: 'ohm', remarks: i === 79 ? 'Observación extensa '.repeat(120) + 'FINCONTINUIDAD' : 'Conductor verificado'}))
  const data: ItrPdfData = {
    itr_number: 'QA', status: 'in_progress', progress_pct: 0, scheduled_date: null, tags: null, projects: null, itr_signatures: [],
    itr_templates: {code: 'I01A', title: 'Continuidad', description: null, itr_template_sections: [{id: 's', title: 'Cable', order_index: 0, itr_template_items: [{id: 'i', item_number: '1', description: 'Prueba conductor por conductor', item_type: 'continuity', is_critical: true, acceptance_min: null, acceptance_max: null, acceptance_text: 'Según procedimiento', unit: null, order_index: 0}]}]},
    itr_responses: [{item_id: 'i', value_text: JSON.stringify({version: 1, grouping: 'conductors', count: 80, shields: [], measurementRequired: true, rows}), value_numeric: null, value_bool: null, value_option: null, remarks: 'Observación general', is_passed: false}],
  }
  try {
    const bytes = await renderItrPdf(data)
    const texts = draw.mock.calls.map(([text]) => text)
    expect(texts).toContain('TB1-80')
    expect(texts).toContain('TB2-80')
    expect(texts).toContain('0.25')
    expect(texts).toContain('FAIL')
    expect(texts.join(' ')).toContain('FINCONTINUIDAD')
    expect(texts.join(' ')).not.toContain('"version"')
    expect(texts.filter(t => t === 'Conductor').length).toBeGreaterThan(1)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  } finally {draw.mockRestore()}
})
