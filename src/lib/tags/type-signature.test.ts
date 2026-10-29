import { describe, expect, it } from 'vitest'
import { cleanTypeCode, detectFree, learnedMap, normDesc, signatureKey, tagPrefix, type CatalogType } from './type-signature'
import { buildTypePrompt, estimateClassifyUsd, reconcileTypeProposals, type ClassifyGroup } from './type-ai'

const CAT: CatalogType[] = [
  { id: 'he', code: 'HE', name: 'Intercambiador de Calor', category: 'Estáticos' },
  { id: 'e', code: 'E', name: 'Intercambiador', category: 'Estáticos' },
  { id: 'fil', code: 'FIL', name: 'Filtro', category: 'Estáticos' },
  { id: 'hv', code: 'HV', name: 'Válvula Manual', category: 'Válvulas' },
  { id: 'vlv', code: 'VLV', name: 'Válvula Manual (Piping)', category: 'Válvulas' },
  { id: 'gen', code: 'GEN', name: 'Generador (GEN)', category: 'Eléctricos' },
  { id: 'p', code: 'P', name: 'Bomba', category: 'Rotativos' },
  { id: 'swg', code: 'SWG', name: 'Tablero / Switchgear', category: 'Eléctricos' },
]

describe('R3: firma del tag (= SQL tag_number_prefix / tag_desc_norm)', () => {
  it('prefijo = primera racha de letras', () => {
    expect(tagPrefix('10-PT-1001A')).toBe('PT')
    expect(tagPrefix('esdv-7621')).toBe('ESDV')
    expect(tagPrefix('123')).toBe('')
    expect(tagPrefix(null)).toBe('')
  })

  // Mismos casos y salidas que la expresión de tag_desc_norm corrida en prod (2026-10-23).
  it.each([
    ['Bomba Centrífuga P-101 / agua  de ENFRIAMIENTO', 'bomba centrifuga agua de enfriamiento'],
    ['  Válvula Manual 2" (Piping) ', 'valvula manual piping'],
    ['TRANSMISOR DE PRESIÓN — salida', 'transmisor de presion salida'],
    ['Ñandú/Çedilla', 'nandu cedilla'],
    ['', ''],
    [null, ''],
    ['Spool de Tubería', 'spool de tuberia'],
  ])('normDesc(%j) = %j', (input, out) => {
    expect(normDesc(input)).toBe(out)
  })

  it('clave de firma', () => {
    expect(signatureKey({ prefix: 'HX', discipline_id: null, desc_norm: 'intercambiador de calor' })).toBe('HX||intercambiador de calor')
  })
})

describe('R3: detección gratis', () => {
  const none = new Map<string, string>()

  it('el prefijo es un código del catálogo', () => {
    expect(detectFree({ prefix: 'P', desc_norm: 'cualquier cosa' }, CAT, none)).toEqual({ source: 'prefix', typeId: 'p' })
  })

  it('prefijo aprendido con mayoría (≥ 80 % y ≥ 3)', () => {
    const learned = learnedMap([
      { prefix: 'PNL', equipment_type_id: 'swg', n: 8 },
      { prefix: 'PNL', equipment_type_id: 'gen', n: 1 },
      { prefix: 'XX', equipment_type_id: 'fil', n: 2 },
      { prefix: 'YY', equipment_type_id: 'fil', n: 3 },
      { prefix: 'YY', equipment_type_id: 'he', n: 3 },
    ])
    expect(learned.get('PNL')).toBe('swg')
    expect(learned.has('XX')).toBe(false) // menos de 3
    expect(learned.has('YY')).toBe(false) // sin mayoría
    expect(detectFree({ prefix: 'PNL', desc_norm: 'tablero electrico' }, CAT, learned)).toEqual({ source: 'learned', typeId: 'swg' })
  })

  it('la descripción es el nombre de un tipo (exacto antes que sin paréntesis)', () => {
    expect(detectFree({ prefix: 'HX', desc_norm: 'intercambiador de calor' }, CAT, none)).toEqual({ source: 'name', typeId: 'he' })
    expect(detectFree({ prefix: 'F', desc_norm: 'filtro' }, CAT, none)).toEqual({ source: 'name', typeId: 'fil' })
    expect(detectFree({ prefix: 'VL', desc_norm: 'valvula manual' }, CAT, none)).toEqual({ source: 'name', typeId: 'hv' })
    expect(detectFree({ prefix: 'GN', desc_norm: 'generador' }, CAT, none)).toEqual({ source: 'name', typeId: 'gen' })
  })

  it('sin evidencia, nada', () => {
    expect(detectFree({ prefix: 'SP', desc_norm: 'spool de tuberia' }, CAT, none)).toBeNull()
    expect(detectFree({ prefix: '', desc_norm: '' }, CAT, none)).toBeNull()
  })

  it('código de tipo nuevo', () => {
    expect(cleanTypeCode(' sp ')).toBe('SP')
    expect(cleanTypeCode('1AB')).toBeNull()
    expect(cleanTypeCode('ABCDEFGHIJKLM')).toBeNull()
  })
})

describe('R3: propuestas de la IA', () => {
  const groups: ClassifyGroup[] = [
    { prefix: 'PNL', discipline_id: 'd1', discipline_code: 'ELEC', discipline_name: 'Eléctrica', desc_norm: 'tablero electrico', description: 'Tablero Eléctrico', n: 2, samples: ['PNL-101', 'PNL-102'] },
    { prefix: 'SP', discipline_id: 'd2', discipline_code: 'PIPE', discipline_name: 'Piping', desc_norm: 'spool de tuberia', description: 'Spool de Tubería', n: 11, samples: ['SP-101'] },
    { prefix: 'FH', discipline_id: 'd3', discipline_code: 'SAFE', discipline_name: 'Seguridad', desc_norm: 'hidrante', description: 'Hidrante', n: 6, samples: ['FH-101'], rejected: ['FH'] },
    { prefix: 'ZZ', discipline_id: null, discipline_code: null, discipline_name: null, desc_norm: '', description: null, n: 1, samples: ['ZZ-1'] },
  ]
  const item = (i: number, o: Partial<{ outcome: 'type' | 'new_type' | 'none'; type_code: string; new_code: string; new_name: string; new_category: string; confidence: number }>) => ({
    i, outcome: o.outcome ?? 'type', type_code: o.type_code ?? null, new_code: o.new_code ?? null, new_name: o.new_name ?? null,
    new_category: o.new_category ?? null, confidence: o.confidence ?? 0.8, reason: 'motivo',
  })

  it('cruza con el catálogo: inventado → nuevo o nada; nuevo existente → ese tipo; rechazado no vuelve', () => {
    const r = reconcileTypeProposals({
      items: [
        item(0, { type_code: 'swg', confidence: 1.4 }),
        item(1, { outcome: 'new_type', new_code: 'sp', new_name: 'Spool', new_category: 'Tubería' }),
        item(2, { outcome: 'new_type', new_code: 'FH', new_name: 'Hidrante' }),
        item(3, { type_code: 'NOEXISTE' }),
        item(0, { type_code: 'P' }), // repetido: se ignora
        item(9, { type_code: 'P' }), // fuera de rango
      ],
    }, groups, CAT)
    expect(r.get(0)).toEqual({ outcome: 'type', typeId: 'swg', confidence: 1, reason: 'motivo' })
    expect(r.get(1)).toEqual({ outcome: 'new_type', newType: { code: 'SP', name: 'Spool', category: 'Tubería' }, confidence: 0.8, reason: 'motivo' })
    expect(r.get(2)?.outcome).toBe('none')
    expect(r.get(3)?.outcome).toBe('none')
    expect(r.size).toBe(4)
  })

  it('un tipo nuevo con código del catálogo es ese tipo', () => {
    const r = reconcileTypeProposals({ items: [item(1, { outcome: 'new_type', new_code: 'HE', new_name: 'Otro' })] }, groups, CAT)
    expect(r.get(1)).toMatchObject({ outcome: 'type', typeId: 'he' })
  })

  it('el pedido numera las firmas y lleva lo rechazado', () => {
    const p = buildTypePrompt(groups, CAT, [{ prefix: 'P', code: 'P' }])
    expect(p).toContain('#0 prefijo PNL')
    expect(p).toContain('Rechazado: FH')
    expect(p).toContain('SWG · Tablero / Switchgear · Eléctricos')
  })

  it('costo estimado de Haiku: centavos para cientos de firmas', () => {
    expect(estimateClassifyUsd(300, 76)).toBeLessThan(0.05)
    expect(estimateClassifyUsd(300, 76)).toBeGreaterThan(0)
  })
})

describe('detectFree — sinónimos y segundo segmento (lista eléctrica)', () => {
  const cat: CatalogType[] = [
    { id: 't', code: 'T', name: 'Transformador', category: 'Eléctricos' },
    { id: 'ups', code: 'UPS', name: 'UPS', category: 'Eléctricos' },
    { id: 'tab', code: 'TAB', name: 'Tablero de distribución BT', category: 'Eléctricos' },
  ]
  it('el sinónimo del prefijo y el segundo bloque de las muestras', () => {
    expect(detectFree({ prefix: 'TRF', desc_norm: 'transformador de potencia', samples: ['TRF-76029001', 'TRF-76029003'] }, cat, new Map())?.typeId).toBe('t')
    expect(detectFree({ prefix: 'PR', desc_norm: 'sistema ininterrumpido de potencia ac', samples: ['PR01-UPS-AC-01', 'PR02-UPS-AC-01'] }, cat, new Map())?.typeId).toBe('ups')
  })
  it('si las muestras no coinciden en el tipo, no decide', () => {
    expect(detectFree({ prefix: 'PR', desc_norm: 'equipos varios', samples: ['PR01-UPS-AC-01', 'PR01-TSA-AC-01'] }, cat, new Map())).toBeNull()
  })
})
