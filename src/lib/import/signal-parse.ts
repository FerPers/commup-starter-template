import type * as XLSX from 'xlsx'
import type { SignalRow } from '@/app/actions/import-signals'
import { cellText, detectHeaderRow, sheetToRows } from '@/lib/excel/detect-header'
import { SIGNAL_COLS } from '@/lib/excel/signal-columns'
import { looksLikeTag } from '@/lib/import/tag-shape'
import { sectionCode, sectionsByRow } from '@/lib/import/sections'
import { normalizeSignalType } from '@/lib/signals/types'

// Lectura de la lista de señales (asistente /projects/[id]/import-signals). Pura: la prueba signal-parse.test.ts.

export type SignalParseIssue =
  | { kind: 'badType'; sheet: string; row: number; value: string; tag: string }
  | { kind: 'badDiscipline'; sheet: string; row: number; value: string; tag: string }

export type ParsedSignalWorkbook = {
  rows: SignalRow[]
  issues: SignalParseIssue[]
  /** Columnas presentes en al menos una hoja leída (lo que no viene no se toca al reimportar). */
  columns: string[]
  /** Hojas leídas, con cuántas señales aportó cada una. */
  sheets: { name: string; signals: number }[]
}

function parseNum(val: string): number | null {
  const n = parseFloat(val.replace(',', '.'))
  return isNaN(n) ? null : n
}

/**
 * Lee TODAS las hojas que traen encabezado de lista de señales (tag de señal + tipo): las listas de ingeniería
 * separan DCS, ESD y F&G en hojas del mismo libro y antes solo se leía la «mejor» (LI-001 de Akacías: se leían las
 * 76 señales ESD y se perdían las 686 del DCS). Los títulos de sección y las notas al pie de la columna del tag se
 * saltan en silencio; el tipo se normaliza («AI+ HART» → AI, «Digital Output» → DO, «COMM» → COMM).
 */
export function parseSignalWorkbook(wb: XLSX.WorkBook, disciplineCodes: Set<string>): ParsedSignalWorkbook {
  const out: ParsedSignalWorkbook = { rows: [], issues: [], columns: [], sheets: [] }
  const columns = new Set<string>()

  for (const sheet of wb.SheetNames) {
    const rawRows = sheetToRows(wb.Sheets[sheet])
    if (rawRows.length === 0) continue
    const { headerRowIdx, colIndex } = detectHeaderRow(rawRows, SIGNAL_COLS)
    if (colIndex.signal_tag === undefined || colIndex.signal_type === undefined) continue
    for (const k of Object.keys(colIndex)) columns.add(k)

    // Sin columnas de sistema ni subsistema: los títulos de sección de la hoja (src/lib/import/sections.ts). El
    // servidor solo los usa para ubicar los tags instrumento NUEVOS; los que ya existen no se mueven.
    const sections = colIndex.system_code === undefined && colIndex.subsystem_code === undefined
      ? sectionsByRow(rawRows, headerRowIdx + 1, row => looksLikeTag(cellText(row, colIndex.signal_tag)))
      : null
    let count = 0
    rawRows.slice(headerRowIdx + 1).forEach((row, i) => {
      const rowNum = headerRowIdx + i + 2
      const section = sections?.get(headerRowIdx + 1 + i)
      const get = (field: string) => cellText(row, colIndex[field])

      const signalTag = get('signal_tag')
      // Filas vacías, títulos de sección y notas al pie: no son señales.
      if (!signalTag || !looksLikeTag(signalTag)) return
      const instrRaw = get('instrument_tag')
      const instrTag = instrRaw && looksLikeTag(instrRaw) ? instrRaw : signalTag
      const typeRaw = get('signal_type')
      const signalType = normalizeSignalType(typeRaw)
      const discipline = (get('discipline') || 'INST').toUpperCase()
      if (!signalType) out.issues.push({ kind: 'badType', sheet, row: rowNum, value: typeRaw, tag: signalTag })
      if (!disciplineCodes.has(discipline)) out.issues.push({ kind: 'badDiscipline', sheet, row: rowNum, value: discipline, tag: signalTag })

      const areaCode = get('area_code') || 'GENERAL'
      const sysCode = get('system_code') || (section?.system ? sectionCode(section.system) : 'GEN-SYS')
      const subCode = get('subsystem_code') || (section ? sectionCode(section.subsystem) : 'GEN-SUB')
      out.rows.push({
        signal_tag:      signalTag,
        instrument_tag:  instrTag,
        description:     get('description'),
        // Sin tipo reconocible se manda tal cual: el servidor la rechaza con su motivo.
        signal_type:     signalType ?? typeRaw.toUpperCase(),
        service:         get('service'),
        range_min:       parseNum(get('range_min')),
        range_max:       parseNum(get('range_max')),
        eng_unit:        get('eng_unit'),
        alarm_setpoints: get('alarms'),
        origin:          get('origin'),
        destination:     get('destination'),
        pid_drawing:     get('pid'),
        loop_diagram:    get('loop_diagram'),
        wiring_diagram:  get('wiring_diagram'),
        loop_number:     get('loop_number'),
        junction_box:    get('junction_box'),
        marshalling:     get('marshalling'),
        io_card:         get('io_card'),
        io_channel:      get('io_channel'),
        dcs_tag:         get('dcs_tag'),
        hmi_display:     get('hmi_display'),
        notes:           get('notes'),
        discipline_code: discipline,
        area_code:       areaCode,
        area_name:       get('area_name') || areaCode,
        system_code:     sysCode,
        system_name:     get('system_name') || (section?.system ?? sysCode),
        subsystem_code:  subCode,
        subsystem_name:  get('subsystem_name') || (section?.subsystem ?? subCode),
      })
      count++
    })
    if (count > 0) out.sheets.push({ name: sheet, signals: count })
  }
  out.columns = [...columns]
  return out
}
