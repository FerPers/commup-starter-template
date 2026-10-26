import type { TagRow } from '@/app/actions/import'
import { cellText, type ColumnKeywords } from '@/lib/excel/detect-header'
import { looksLikeTag } from '@/lib/import/tag-shape'
import { sectionCode, sectionsByRow } from '@/lib/import/sections'
import { parseCriticality, parseSilLevel } from '@/lib/tags/criticality'

// Lectura del índice de tags / instrumentos (asistente /projects/[id]/import). Pura: la prueban
// tag-parse.test.ts y las listas reales (Akacías A2.2, 2026-10-26).

// ── Column keyword mapping ──────────────────────────────────────
// Orden importante: cada columna se asigna una sola vez (exacta primero,
// parcial después), así "AREA_CODE" no se la queda "AREA_NAME" y viceversa.
export const TAG_COLUMNS: ColumnKeywords = {
  tag:              ['TAG', 'ETIQUETA', 'TAG NUMBER', 'TAGNO', 'INSTRUMENT TAG'],
  description:      ['DESCRIPCION', 'DESCRIPCIÓN', 'DESCRIPTION', 'EQUIPO', 'NOMBRE', 'EQUIPMENT'],
  discipline:       ['DISCIPLINE', 'DISCIPLINA'],
  area_code:        ['AREA_CODE', 'AREA', 'ÁREA', 'SE / SITIO', 'SITIO', 'UBICACION', 'LOCATION'],
  area_name:        ['AREA_NAME', 'NOMBRE ÁREA', 'NOMBRE AREA'],
  system_code:      ['SYSTEM_CODE', 'SISTEMA', 'SYSTEM', 'SYS'],
  subsystem_code:   ['SUBSYSTEM_CODE', 'SUBSISTEMA', 'SUBSYSTEM'],
  manufacturer:     ['MANUFACTURER', 'FABRICANTE', 'MARCA', 'MARCA / MODELO', 'VENDOR'],
  model:            ['MODEL', 'MODELO'],
  serial:           ['SERIAL', 'SERIE', 'S/N', 'SERIAL_NUMBER'],
  preservation:     ['PRESERVATION', 'PRESERVACION', 'PRESERVACIÓN'],
  pid_drawing:      ['P&ID', 'PID', 'P_ID', 'PLANO P&ID', 'P&ID REF', 'P&ID DRAWING'],
  datasheet:        ['DATASHEET', 'DATA SHEET', 'DS NUMBER', 'DATASHEET NUMBER', 'NUMERO DATASHEET'],
  // Datos maestros que autollenan los ITR (fabricante/modelo/serie arriba): revisión de hoja de datos, rango y unidad, caja de conexiones.
  datasheet_rev:    ['DATASHEET REV', 'DS REV', 'REV DATASHEET', 'REVISION', 'REVISIÓN', 'REV'],
  // «RANGO» › «Inf. | Sup. | Unidad» en dos filas (listas de instrumentos tipo Ecopetrol): exactas, para que «INF»
  // no se quede con «INFORMACIÓN» ni «SUP» con «SUPLIDOR».
  range_min:        ['RANGE MIN', 'RANGO MIN', 'RANGO INFERIOR', 'LRV', 'MIN RANGE', 'RANGO_MIN', '=INF.', '=INF', '=MIN', '=MÍN'],
  range_max:        ['RANGE MAX', 'RANGO MAX', 'RANGO SUPERIOR', 'URV', 'MAX RANGE', 'RANGO_MAX', '=SUP.', '=SUP', '=MAX', '=MÁX'],
  eng_unit:         ['ENG UNIT', 'UNIDAD ING', 'UNIDAD', 'UNIT', 'UNITS', 'ENG_UNIT'],
  junction_box:     ['JUNCTION BOX', 'CAJA DE CONEXIONES', 'CAJA CONEXIONES', 'JB'],
  fluid_type:       ['FLUID TYPE', 'TIPO DE FLUIDO', 'TIPO FLUIDO', 'FLUIDO', 'FLUID'],
  mounting_typical: ['MOUNTING TYPICAL', 'TYPICAL', 'TIPICO DE MONTAJE', 'TIPICO MONTAJE', 'TÍPICO', 'TIPICO'],
  criticality:      ['CRITICALITY', 'CRITICIDAD', 'CRITICO', 'CRÍTICO'],
  sil:              ['SIL', 'SIL LEVEL', 'NIVEL SIL', 'SIL_LEVEL'],
  // «TIPO» solo exacto: en parcial se quedaba con «TIPO SEÑAL» (24 VDC, 4-20 mA) y el tipo por prefijo no corría.
  equipment_type:   ['EQUIPMENT TYPE', 'TIPO DE EQUIPO', 'TIPO EQUIPO', 'EQUIPMENT_TYPE', '=TIPO'],
}
/** «0», «100», «-20,5» → número; vacío o no numérico → undefined (no se toca el valor existente). */
function numberOrUndefined(val: string): number | undefined {
  if (!val.trim()) return undefined
  const n = Number(val.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function parseTagRows(
  rawRows: unknown[][],
  colIndex: Record<string, number>,
  dataStart: number,
  disciplinePrefill: string,
): TagRow[] {
  const result: TagRow[] = []
  // Sin columnas de sistema ni subsistema: salen de los títulos de sección de la lista (src/lib/import/sections.ts).
  const sections = usesSectionTitles(colIndex)
    ? sectionsByRow(rawRows, dataStart, row => looksLikeTag(cellText(row, colIndex.tag)))
    : null
  for (let i = dataStart; i < rawRows.length; i++) {
    const row = rawRows[i]
    const get = (field: string) => cellText(row, colIndex[field])
    const tagNumber = get('tag')
    if (!tagNumber || !looksLikeTag(tagNumber)) continue
    const disciplineCode = (disciplinePrefill || get('discipline')).toUpperCase()
    const section = sections?.get(i)
    result.push({
      tag_number:           tagNumber,
      description:          get('description'),
      discipline_code:      disciplineCode,
      area_code:            get('area_code')      || 'GENERAL',
      area_name:            get('area_name')      || 'General',
      system_code:          get('system_code')    || (section?.system ? sectionCode(section.system) : 'GEN-SYS'),
      system_name:          get('system_code')    || (section?.system ?? 'General System'),
      subsystem_code:       get('subsystem_code') || (section ? sectionCode(section.subsystem) : 'GEN-SUB'),
      subsystem_name:       get('subsystem_code') || (section?.subsystem ?? 'General Subsystem'),
      manufacturer:         get('manufacturer')       || undefined,
      model:                get('model')              || undefined,
      serial_number:        get('serial')             || undefined,
      preservation_required: ['YES', 'SI', 'SÍ'].includes(get('preservation').toUpperCase()),
      pid_drawing:          get('pid_drawing')        || undefined,
      datasheet_number:     get('datasheet')          || undefined,
      revision:             get('datasheet_rev')      || undefined,
      range_min:            numberOrUndefined(get('range_min')),
      range_max:            numberOrUndefined(get('range_max')),
      eng_unit:             get('eng_unit')           || undefined,
      junction_box:         get('junction_box')       || undefined,
      fluid_type:           get('fluid_type')         || undefined,
      mounting_typical:     get('mounting_typical')   || undefined,
      equipment_type_code:  get('equipment_type')     || undefined,
      criticality:          parseCriticality(get('criticality')),
      sil_level:            parseSilLevel(get('sil')),
    })
  }
  return result
}

/** El archivo no trae columnas de sistema ni de subsistema: se usan los títulos de sección. */
export function usesSectionTitles(colIndex: Record<string, number>): boolean {
  return colIndex.system_code === undefined && colIndex.subsystem_code === undefined
}
