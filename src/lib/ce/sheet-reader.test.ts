import { describe, expect, it } from 'vitest'
import { readCeSheet } from './sheet-reader'

// Forma de GG-007 (CPF Orotoy): acción, descripción y tag de salida en columnas; causas por fila con ítem.
const gg007: unknown[][] = [
  ['INGENIERÍA FEED', '', '', '', '', 'EFECTO', '', 'SEP-762101 A', 'SEP-762101B', 'P-762101A'],
  ['', '', '', '', '', 'ACCIÓN', '', 'cierra', 'cierra', 'Para'],
  ['', '', '', '', '', 'DESCRIPCIÓN', '', 'Válvula Solenoide de LCV-7621007A', 'Válvula Solenoide de LCV-7621008A', 'Bomba de Transferencia'],
  ['Revisión: 3'],
  ['CAUSA', '', '', '', '', 'OUTPUT (TAG NO.)', '', 'SV-7621007B', 'SV-7621008B', 'P-762101A'],
  ['INPUT (TAG NO.)', 'ESTADO', 'VALOR (UNIDAD)', 'DESCRIPCIÓN', 'LÓGICA', '', 'Item'],
  ['ECP-ULL-17004-GDA-IE01-0-PRO-PID-121'],
  ['LIT-7621001', 'LL', "2'-0\"", 'Bajo bajo nivel en el Separador', '', '', '1', 'x', '', ''],
  ['LIT-7621002', 'LL', "2'-0\"", 'Bajo bajo nivel en el Separador', '2oo3', '', '2', '', 'X', 'T20'],
  ['FS-7621001', 'FA', '0 BPD', 'No flujo descarga bomba', '', '', '3', '', '', '20 s'],
  ['NOTAS'],
  ['1. Solo se para la bomba en operación', '', '', '', '', '', '', 'x'],
]

// Forma de GG-008 (F&G): descripción y tags arriba, sin fila de acción; causas con continuación sin tag (GD).
const fg: unknown[][] = [
  ['', '', '', '', 'EFECTO', 'ACTIVACIÓN SOLENOIDE DE DV-7628001', 'ACTIVACIÓN ALARMA SONORA', 'ACTIVACIÓN ALARMA VISUAL'],
  ['MATRIZ CAUSA-EFECTO F&G'],
  ['ECP-ULL-17004-GLC-IE01-0-INS-GG-008', '', '', '', 'TAG', 'DY-7628001', 'AS-762512', 'AV-762512'],
  ['TAG', 'ESTADO', 'DESCRIPCIÓN', 'ALARMA', 'ITEM', '1', '2', '3'],
  ['BOMBAS DESCARGADERO DE NAFTA'],
  ['GD-762519', 'ALARMA', 'PRE ALARMA %LEL', '>20 <40 %LEL', '10', '', 'X', 'X'],
  ['', 'ALARMA', 'ALARMA %LEL', '>40 %LEL', '11', 'X', 'X', 'X'],
  ['', 'FALLA', 'FALLA', '>4, <20 mA', '12', '', '', ''],
]

describe('readCeSheet (sin IA)', () => {
  it('GG-007: efectos con tag de salida, acción y descripción; la fila de equipos no se toma por la de tags', () => {
    const out = readCeSheet(gg007)!
    expect(out.effects.map(e => `${e.code}:${e.tag}:${e.action}`)).toEqual(['E-01:SV-7621007B:close', 'E-02:SV-7621008B:close', 'E-03:P-762101A:stop'])
    expect(out.effects[0].description).toBe('Válvula Solenoide de LCV-7621007A')
    expect(out.revision).toBe('3')
  })
  it('GG-007: causas con ítem, condición, set point y votación; el P&ID de sección y las notas no son causas', () => {
    const out = readCeSheet(gg007)!
    expect(out.causes.map(c => `${c.code}:${c.tag}:${c.condition}:${c.voting ?? '-'}`)).toEqual(['1:LIT-7621001:LL:-', '2:LIT-7621002:LL:2oo3', '3:FS-7621001:FA:-'])
    expect(out.causes[0].setpoint).toBe("2'-0\"")
  })
  it('cruces con «x» y retardos «T20» / «20 s»', () => {
    const out = readCeSheet(gg007)!
    expect(out.links.map(l => `${l.cause_code}×${l.effect_code}${l.delay_s !== null ? `/${l.delay_s}` : ''}`)).toEqual(['1×E-01', '2×E-02', '2×E-03/20', '3×E-03/20'])
  })
  it('F&G: sin fila de acción (se deduce de la descripción) y filas de continuación con el tag de arriba', () => {
    const out = readCeSheet(fg)!
    expect(out.effects.map(e => `${e.tag}:${e.action}`)).toEqual(['DY-7628001:other', 'AS-762512:alarm', 'AV-762512:alarm'])
    expect(out.causes.map(c => `${c.code}:${c.tag}:${c.condition}:${c.setpoint}`)).toEqual(['10:GD-762519:ALARMA:>20 <40 %LEL', '11:GD-762519:ALARMA:>40 %LEL'])
    expect(out.links).toHaveLength(5)
  })
  it('una hoja sin estructura de matriz devuelve null (se usa la IA)', () => {
    expect(readCeSheet([['Lista de instrumentos'], ['TAG', 'DESCRIPCIÓN'], ['PIT-1001', 'Transmisor']])).toBeNull()
  })
})
