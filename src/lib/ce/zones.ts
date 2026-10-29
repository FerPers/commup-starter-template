import { looksLikeTag } from '@/lib/import/tag-shape'

// Lectura por zonas de una matriz C&E grande (decisión de Luis, 2026-10-29): la matriz F&G de CPF Orotoy (GG-008) es
// una sola hoja con 25 zonas y 1.828 cruces, más de lo que la IA devuelve en una lectura. Las zonas son filas de
// título («ENTRADA SISTEMA DE ESPUMA») con sus causas debajo; cada zona se lee aparte (encabezado + sus filas, solo
// las columnas que esa zona usa) y queda como una matriz propia. Puro: lo prueba zones.test.ts.

/** `rows` = encabezado + filas de la zona con solo sus columnas (para leer sin IA, sheet-reader.ts); `csv` = lo mismo para la IA. */
export type CeZone = { title: string; csv: string; rows: string[][]; causeRows: number }

const text = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** Título de zona: texto en mayúsculas en la primera columna, que no es tag, con el resto de la fila descriptiva vacía. */
function zoneTitle(row: string[]): string | null {
  const first = row[0] ?? ''
  if (first.length < 3 || first.length > 120 || looksLikeTag(first)) return null
  if (row.slice(1, 7).some(Boolean)) return null
  if (/^\d+\s*[.)-]/.test(first) || /^NOTAS?\b/i.test(first)) return null
  const letters = first.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
  if (letters.length < 3) return null
  return letters.replace(/[^a-záéíóúüñ]/g, '').length / letters.length <= 0.2 ? first : null
}

const MARK = /^[Xx•●✓]$/

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * Zonas de la hoja (filas tal como salen de sheet_to_json con header: 1). Menos de dos zonas = [] (se lee entera).
 * Las filas antes de la primera zona son el encabezado (efectos, tags, acciones) y van en cada zona; las notas al pie
 * («NOTAS») cierran la última.
 */
export function splitSheetByZones(raw: unknown[][]): CeZone[] {
  const rows = raw.map(r => (r ?? []).map(text))
  const starts: number[] = []
  let end = rows.length
  for (let i = 0; i < rows.length; i++) {
    if (/^NOTAS?\b/i.test(rows[i][0] ?? '') && starts.length) { end = i; break }
    // Una zona va seguida de causas con cruces: así el título del documento («MATRIZ CAUSA-EFECTO F&G») no cuenta.
    const next = rows.slice(i + 1).find(r => r.some(Boolean))
    if (zoneTitle(rows[i]) && next?.some(c => MARK.test(c))) starts.push(i)
  }
  if (starts.length < 2) return []
  const header = rows.slice(0, starts[0]).filter(r => r.some(Boolean))
  return starts.map((start, k) => {
    const body = rows.slice(start, k + 1 < starts.length ? starts[k + 1] : end).filter(r => r.some(Boolean))
    const width = Math.max(...body.map(r => r.length))
    const keep = Array.from({ length: width }, (_, c) => c).filter(c => body.some(r => r[c]))
    const table = [...header, ...body].map(r => keep.map(c => r[c] ?? ''))
    return { title: rows[start][0], csv: table.map(r => r.map(csvCell).join(',')).join('\n'), rows: table, causeRows: body.length - 1 }
  })
}
