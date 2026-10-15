import { describe, expect, it } from 'vitest'
import { parseDependenciesSheet, parseDependencyKind, parsePriority, parseSystemType, parseSystemsSheet } from './import'
import { dependencyBlocks } from './dependencies'

describe('valores de celda', () => {
  it('tipo de sistema en español o inglés, sin acentos', () => {
    expect(parseSystemType('Proceso')).toBe('process')
    expect(parseSystemType('Servicio auxiliar')).toBe('utility')
    expect(parseSystemType('UTILITY')).toBe('utility')
    expect(parseSystemType('Seguridad')).toBe('safety')
    expect(parseSystemType('')).toBeNull()
    expect(parseSystemType('eléctrico')).toBeUndefined()
  })

  it('prioridad P1–P5', () => {
    expect(parsePriority('P1')).toBe(1)
    expect(parsePriority('p 3')).toBe(3)
    expect(parsePriority('5')).toBe(5)
    expect(parsePriority('')).toBeNull()
    expect(parsePriority('P7')).toBeUndefined()
    expect(parsePriority('alta')).toBeUndefined()
  })

  it('tipo de dependencia: vacío = utility', () => {
    expect(parseDependencyKind('')).toBe('utility')
    expect(parseDependencyKind('Proceso')).toBe('process')
    expect(parseDependencyKind('aguas arriba')).toBe('process')
    expect(parseDependencyKind('Otro')).toBe('other')
    expect(parseDependencyKind('mecánica')).toBeUndefined()
  })
})

describe('parseSystemsSheet', () => {
  it('encabezado bajo una carátula, códigos normalizados, límites y errores por fila', () => {
    const res = parseSystemsSheet([
      ['PLANTA GLP — SISTEMATIZACIÓN'],
      [],
      ['Sistema', 'Nombre', 'Tipo', 'Prioridad', 'Entrada', 'Salida', 'Notas'],
      ['u100-s01', 'Aire de instrumentos', 'Utility', 'P1', 'Toma de aire', '', ''],
      ['A100-S01', 'Compresión', 'Proceso', 'P9', '', 'Brida 6"', 'ok'],
      ['', '', '', '', '', '', ''],
      ['U100-S01', 'repetido', '', '', '', '', ''],
    ])
    expect(res.missingColumns).toEqual([])
    expect(res.rows).toEqual([
      { row: 4, system_code: 'U100-S01', name: 'Aire de instrumentos', system_type: 'utility', priority: 1, battery_limits: { inlet: 'Toma de aire' } },
      { row: 5, system_code: 'A100-S01', name: 'Compresión', system_type: 'process', priority: null, battery_limits: { outlet: 'Brida 6"', notes: 'ok' } },
    ])
    expect(res.errors).toEqual([
      'Fila 5: prioridad «P9» no válida (P1 a P5) — A100-S01',
      'Fila 7: el sistema U100-S01 está repetido',
    ])
  })

  it('sin columna SISTEMA no importa nada', () => {
    expect(parseSystemsSheet([['Nombre', 'Tipo'], ['x', 'y']]).missingColumns).toEqual(['SISTEMA'])
  })
})

describe('parseDependenciesSheet', () => {
  it('lee sistema, proveedor, tipo y gates opcionales', () => {
    const res = parseDependenciesSheet([
      ['Sistema', 'Depende de', 'Tipo dependencia', 'Gate requerido', 'Gate bloqueado', 'Notas'],
      ['a100-s01', 'U100-S01', '', '', '', 'aire'],
      ['A200-S01', 'A100-S01', 'Proceso', 'rfsu', 'RFSU', ''],
      ['A200-S01', 'A200-S01', '', '', '', ''],
      ['A300-S01', '', '', '', '', ''],
      ['A300-S01', 'U100-S01', 'mecánica', '', '', ''],
    ])
    expect(res.rows).toEqual([
      { row: 2, system_code: 'A100-S01', depends_on_code: 'U100-S01', kind: 'utility', required_gate_code: null, blocked_gate_code: null, notes: 'aire' },
      { row: 3, system_code: 'A200-S01', depends_on_code: 'A100-S01', kind: 'process', required_gate_code: 'RFSU', blocked_gate_code: 'RFSU', notes: null },
    ])
    expect(res.errors).toHaveLength(3)
  })

  it('exige SISTEMA y DEPENDE DE', () => {
    expect(parseDependenciesSheet([['Sistema', 'Tipo'], ['A', 'B']]).missingColumns).toEqual(['DEPENDE DE'])
  })
})

describe('dependencyBlocks', () => {
  const edges = [
    { system_id: 'comp', depends_on_system_id: 'aire', required_gate_id: 'rfsu', blocked_gate_id: 'rfc' },
    { system_id: 'comp', depends_on_system_id: 'n2', required_gate_id: 'rfsu', blocked_gate_id: 'rfc' },
    { system_id: 'tea', depends_on_system_id: 'aire', required_gate_id: 'rfsu', blocked_gate_id: 'rfsu' },
  ]
  const codes: Record<string, string> = { aire: 'U100', n2: 'U200' }

  it('marca el gate bloqueado con los proveedores que faltan', () => {
    const status: Record<string, string> = { 'aire:rfsu': 'pending_signatures', 'n2:rfsu': 'approved' }
    const blocks = dependencyBlocks(edges, (s, g) => status[`${s}:${g}`], id => codes[id])
    expect(Object.fromEntries(blocks)).toEqual({ 'comp:rfc': ['U100'], 'tea:rfsu': ['U100'] })
  })

  it('aprobado, con condiciones o en regresión no bloquea', () => {
    for (const st of ['approved', 'approved_with_conditions', 'regressed']) {
      expect(dependencyBlocks(edges, () => st, id => codes[id]).size).toBe(0)
    }
  })
})

describe('parseSystemsWorkbook (libro .xlsx real, mismo formato que la plantilla)', () => {
  it('reconoce las dos hojas aunque vengan en otro orden y lee de ida y vuelta', async () => {
    const XLSX = await import('xlsx')
    const { parseSystemsWorkbook } = await import('./import')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { SISTEMA: 'A100-S01', 'DEPENDE DE': 'U100-S01', 'TIPO DEPENDENCIA': 'Utility', 'GATE REQUERIDO': 'RFSU', 'GATE BLOQUEADO': 'RFC', NOTAS: '' },
    ]), 'Dependencias')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { SISTEMA: 'U100-S01', NOMBRE: 'Aire de instrumentos', TIPO: 'Utility', PRIORIDAD: 'P1', ENTRADA: 'Toma de aire', SALIDA: '', 'ELÉCTRICO': 'CCM-01', 'INSTRUMENTACIÓN': '', UTILITIES: '', NOTAS: '' },
    ]), 'Sistemas')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const res = parseSystemsWorkbook(XLSX.read(buf, { type: 'array' }))
    expect(res.errors).toEqual([])
    expect(res.systems).toEqual([
      { row: 2, system_code: 'U100-S01', name: 'Aire de instrumentos', system_type: 'utility', priority: 1, battery_limits: { inlet: 'Toma de aire', electrical: 'CCM-01' } },
    ])
    expect(res.dependencies).toEqual([
      { row: 2, system_code: 'A100-S01', depends_on_code: 'U100-S01', kind: 'utility', required_gate_code: 'RFSU', blocked_gate_code: 'RFC', notes: null },
    ])
  })
})
