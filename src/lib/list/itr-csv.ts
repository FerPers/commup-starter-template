import { toSafeCsv } from '@/lib/excel/sanitize'
import type { ItrListRow } from './itr-types'

/**
 * CSV de la lista de ITR (N2c: el mismo en «Este proyecto» y en «Todos los proyectos»). `label` traduce las claves
 * `ItrList.exportHeaders.*`; `status` da la etiqueta del estado del contrato A08 (`itrRowState`), no el código. Con guarda contra inyección de fórmulas (toSafeCsv) y BOM para Excel.
 */
export function buildItrCsv(rows: readonly ItrListRow[], label: (key: string) => string, status: (row: ItrListRow) => string): string {
  const headers = ['project', 'itr', 'tag', 'tagDesc', 'template', 'phase', 'discipline', 'inspector', 'scheduledDate', 'progress', 'status', 'signE', 'signS', 'signC']
    .map(k => label(`exportHeaders.${k}`))
  const body = rows.map(itr => {
    const executor = itr.assignments.find(a => a.role === 'executor')
    return [
      itr.project_code ?? '', itr.itr_number, itr.tag_number ?? '', itr.tag_description ?? '', itr.template_title ?? '',
      itr.phase_code ?? '', itr.discipline_code ?? '', executor?.full_name ?? '', itr.scheduled_date ?? '',
      String(itr.progress_pct), status(itr),
      itr.signatures.some(s => s.role === 'executor') ? 'S' : 'N',
      itr.signatures.some(s => s.role === 'supervisor') ? 'S' : 'N',
      itr.signatures.some(s => s.role === 'client') ? 'S' : 'N',
    ]
  })
  return '﻿' + toSafeCsv([headers, ...body])
}

/** Descarga un CSV en el navegador. */
export function downloadCsv(csv: string, fileName: string): void {
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = href
  a.download = fileName
  a.click()
  URL.revokeObjectURL(href)
}
