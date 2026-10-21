import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { renderEventPdf, renderLineupPdf, renderRunPdf, type EventPdfInput, type LineupPdfInput, type RunPdfInput } from './startup-records'

const common = { lang: 'es' as const, timezone: 'America/Bogota', orgName: 'DEMO', projectCode: 'DEMO-GLP', label: (k: string) => k, printedAt: '2026-10-21T15:00:00Z' }
const longText = 'Abrir lentamente la válvula de succión XV-101 verificando presión diferencial → menos de 0,5 bar en todo momento. '.repeat(4)

const run: RunPdfInput = {
  ...common, number: 'PRC-0001/E1', status: 'stopped',
  procedure: { number: 'PRC-0001', title: 'Arranque del compresor C-103', rev: 1, hash: 'c'.repeat(64) },
  system: 'A100-S02 — Compresión', safety: 'Permiso de trabajo vigente.', stopCriteria: 'Vibración > 7 mm/s',
  startedBy: 'Pedro', startedAt: '2026-10-19T10:00:00Z', completedBy: null, completedAt: null,
  stoppedBy: 'Pedro', stoppedAt: '2026-10-19T11:00:00Z', stopReason: 'Trip por vibración', abortedBy: null, abortedAt: null, abortReason: null,
  steps: [
    { ord: 1, action: longText, tag: 'XV-101', responsible: 'Operador', expected: '11–12 barg', stop: 'Fuga visible', hold: false, holdCapacity: null, status: 'done', actual: '11,8', comment: 'Fuga menor en brida', doneBy: 'Pedro', doneAt: '2026-10-19T10:05:00Z', releasedBy: null, releasedAt: null },
    { ord: 2, action: 'Arrancar motor', tag: null, responsible: null, expected: null, stop: null, hold: true, holdCapacity: 'commissioning', status: 'released', actual: null, comment: null, doneBy: 'Pedro', doneAt: '2026-10-19T10:30:00Z', releasedBy: 'Ana', releasedAt: '2026-10-19T10:40:00Z' },
    ...Array.from({ length: 40 }, (_, i) => ({ ord: i + 3, action: `Paso ${i + 3}`, tag: null, responsible: null, expected: null, stop: null, hold: i % 10 === 0, holdCapacity: 'operations', status: 'pending', actual: null, comment: null, doneBy: null, doneAt: null, releasedBy: null, releasedAt: null })),
  ],
  events: [{ number: 'EVT-0001', occurredAt: '2026-10-19T10:30:00Z', title: 'Primer arranque', label: 'milestone.first_startup' }],
}

const lineup: LineupPdfInput = {
  ...common, number: 'LU-0001', title: 'Succión', status: 'in_progress', purpose: 'startup', system: 'A100-S02', procedure: 'PRC-0001 — Arranque',
  issuedBy: 'Ana', issuedAt: '2026-10-19T08:00:00Z', verifiedBy: null, verifiedAt: null, hash: null, stale: false,
  items: [
    { ord: 1, tag: 'XV-101', description: 'Válvula de succión', label: 'Válvula', required: 'open', requiredNote: 'LO candado', critical: true, found: 'closed', remarks: 'Encontrada cerrada', setBy: 'Juan', setAt: '2026-10-19T08:10:00Z', verifiedBy: null, verifiedAt: null },
    { ord: 2, tag: null, description: null, label: 'Drenaje', required: null, requiredNote: null, critical: false, found: null, remarks: null, setBy: null, setAt: null, verifiedBy: null, verifiedAt: null },
  ],
}

const event: EventPdfInput = {
  ...common, number: 'EVT-0001', kind: 'milestone', milestone: 'first_startup', category: null, status: 'pending_witness', title: 'Primer arranque',
  description: 'Arranque sin novedades.', occurredAt: '2026-10-19T10:30:00Z', system: 'A100-S02', run: 'PRC-0001/E1', tags: ['C-103'],
  recordedBy: 'Pedro', recordedAt: '2026-10-19T10:31:00Z', witnessCapacity: 'operations', witnessBy: null, witnessAt: null,
  voidedBy: null, voidedAt: null, voidReason: null,
  params: [{ label: 'PT-101', value: 11.8, valueText: null, unit: 'barg', quality: 0, sampledAt: '2026-10-19T10:30:12Z', offsetS: 12, source: 'iiot' }],
}

describe('registros imprimibles de arranque (S24b, E-22)', () => {
  it('ejecución: pasos largos y pendientes en blanco paginan sin romperse', async () => {
    const doc = await PDFDocument.load(await renderRunPdf(run))
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(doc.getTitle()).toContain('PRC-0001/E1')
  })

  it('line-up: posición sin requerida ni encontrada', async () => {
    const doc = await PDFDocument.load(await renderLineupPdf(lineup))
    expect(doc.getPageCount()).toBe(1)
  })

  it('evento con testigo pendiente y en inglés anulado', async () => {
    expect((await PDFDocument.load(await renderEventPdf(event))).getPageCount()).toBe(1)
    const voided = await renderEventPdf({ ...event, lang: 'en', status: 'voided', voidedBy: 'Ana', voidedAt: '2026-10-19T12:00:00Z', voidReason: 'Duplicado', params: [] })
    expect((await PDFDocument.load(voided)).getPageCount()).toBe(1)
  })
})
