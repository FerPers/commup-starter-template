/**
 * A36: casos de aceptación de tablas compartidos por la prueba unitaria (table-acceptance.test.ts) y la de paridad
 * TS = SQL (tests/db/itr-table-acceptance.test.ts). Cada caso dice qué DEBE salir.
 */
export const ACCEPTANCE_CONFIGS: Record<string, unknown> = {
  // Prueba de efecto (como el preset ce_test, con filas fijas para no depender de la foto del ITR).
  effect: { version: 2, rows: { mode: 'fixed', labels: ['E1'] }, columns: [
    { key: 'executed', label: 'Ejecutó la acción', type: 'select', options: ['Sí', 'No', 'N/A'], outcomes: { 'Sí': 'pass', No: 'fail', 'N/A': 'not_applicable' } },
    { key: 'feedback', label: 'Feedback', type: 'result' },
    { key: 'result', label: 'Resultado', type: 'result', decides: true },
    { key: 'remarks', label: 'Observación', type: 'text', required: false },
  ] },
  // Resultado que decide aunque la plantilla lo marcó opcional (H3).
  decidesOptional: { version: 1, rows: { mode: 'fixed', labels: ['R'] }, columns: [
    { key: 'reading', label: 'Lectura', type: 'number' },
    { key: 'result', label: 'Resultado', type: 'result', required: false, decides: true },
  ] },
  // Selección parcialmente mapeada: «Otra» es descriptiva.
  partial: { version: 1, rows: { mode: 'fixed', labels: ['R'] }, columns: [
    { key: 'state', label: 'Estado', type: 'select', options: ['Bien', 'Dañado', 'Otra'], outcomes: { Bien: 'pass', 'Dañado': 'fail' } },
  ] },
  // Resultado automático con lecturas opcionales: sin desviación calculable no hay resultado.
  auto: { version: 2, rows: { mode: 'fixed', labels: ['50 %'] }, columns: [
    { key: 'expected', label: 'Esperada', type: 'number', required: false },
    { key: 'observed', label: 'Observada', type: 'number', required: false },
    { key: 'error', label: 'Error', type: 'computed', formula: { observed: 'observed', reference: 'expected', mode: 'abs' }, tolerance: 0.1 },
    { key: 'result', label: 'Resultado', type: 'result', auto_from: 'error', decides: true },
  ] },
  badOutcomeOnNumber: { version: 1, rows: { mode: 'fixed', labels: ['R'] }, columns: [
    { key: 'n', label: 'N', type: 'number', outcomes: { '1': 'pass' } },
  ] },
  badOutcomeOption: { version: 1, rows: { mode: 'fixed', labels: ['R'] }, columns: [
    { key: 's', label: 'S', type: 'select', options: ['Sí', 'No'], outcomes: { Quizá: 'fail' } },
  ] },
  badOutcomeValue: { version: 1, rows: { mode: 'fixed', labels: ['R'] }, columns: [
    { key: 's', label: 'S', type: 'select', options: ['Sí', 'No'], outcomes: { No: 'rechazo' } },
  ] },
  badTwoDecides: { version: 1, rows: { mode: 'fixed', labels: ['R'] }, columns: [
    { key: 'a', label: 'A', type: 'result', decides: true },
    { key: 'b', label: 'B', type: 'result', decides: true },
  ] },
  badDecidesOnSelect: { version: 1, rows: { mode: 'fixed', labels: ['R'] }, columns: [
    { key: 's', label: 'S', type: 'select', options: ['Sí'], decides: true },
  ] },
}

const row = (cells: Record<string, unknown>) => JSON.stringify({ version: 1, count: 1, rows: [{ id: 'R1', label: 'x', cells }] })

/** [nombre, configuración, captura, completa, rechazo] */
export const ACCEPTANCE_CASES: Array<[string, string, string, boolean, boolean]> = [
  ['efecto ejecutado y conforme', 'effect', row({ executed: 'Sí', feedback: 'pass', result: 'pass', remarks: '' }), true, false],
  ['H1: no ejecutó la acción pero «conforme» → rechazo', 'effect', row({ executed: 'No', feedback: 'pass', result: 'pass', remarks: '' }), true, true],
  ['acción N/A sin justificar → incompleta', 'effect', row({ executed: 'N/A', feedback: 'pass', result: 'pass', remarks: '' }), false, false],
  ['acción N/A justificada → completa', 'effect', row({ executed: 'N/A', feedback: 'pass', result: 'pass', remarks: 'Inhibida por permiso de trabajo' }), true, false],
  ['sin el resultado que decide → incompleta', 'effect', row({ executed: 'Sí', feedback: 'pass', result: '', remarks: '' }), false, false],
  ['H3: resultado que decide, marcado opcional, vacío → incompleta', 'decidesOptional', row({ reading: 5, result: '' }), false, false],
  ['resultado que decide lleno → completa', 'decidesOptional', row({ reading: 5, result: 'pass' }), true, false],
  ['opción descriptiva no decide', 'partial', row({ state: 'Otra' }), true, false],
  ['opción mapeada a rechazo', 'partial', row({ state: 'Dañado' }), true, true],
  ['resultado automático sin lecturas → incompleta', 'auto', row({}), false, false],
  ['resultado automático con lecturas en tolerancia', 'auto', row({ expected: 10, observed: 10.05 }), true, false],
  ['resultado automático fuera de tolerancia', 'auto', row({ expected: 10, observed: 10.5 }), true, true],
  ['outcomes en una columna numérica → configuración inválida', 'badOutcomeOnNumber', row({ n: 1 }), false, false],
  ['outcome de una opción que no existe → inválida', 'badOutcomeOption', row({ s: 'Sí' }), false, false],
  ['outcome con un valor desconocido → inválida', 'badOutcomeValue', row({ s: 'Sí' }), false, false],
  ['dos columnas que deciden → inválida', 'badTwoDecides', row({ a: 'pass', b: 'pass' }), false, false],
  ['decides en una selección → inválida', 'badDecidesOnSelect', row({ s: 'Sí' }), false, false],
]
