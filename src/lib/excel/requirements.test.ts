import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildRequirementsWorkbook, reportRows, type RequirementsExport, type RequirementsXlsLabels } from './requirements'

const L: RequirementsXlsLabels = {
  sheet: { report: 'Reporte gerencial', summary: 'Resumen', detail: 'Detalle' },
  title: 'Requisitos ITR',
  info: { project: 'Proyecto', node: 'Alcance', date: 'Fecha', tags: 'Tags', noType: 'Sin tipo', noRule: 'Sin regla', proposed: 'Por revisar', truncated: 'Detalle truncado' },
  col: {
    area: 'Área', system: 'Sistema', systemName: 'Nombre', subsystem: 'Subsistema', subsystemName: 'Nombre', discipline: 'Disciplina', disciplineName: 'Nombre',
    stage: 'Etapa', stageName: 'Nombre', required: 'Req', generated: 'Gen', inProgress: 'Ejec', approved: 'Apr', pct: '%',
    missing: 'Faltan', pending: 'Pend', excluded: 'Excl', outside: 'Fuera',
    element: 'Elemento', description: 'Desc', type: 'Tipo', code: 'Código', clientCode: 'Cliente', template: 'Plantilla', state: 'Estado', origin: 'Origen', itr: 'ITR', reason: 'Motivo',
  },
  total: 'Total',
  state: s => `S:${s}`,
  origin: o => `O:${o}`,
}

const disc = (code: string, required: number, approved: number) =>
  ({ code, name: code, required, generated: approved, in_progress: 0, approved, missing: required - approved, excluded: 1, outside: 0 })

const data: RequirementsExport = {
  tags: 3, tags_no_type: 1, tags_no_rule: 0, proposed_rules: 2,
  by_discipline: [disc('ELEC', 4, 1), disc('INST', 6, 6)],
  by_stage: [['S01', 'Sistema 1', 'S01-1', 'Sub 1', 'ELEC', 'A', 'Mecánica', 4, 1, 0, 1, 3]],
  detail_total: 2,
  detail: [
    ['A1', 'S01', 'S01-1', 'TX-1', '=HYPERLINK("x")', 'TX', 'ELEC', 'A', 'E13A', 'ECP-F-1', 'Megger', 'approved', 'matrix', 'ITR-1', null],
    ['A1', 'S01', 'S01-1', 'TX-2', null, null, null, null, null, null, null, 'no_type', null, null, null],
  ],
}

describe('reportRows', () => {
  it('suma el total y calcula % aprobado y pendientes', () => {
    const rows = reportRows(data.by_discipline, 'Total')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual(['ELEC', 'ELEC', 4, 1, 0, 1, 25, 3, 3, 1, 0])
    expect(rows[2]).toEqual(['Total', '', 10, 7, 0, 7, 70, 3, 3, 2, 0])
  })
  it('0 requeridos = 0 %', () => {
    expect(reportRows([disc('X', 0, 0)], 'T')[0][6]).toBe(0)
  })
})

describe('buildRequirementsWorkbook', () => {
  const wb = XLSX.read(buildRequirementsWorkbook(data, { project: 'P1 — Planta', node: 'Todo', date: '2026-10-22' }, L), { type: 'array' })
  const aoa = (n: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: null })

  it('tiene las tres hojas en orden', () => {
    expect(wb.SheetNames).toEqual(['Reporte gerencial', 'Resumen', 'Detalle'])
  })
  it('el detalle traduce estado y origen y deja el texto intacto', () => {
    const rows = aoa('Detalle')
    expect(rows[0][9]).toBe('Cliente')
    expect(rows[1][11]).toBe('S:approved')
    expect(rows[1][12]).toBe('O:matrix')
    expect(rows[1][4]).toBe('=HYPERLINK("x")')
    expect(wb.Sheets.Detalle.E2.f).toBeUndefined()
    expect(rows[2][11]).toBe('S:no_type')
  })
  it('el resumen agrega el % aprobado', () => {
    expect(aoa('Resumen')[1]).toEqual(['S01', 'Sistema 1', 'S01-1', 'Sub 1', 'ELEC', 'A', 'Mecánica', 4, 1, 0, 1, 25, 3])
  })
  it('avisa cuando el detalle viene truncado', () => {
    const t = XLSX.read(buildRequirementsWorkbook({ ...data, detail_total: 50 }, { project: 'P', node: 'N', date: 'D' }, L), { type: 'array' })
    const flat = XLSX.utils.sheet_to_json<unknown[]>(t.Sheets['Reporte gerencial'], { header: 1 }).flat()
    expect(flat).toContain('2 / 50')
    expect(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Reporte gerencial'], { header: 1 }).flat()).not.toContain('Detalle truncado')
  })
})
