import { describe, expect, it } from 'vitest'
import { detectHeaderRow } from './detect-header'
import { SIGNAL_COLS } from './signal-columns'

describe('SIGNAL_COLS', () => {
  it('asigna lazo y cadena sin robar columnas vecinas', () => {
    const headers = ['TAG DE SEÑAL', 'TAG INSTRUMENTO', 'TIPO DE SEÑAL', 'DISCIPLINA', 'DIAGRAMA DE LAZO', 'LAZO', 'JB', 'MARSHALLING', 'TARJETA I/O', 'CANAL', 'TAG DCS', 'HMI']
    const { colIndex } = detectHeaderRow([headers], SIGNAL_COLS)
    expect(colIndex).toMatchObject({
      signal_tag: 0, instrument_tag: 1, signal_type: 2, discipline: 3, loop_diagram: 4, loop_number: 5,
      junction_box: 6, marshalling: 7, io_card: 8, io_channel: 9, dcs_tag: 10, hmi_display: 11,
    })
  })

  it('reconoce los encabezados en inglés', () => {
    const headers = ['SIGNAL TAG', 'SIGNAL TYPE', 'LOOP DIAGRAM', 'LOOP NUMBER', 'JUNCTION BOX', 'I/O CARD', 'I/O CHANNEL', 'DCS TAG', 'HMI DISPLAY']
    const { colIndex } = detectHeaderRow([headers], SIGNAL_COLS)
    expect(colIndex).toMatchObject({ signal_tag: 0, signal_type: 1, loop_diagram: 2, loop_number: 3, junction_box: 4, io_card: 5, io_channel: 6, dcs_tag: 7, hmi_display: 8 })
  })
})
