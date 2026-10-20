import * as XLSX from 'xlsx'
import { xlsxCell } from './sanitize'

// Export de la gestión diaria (fase 5): un libro con una hoja por registro (acciones, restricciones,
// TQ, decisiones). Encabezados ya traducidos; cada celda pasa por el guard de fórmulas.

export type DailySheet = { name: string; headers: string[]; rows: (string | number | null)[][] }

export function buildDailyWorkbook(sheets: DailySheet[]): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows.map(r => r.map(c => xlsxCell(c ?? '')))]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = sheet.headers.map((h, i) => ({
      wch: Math.min(60, Math.max(h.length + 2, ...sheet.rows.map(r => String(r[i] ?? '').length + 2), 10)),
    }))
    if (sheet.rows.length > 0) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet.rows.length, c: sheet.headers.length - 1 } }) }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}
