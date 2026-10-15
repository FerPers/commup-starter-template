import type { ColumnKeywords } from './detect-header'

// Misma detección de hoja/encabezado que el importador de tags: el encabezado
// puede estar en cualquiera de las primeras 15 filas y la hoja correcta se
// elige por coincidencias. Orden importante: "TAG INSTRUMENTO" se asigna antes
// de que "TAG" (parcial) pueda quedarse con esa columna.
export const SIGNAL_COLS: ColumnKeywords = {
  instrument_tag:  ['TAG INSTRUMENTO', 'INSTRUMENT TAG', 'INSTRUMENTO', 'TAG EQUIPO'],
  // Antes que signal_tag: «TAG» (parcial) no debe quedarse con «TAG DCS».
  dcs_tag:         ['TAG DCS', 'DCS TAG', 'TAG SCD', 'TAG DE CONTROL', 'TAG SISTEMA DE CONTROL'],
  signal_tag:      ['TAG DE SEÑAL', 'TAG SEÑAL', 'SIGNAL TAG', 'TAG'],
  description:     ['DESCRIPCION', 'DESCRIPTION', 'DESC'],
  signal_type:     ['TIPO DE SEÑAL', 'TIPO SEÑAL', 'SIGNAL TYPE', 'I/O TYPE', 'IO TYPE', 'TIPO'],
  discipline:      ['DISCIPLINA', 'DISCIPLINE'],
  service:         ['SERVICIO', 'SERVICE'],
  range_min:       ['INF.', 'INF', 'RANGE MIN', 'RANGO INF', 'LRV'],
  range_max:       ['SUP.', 'SUP', 'RANGE MAX', 'RANGO SUP', 'URV'],
  eng_unit:        ['UNIDAD', 'UNIT', 'ENG UNIT', 'UNITS'],
  alarms:          ['ALARMAS / SET POINT', 'ALARMAS', 'SETPOINT', 'SET POINT'],
  origin:          ['ORIGEN DE LA SEÑAL', 'ORIGEN', 'ORIGIN'],
  destination:     ['DESTINO DE LA SEÑAL', 'DESTINO', 'DESTINATION'],
  pid:             ['P&ID', 'PID', 'PLANO P&ID'],
  loop_diagram:    ['DIAGRAMA DE LAZO', 'LOOP DIAGRAM'],
  wiring_diagram:  ['DIAGRAMA DE CABLEADO', 'WIRING DIAGRAM'],
  // Fase 4-D: lazo y cadena del loop check. Después de los diagramas: «LAZO» no debe quedarse con «DIAGRAMA DE LAZO».
  loop_number:     ['N° LAZO', 'NUMERO DE LAZO', 'LOOP NUMBER', 'LOOP NO', 'LAZO', 'LOOP'],
  junction_box:    ['CAJA DE CONEXION', 'JUNCTION BOX', 'CAJA', 'JB'],
  marshalling:     ['GABINETE MARSHALLING', 'MARSHALLING', 'MARSH'],
  io_card:         ['TARJETA I/O', 'I/O CARD', 'IO CARD', 'TARJETA', 'MODULO', 'MODULE', 'SLOT'],
  io_channel:      ['CANAL I/O', 'I/O CHANNEL', 'CANAL', 'CHANNEL'],
  hmi_display:     ['DESPLIEGUE HMI', 'PANTALLA HMI', 'HMI DISPLAY', 'HMI', 'GRAFICO'],
  notes:           ['NOTAS', 'NOTES', 'OBSERVACIONES'],
  area_code:       ['AREA CODE', 'AREA', 'SITIO', 'UBICACION', 'LOCATION'],
  area_name:       ['AREA NAME', 'NOMBRE AREA'],
  system_code:     ['SYSTEM CODE', 'SISTEMA', 'SYSTEM'],
  system_name:     ['SYSTEM NAME', 'NOMBRE SISTEMA'],
  subsystem_code:  ['SUBSYSTEM CODE', 'SUBSISTEMA', 'SUBSYSTEM'],
  subsystem_name:  ['SUBSYSTEM NAME', 'NOMBRE SUBSISTEMA'],
}
