import { describe, expect, it } from 'vitest'
import { advisoryDeviation, calibrationAdvisories, type AdvisoryAnswer, type AdvisoryItem } from './calibration-advisory'

// A37: avisos sin bloqueo para la calibración de I10A v3. La tolerancia y la base las escribe el inspector (2.07 / 2.08),
// el span sale del rango de salida que él mismo registra (2.02 / 2.03).
const advisory = {
  expected: 'expected', observed: 'observed', error: 'error', result: 'result',
  tolerance_item: '2.07', base_item: '2.08', span_items: ['2.02', '2.03'],
  base_modes: { '% del span': 'pct_span', 'Absoluta (unidades de salida)': 'abs', '% de la lectura': 'pct_reading' },
  adjust: { item: '6.01', value: 'Sí' },
}
const table = (pass: 'as_found' | 'as_left') => ({ version: 1, rows: { mode: 'variable', min: 1, max: 20, label: 'Punto' }, advisory, columns: [
  { key: 'expected', label: 'Salida esperada', type: 'number' },
  { key: 'observed', label: 'Salida observada', type: 'number' },
  { key: 'error', label: 'Error', type: 'number' },
  { key: 'result', label: 'Resultado', type: 'result', pass },
  { key: 'remarks', label: 'Observación', type: 'text', required: false },
] })
const items: AdvisoryItem[] = [
  { id: 'lo', item_number: '2.02', item_type: 'number', options: null },
  { id: 'hi', item_number: '2.03', item_type: 'number', options: null },
  { id: 'tol', item_number: '2.07', item_type: 'number', options: null },
  { id: 'base', item_number: '2.08', item_type: 'select', options: Object.keys(advisory.base_modes) },
  { id: 'adj', item_number: '6.01', item_type: 'select', options: ['Sí', 'No'] },
  { id: 'found', item_number: '4.01', item_type: 'table', options: table('as_found') },
]
type Row = { expected?: number; observed?: number; error?: number; result?: string; remarks?: string }
const capture = (rows: Row[]) => JSON.stringify({ version: 1, count: rows.length, rows: rows.map((cells, i) => ({ id: `R${i + 1}`, label: `Punto ${i + 1}`, cells })) })
function run(rows: Row[], extra: Record<string, AdvisoryAnswer> = {}) {
  const answers: Record<string, AdvisoryAnswer> = {
    lo: { value_numeric: 4 }, hi: { value_numeric: 20 }, tol: { value_numeric: 0.5 }, base: { value_option: '% del span' },
    found: { value_text: capture(rows) }, ...extra,
  }
  return calibrationAdvisories(items, id => answers[id]).found
}

describe('avisos de calibración (A37)', () => {
  it('H2: esperado 12, observado 99, error 0 y conforme → dos avisos', () => {
    const r = run([{ expected: 12, observed: 99, error: 0, result: 'pass' }])
    expect(r.rows.R1.map(i => i.code)).toEqual(['error_mismatch', 'pass_out_of_tolerance'])
    expect(r.rows.R1[0]).toMatchObject({ written: 0, computed: 543.75 })
  })

  it('error escrito con redondeo del inspector no avisa (0,4 cubre 0,375)', () => {
    expect(run([{ expected: 12, observed: 12.06, error: 0.4, result: 'pass' }])).toBeUndefined()
    expect(run([{ expected: 12, observed: 12.06, error: 0.38, result: 'pass' }])).toBeUndefined()
    // el inspector puede escribir el error sin signo
    expect(run([{ expected: 12, observed: 11.94, error: 0.375, result: 'pass' }])).toBeUndefined()
  })

  it('conforme fuera de la tolerancia del inspector avisa; no conforme no', () => {
    expect(run([{ expected: 12, observed: 12.1, error: 0.625, result: 'pass' }])!.rows.R1.map(i => i.code)).toEqual(['pass_out_of_tolerance'])
    expect(run([{ expected: 12, observed: 12.1, error: 0.625, result: 'fail', remarks: 'fuera' }])).toBeUndefined()
  })

  it('la base la elige el inspector: absoluta y % de la lectura', () => {
    const abs = { base: { value_option: 'Absoluta (unidades de salida)' }, tol: { value_numeric: 0.05 } }
    expect(run([{ expected: 12, observed: 12.04, error: 0.04, result: 'pass' }], abs)).toBeUndefined()
    expect(run([{ expected: 12, observed: 12.1, error: 0.1, result: 'pass' }], abs)!.rows.R1.map(i => i.code)).toEqual(['pass_out_of_tolerance'])
    expect(advisoryDeviation('pct_reading', 10.1, 10, null)).toBeCloseTo(1)
    expect(advisoryDeviation('pct_reading', 1, 0, null)).toBeNull()
  })

  it('sin tolerancia o sin base no revisa filas y lo dice; sin span tampoco calcula el % del span', () => {
    expect(run([{ expected: 12, observed: 99, error: 0, result: 'pass' }], { tol: null })!.notes).toEqual([{ code: 'no_criterion' }])
    const noSpan = run([{ expected: 12, observed: 12.06, error: 9, result: 'pass' }], { hi: null })!
    expect(noSpan.notes).toEqual([{ code: 'no_span' }])
    // sin desviación calculable se compara el error escrito con la tolerancia
    expect(noSpan.rows.R1.map(i => i.code)).toEqual(['pass_out_of_tolerance'])
  })

  it('as found no conforme sin ajuste avisa solo cuando el inspector ya respondió que no ajustó', () => {
    const rows = [{ expected: 12, observed: 12.1, error: 0.625, result: 'fail', remarks: 'fuera' }]
    expect(run(rows)).toBeUndefined()
    expect(run(rows, { adj: { value_option: 'Sí' } })).toBeUndefined()
    expect(run(rows, { adj: { value_option: 'No' } })!.notes).toEqual([{ code: 'as_found_no_adjust', count: 1 }])
  })

  it('un ítem no aplicable no avisa', () => {
    const answers: Record<string, AdvisoryAnswer> = { tol: { value_numeric: 0.5 }, base: { value_option: '% del span' }, lo: { value_numeric: 4 }, hi: { value_numeric: 20 }, found: { value_text: capture([{ expected: 12, observed: 99, error: 0, result: 'pass' }]) } }
    expect(calibrationAdvisories(items, id => answers[id], new Set(['lo', 'hi', 'tol', 'base']))).toEqual({})
  })
})
