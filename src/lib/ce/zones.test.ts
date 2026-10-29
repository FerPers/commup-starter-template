import { describe, expect, it } from 'vitest'
import { splitSheetByZones } from './zones'

// Forma de la matriz F&G de CPF Orotoy (GG-008): encabezado con efectos, títulos de zona y causas por fila.
const rows: unknown[][] = [
  ['MATRIZ CAUSA-EFECTO F&G'],
  ['', '', '', '', '', '', '', 'EFECTO', 'DY-7628001', 'AS-762512', 'AV-762512', 'HMI'],
  ['TAG', 'ESTADO', 'DESCRIPCIÓN', '', '', '', '', 'ITEM', '1', '2', '3', '4'],
  ['ENTRADA SISTEMA DE ESPUMA'],
  ['HS-7628001', 'ALARMA', 'Activación hand switch', '', '', '', '', '1', 'X', '', '', 'X'],
  ['BOMBAS DESCARGADERO DE NAFTA', '', '', '', '', '', '', '', '', '', '', ''],
  ['FD-762516', 'ALARMA', 'Detección de fuego', '', '', '', '', '2', '', 'X', 'X', 'X'],
  ['GD-762519', 'ALARMA', 'Pre alarma %LEL, 20 a 40', '', '', '', '', '3', '', 'X', '', 'X'],
  ['Notas'],
  ['1. Los valores de set son preliminares'],
]

describe('splitSheetByZones', () => {
  const zones = splitSheetByZones(rows)
  it('una zona por título, con sus causas', () => {
    expect(zones.map(z => `${z.title}:${z.rows}`)).toEqual(['ENTRADA SISTEMA DE ESPUMA:1', 'BOMBAS DESCARGADERO DE NAFTA:2'])
  })
  it('cada zona lleva el encabezado y solo las columnas que usa', () => {
    expect(zones[0].csv.split('\n')[1]).toBe(',,,EFECTO,DY-7628001,HMI')
    expect(zones[1].csv).toContain('AS-762512,AV-762512,HMI')
    expect(zones[1].csv).not.toContain('DY-7628001')
    expect(zones[1].csv).toContain('"Pre alarma %LEL, 20 a 40"')
  })
  it('las notas al pie no entran', () => {
    expect(zones[1].csv).not.toContain('preliminares')
  })
  it('una hoja sin zonas se lee entera', () => {
    expect(splitSheetByZones(rows.slice(0, 5))).toEqual([])
  })
})
