import { describe, expect, it } from 'vitest'
import { packageScope, parsePackageList } from './package-list'

// Forma de la lista de equipos tipo paquete de CPF Orotoy (MEE-LI-101).
const SKID = 'Tipo Paquete montado en skid metálico compuesta por Isotanque de almacenamiento, bombas y tablero eléctrico.'
const rows: unknown[][] = [
  ['LISTA DE EQUIPOS TIPO PAQUETE'],
  ['ITEM', 'CANT.', 'TAG (NOTA 1 & 2)', 'EQUIPO', 'TIPO'],
  ['EQUIPO TIPO PAQUETE'],
  ['1', 'Un (1)', 'X-762701', 'Unidad de Aire Comprimido', 'Equipo paquetizado en skid compuesto principalmente por: Dos (2) Compresores de Tornillo'],
  ['3', 'Un (1)', 'N/D', 'Sistema de Tratamiento de Agua de Producción (NOTA 7)', 'Equipo paquetizado en skid compuesto por los equipos descritos abajo'],
  ['3.1', 'Cinco (5)', '', 'Clarificador (CPI) CPI-01/02', 'Recipiente Rectangular'],
  ['3.2', 'Tres (3)', '', 'Celdas de Flotación (IGF)', ''],
  ['7', 'Un (1)', 'PQUIM-762102\nP-762106', 'Paquete de Inyección de Químicos', SKID],
  ['8', 'Un (1)', 'PQUIM-762103 P-762107', 'Paquete de Inyección de Químicos', SKID],
  ['MISCELANEOS'],
  ['26', 'Un (1)', 'N/D', 'Puente Grua shelter 1A Bombas de Inyección', 'Equipo paquetizado tipo top running (viga puente) y trolley underhung'],
  ['27', 'Un (1)', 'N/D', 'Puente Grua shelter 1B Bombas Booster', 'Equipo paquetizado tipo top running (viga puente) y trolley underhung'],
  ['NOTAS'],
  ['1', '', '', 'Las dimensiones son preliminares', ''],
]

describe('parsePackageList', () => {
  const pkgs = parsePackageList(rows)
  it('un paquete por fila de ítem; los del mismo alcance juntos', () => {
    expect(pkgs.map(p => `${p.items.join('+')}:${p.title}`)).toEqual([
      '1:Unidad de Aire Comprimido', '3:Sistema de Tratamiento de Agua de Producción',
      '7+8:Paquete de Inyección de Químicos', '26+27:Puente Grua shelter',
    ])
  })
  it('tags de la fila (paquete y su bomba); N/D no es tag', () => {
    expect(pkgs[0].tags).toEqual(['X-762701'])
    expect(pkgs[1].tags).toEqual([])
    expect(pkgs[2].tags).toEqual(['PQUIM-762102', 'P-762106', 'PQUIM-762103', 'P-762107'])
  })
  it('los sub-ítems son componentes del alcance', () => {
    expect(pkgs[1].components).toEqual(['Clarificador (CPI) CPI-01/02 — Recipiente Rectangular', 'Celdas de Flotación (IGF)'])
    expect(packageScope(pkgs[1])).toBe('Equipo paquetizado en skid compuesto por los equipos descritos abajo\n\nComponentes:\n- Clarificador (CPI) CPI-01/02 — Recipiente Rectangular\n- Celdas de Flotación (IGF)')
  })
  it('sin agrupar, una fila = un paquete; las notas no entran', () => {
    expect(parsePackageList(rows, false).map(p => p.items[0])).toEqual(['1', '3', '7', '8', '26', '27'])
  })
})
