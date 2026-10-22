import * as XLSX from 'xlsx'
import { xlsxCell } from './sanitize'

// R2b (maquetas M): Excel del registro «Requisitos ITR» con las tres vistas de la matriz de certificación que el
// cliente ya reconoce: reporte gerencial por disciplina · resumen sistema × subsistema × disciplina × etapa ·
// detalle por elemento. Los datos los arma la BD (tag_requirements_export); aquí solo totales, % y el libro.

export type ExportDiscipline = {
  code: string | null
  name: string | null
  required: number
  generated: number
  in_progress: number
  approved: number
  missing: number
  excluded: number
  outside: number
}

/** [sistema, nombre, subsistema, nombre, disciplina, etapa, nombre etapa, requeridos, generados, en ejecución, aprobados, faltan] */
export type ExportStageRow = [string | null, string | null, string | null, string | null, string | null, string | null, string | null, number, number, number, number, number]

/** [área, sistema, subsistema, tag, descripción, tipo, disciplina, etapa, código, código cliente, plantilla, estado, origen, ITR, motivo] */
export type ExportDetailRow = (string | null)[]

export type RequirementsExport = {
  tags: number
  tags_no_type: number
  tags_no_rule: number
  proposed_rules: number
  by_discipline: ExportDiscipline[]
  by_stage: ExportStageRow[]
  detail_total: number
  detail: ExportDetailRow[]
}

export const REQ_EXPORT_DETAIL_LIMIT = 20000

export type RequirementsXlsLabels = {
  sheet: { report: string; summary: string; detail: string }
  title: string
  info: { project: string; node: string; date: string; tags: string; noType: string; noRule: string; proposed: string; truncated: string }
  col: {
    area: string; system: string; systemName: string; subsystem: string; subsystemName: string; discipline: string; disciplineName: string
    stage: string; stageName: string; required: string; generated: string; inProgress: string; approved: string; pct: string
    missing: string; pending: string; excluded: string; outside: string
    element: string; description: string; type: string; code: string; clientCode: string; template: string; state: string; origin: string; itr: string; reason: string
  }
  total: string
  state: (s: string) => string
  origin: (o: string) => string
}

const pct = (approved: number, required: number) => (required > 0 ? Math.round((approved / required) * 1000) / 10 : 0)

/** Filas del reporte gerencial (una por disciplina + total). Exportada para el test. */
export function reportRows(byDiscipline: ExportDiscipline[], totalLabel: string): (string | number)[][] {
  const row = (code: string, name: string, d: Omit<ExportDiscipline, 'code' | 'name'>) => [
    code, name, d.required, d.generated, d.in_progress, d.approved, pct(d.approved, d.required), d.missing, d.required - d.approved, d.excluded, d.outside,
  ]
  const sum = byDiscipline.reduce(
    (a, d) => ({
      required: a.required + d.required, generated: a.generated + d.generated, in_progress: a.in_progress + d.in_progress,
      approved: a.approved + d.approved, missing: a.missing + d.missing, excluded: a.excluded + d.excluded, outside: a.outside + d.outside,
    }),
    { required: 0, generated: 0, in_progress: 0, approved: 0, missing: 0, excluded: 0, outside: 0 },
  )
  return [...byDiscipline.map(d => row(d.code ?? '—', d.name ?? '', d)), row(totalLabel, '', sum)]
}

function widths(rows: unknown[][], min = 8): XLSX.ColInfo[] {
  const n = Math.max(0, ...rows.map(r => r.length))
  return Array.from({ length: n }, (_, i) => ({
    wch: Math.min(50, Math.max(min, ...rows.slice(0, 2000).map(r => String(r[i] ?? '').length + 2))),
  }))
}

function tableSheet(headers: string[], rows: unknown[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows.map(r => r.map(c => xlsxCell(c ?? '')))])
  ws['!cols'] = widths([headers, ...rows])
  if (rows.length > 0) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) }
  return ws
}

export function buildRequirementsWorkbook(
  data: RequirementsExport,
  ctx: { project: string; node: string; date: string },
  L: RequirementsXlsLabels,
): Uint8Array {
  const c = L.col
  const wb = XLSX.utils.book_new()

  // 1 · Reporte gerencial: ficha del alcance arriba y la tabla por disciplina con total.
  const info: (string | number)[][] = [
    [L.title],
    [L.info.project, ctx.project],
    [L.info.node, ctx.node],
    [L.info.date, ctx.date],
    [L.info.tags, data.tags],
    [L.info.noType, data.tags_no_type],
    [L.info.noRule, data.tags_no_rule],
    [L.info.proposed, data.proposed_rules],
  ]
  if (data.detail_total > data.detail.length) info.push([L.info.truncated, `${data.detail.length} / ${data.detail_total}`])
  const head = [c.discipline, c.disciplineName, c.required, c.generated, c.inProgress, c.approved, c.pct, c.missing, c.pending, c.excluded, c.outside]
  const report = [...info, [], head, ...reportRows(data.by_discipline, L.total)]
  const ws1 = XLSX.utils.aoa_to_sheet(report.map(r => r.map(x => xlsxCell(x))))
  ws1['!cols'] = widths([head, ...report.slice(info.length + 1)], 12)
  XLSX.utils.book_append_sheet(wb, ws1, L.sheet.report.slice(0, 31))

  // 2 · Resumen sistema × subsistema × disciplina × etapa (formato largo, con filtros).
  const summary = data.by_stage.map(([sys, sysName, sub, subName, disc, stage, stageName, req, gen, prog, appr, miss]) =>
    [sys, sysName, sub, subName, disc, stage, stageName, req, gen, prog, appr, pct(appr, req), miss])
  XLSX.utils.book_append_sheet(wb, tableSheet(
    [c.system, c.systemName, c.subsystem, c.subsystemName, c.discipline, c.stage, c.stageName, c.required, c.generated, c.inProgress, c.approved, c.pct, c.missing],
    summary,
  ), L.sheet.summary.slice(0, 31))

  // 3 · Detalle por elemento: una fila por requisito (y una por tag sin tipo o sin regla).
  const detail = data.detail.map(r => r.map((v, i) => (i === 11 && v ? L.state(v) : i === 12 && v ? L.origin(v) : v)))
  XLSX.utils.book_append_sheet(wb, tableSheet(
    [c.area, c.system, c.subsystem, c.element, c.description, c.type, c.discipline, c.stage, c.code, c.clientCode, c.template, c.state, c.origin, c.itr, c.reason],
    detail,
  ), L.sheet.detail.slice(0, 31))

  // compression: con 20.000 filas de detalle el libro sin comprimir pasa de 10 MB.
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as Uint8Array
}
