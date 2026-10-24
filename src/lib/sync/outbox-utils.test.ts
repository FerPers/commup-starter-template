import { describe, expect, it } from 'vitest'
import { TABLE_PRESETS, reshapeTable, type SourceRow } from '../itr/table'
import { isNetworkFailure, localAttachmentId, localItrStatus, outboxPolicy, signatureWaits, parseLocalAttachmentId, punchPhotoPath, itrEvidencePath, isAlreadyStored } from './outbox-utils'

describe('local attachment ids', () => {
  it('round-trips an outbox id', () => {
    expect(localAttachmentId(42)).toBe('local:42')
    expect(parseLocalAttachmentId('local:42')).toBe(42)
  })
  it('rejects real (uuid) ids and garbage', () => {
    expect(parseLocalAttachmentId('3f2a…')).toBeNull()
    expect(parseLocalAttachmentId('local:abc')).toBeNull()
  })
})

describe('isNetworkFailure', () => {
  it('is true whenever the browser reports offline', () => {
    expect(isNetworkFailure(new Error('anything'), false)).toBe(true)
  })
  it('recognises fetch/network errors when online', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(isNetworkFailure(new Error('network error'), true)).toBe(true)
    expect(isNetworkFailure({ message: 'Load failed' }, true)).toBe(false) // objeto sin Error: solo string/Error se inspeccionan
    expect(isNetworkFailure('connection reset', true)).toBe(true)
  })
  it('treats server rejections as logical errors', () => {
    expect(isNetworkFailure(new Error('Access denied'), true)).toBe(false)
    expect(isNetworkFailure(new Error('new row violates row-level security policy'), true)).toBe(false)
  })
})

describe('itrEvidencePath (A02)', () => {
  it('es la misma ruta en cada reenvío de la captura', () => {
    const paths = Array.from({ length: 10 }, () => itrEvidencePath('itr1', 'item9', 'cap-1', 'IMG_0001.HEIC'))
    expect(new Set(paths)).toEqual(new Set(['itr1/item9/cap-1.heic']))
  })
  it('usa la carpeta general sin ítem y sanea la extensión', () => {
    expect(itrEvidencePath('itr1', null, 'cap-2', 'foto')).toBe('itr1/general/cap-2.jpg')
    expect(itrEvidencePath('itr1', null, 'cap-3', 'a.p?df')).toBe('itr1/general/cap-3.pdf')
  })
  it('reconoce un objeto ya subido como éxito', () => {
    expect(isAlreadyStored({ message: 'The resource already exists', statusCode: '409' })).toBe(true)
    expect(isAlreadyStored({ message: 'Duplicate' })).toBe(true)
    expect(isAlreadyStored({ message: 'new row violates row-level security policy', statusCode: '403' })).toBe(false)
    expect(isAlreadyStored(null)).toBe(false)
  })
})

describe('outboxPolicy (conflictos al sincronizar)', () => {
  it('nunca descarta solas fotos ni punches (A01 / S06): quedan «No sincronizado»', () => {
    expect(outboxPolicy('photo', 0)).toBe('retry')
    expect(outboxPolicy('photo', 50)).toBe('retry')
    // S06: un punch nunca se descarta solo; queda «No sincronizado».
    expect(outboxPolicy('punch', 2)).toBe('retry')
    expect(outboxPolicy('punch', 50)).toBe('retry')
  })
  it('drops a signature on the first rejection (ITR changed state meanwhile)', () => {
    expect(outboxPolicy('signature', 0)).toBe('drop')
  })
  it('una respuesta se descarta al tercer rechazo (sus valores quedan en sync_conflicts)', () => {
    expect(outboxPolicy('response', 1)).toBe('retry')
    expect(outboxPolicy('response', 2)).toBe('drop')
  })
})

describe('localItrStatus (validación de contenido)', () => {
  const items = ['a', 'b', 'c'].map(id => ({ id, item_type: 'text' as const, is_required: true, is_critical: id === 'a', requires_photo: false, requires_measurement: false, condition_item_id: null, condition_value: null, options: null }))
  it('not_started without responses', () => {
    expect(localItrStatus(items, {})).toEqual({ pct: 0, status: 'not_started' })
  })
  it('does not count empty saved rows', () => {
    expect(localItrStatus(items, { a: {}, b: {}, c: {} }).status).not.toBe('completed')
  })
  it('counts actual content', () => {
    expect(localItrStatus(items, { a: { value_text: 'dato' } })).toEqual({ pct: 33, status: 'in_progress' })
  })
  it('completes only when requirements are satisfied', () => {
    expect(localItrStatus(items, { a: { value_text: 'a' }, b: { value_text: 'b' }, c: { value_text: 'c' } })).toEqual({ pct: 100, status: 'completed' })
  })
  it('preserves explicit critical rejection', () => {
    expect(localItrStatus(items, { a: { value_text: 'a', is_passed: false }, b: { value_text: 'b' }, c: { value_text: 'c' } }).status).toBe('rejected')
  })
  it('never rounds a missing required answer to 100', () => {
    const many = Array.from({ length: 200 }, (_, n) => ({ ...items[0], id: String(n) }))
    const responses = Object.fromEntries(many.slice(0, 199).map(item => [item.id, { value_text: 'dato' }]))
    expect(localItrStatus(many, responses).pct).toBeLessThan(100)
    expect(localItrStatus(many, responses).status).toBe('in_progress')
  })
  it('loop check (tabla con filas de origen) se completa con la foto del ITR (C-02)', () => {
    const config = structuredClone(TABLE_PRESETS.find(p => p.id === 'loop_check')!.config)
    const rows: SourceRow[] = [
      { key: 's1', label: 'FT-101 AI', refs: { signal_type: 'AI' } },
      { key: 's2', label: 'FT-101 DO', refs: { signal_type: 'DO' } },
    ]
    const base = reshapeTable(config, null, rows.length, rows)
    const value = JSON.stringify({ ...base, rows: base.rows.map(row => ({ ...row, cells: { ...row.cells, wiring: 'pass', hmi_ok: 'pass', result: 'pass' } })) })
    const table = [{ ...items[0], id: 't', item_type: 'table' as const, is_critical: false, options: config }]
    expect(localItrStatus(table, { t: { value_text: value } }, [], rows)).toEqual({ pct: 100, status: 'completed' })
    // Sin la foto no hay forma de validar las filas: así quedaba bloqueada la firma.
    expect(localItrStatus(table, { t: { value_text: value } }).status).not.toBe('completed')
  })
})

describe('punchPhotoPath (S06)', () => {
  it('ruta fija por punch e índice, extensión saneada', () => {
    expect(punchPhotoPath('abc', 0, 'IMG_1.JPG')).toBe('abc/campo-1.jpg')
    expect(punchPhotoPath('abc', 2, 'sin-extension')).toBe('abc/campo-3.jpg')
    expect(punchPhotoPath('abc', 1, 'x.he?ic')).toBe('abc/campo-2.heic')
  })
})

describe('cola de respuestas sin bloqueo (S18, C-07)', () => {
  it('una respuesta rechazada se reintenta 3 veces y luego se descarta', () => {
    expect(outboxPolicy('response', 0)).toBe('retry')
    expect(outboxPolicy('response', 1)).toBe('retry')
    expect(outboxPolicy('response', 2)).toBe('drop')
  })

  it('la firma espera mientras su ITR tenga respuestas en cola', () => {
    const pending = new Set(['itr1'])
    expect(signatureWaits('itr1', pending)).toBe(true)
    expect(signatureWaits('itr2', pending)).toBe(false)
  })

  it('G-17: la firma espera mientras su ITR tenga fotos sin subir', () => {
    expect(signatureWaits('itr1', new Set(), new Set(['itr1']))).toBe(true)
    expect(signatureWaits('itr2', new Set(), new Set(['itr1']))).toBe(false)
  })
})
