import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { buildCapturesExport, dataUrlBytes, safeFileName } from './export-captures'
import type { OutboxEntry, QueuedResponse } from '@/lib/offline-queue'

// A01 (resto): las capturas retenidas se exportan con sus binarios antes de descartarse.
const base = { itrId: 'itr-1', projectId: 'p', tagId: 't', capturedBy: 'u1', queuedAt: '2026-10-24T08:00:00.000Z', attempts: 3, lastError: 'ITR firmado' }
const photo: OutboxEntry = { ...base, id: 7, kind: 'photo', itemId: 'item-1', fileName: 'IMG 0001 (1).JPG', fileType: 'image/jpeg', blob: new Blob([new Uint8Array([255, 216, 255, 1, 2])]), captureId: 'cap-1', capturedAt: '2026-10-24T06:30:00.000Z' }
const punch: OutboxEntry = { ...base, id: 8, kind: 'punch', punchId: 'pu-1', category: 'A', description: 'Fuga en brida', targetDate: null, impact: 'safety', photos: [{ fileName: 'fuga.png', fileType: 'image/png', blob: new Blob([new Uint8Array([137, 80])]) }] }
const signature: OutboxEntry = { ...base, id: 9, kind: 'signature', role: 'executor', signatureImage: 'data:image/png;base64,iVBORw0K' }
const response: QueuedResponse = { id: 3, itrId: 'itr-1', itemId: 'item-2', templateId: 'tpl', valueNumeric: 4.2, queuedAt: base.queuedAt, updatedAt: '2026-10-24T07:00:00.000Z', capturedBy: 'u1', attempts: 2, lastError: 'rechazada' }
const meta = { exportedAt: '2026-10-24T15:04:05.678Z', exportedBy: 'u1', reason: 'unsynced' as const }

describe('buildCapturesExport', () => {
  it('arma un ZIP con capturas.json, las fotos, las fotos del punch y la firma', async () => {
    const out = await buildCapturesExport({ outbox: [photo, punch, signature], responses: [response] }, meta)
    expect(out.count).toBe(4)
    expect(out.fileName).toBe('commup-capturas-20261024-150405.zip')
    const zip = unzipSync(out.bytes)
    expect(Object.keys(zip).sort()).toEqual([
      'LEEME.txt', 'capturas.json', 'firmas/9-executor.png', 'fotos/cap-1-IMG_0001_1_.JPG', 'punches/pu-1/foto-1-fuga.png',
    ])
    expect([...zip['fotos/cap-1-IMG_0001_1_.JPG']]).toEqual([255, 216, 255, 1, 2])
    const manifest = JSON.parse(strFromU8(zip['capturas.json']))
    expect(manifest).toMatchObject({ format: 'commup-captures', schema_version: 1, reason: 'unsynced', count: 4 })
    expect(manifest.captures).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'photo', captureId: 'cap-1', capturedAt: '2026-10-24T06:30:00.000Z', lastError: 'ITR firmado', file: 'fotos/cap-1-IMG_0001_1_.JPG' }),
      expect.objectContaining({ kind: 'punch', description: 'Fuga en brida', photos: [expect.objectContaining({ file: 'punches/pu-1/foto-1-fuga.png' })] }),
      expect.objectContaining({ kind: 'response', value: expect.objectContaining({ numeric: 4.2 }), capturedAt: '2026-10-24T07:00:00.000Z' }),
      expect.objectContaining({ kind: 'signature', role: 'executor', file: 'firmas/9-executor.png' }),
    ]))
  })

  it('sin nada que exportar deja un ZIP válido con cero capturas', async () => {
    const out = await buildCapturesExport({}, meta)
    expect(out.count).toBe(0)
    expect(JSON.parse(strFromU8(unzipSync(out.bytes)['capturas.json'])).captures).toEqual([])
  })

  it('una foto vieja sin captureId usa su id local', async () => {
    const { captureId: _c, ...old } = photo as OutboxEntry & { kind: 'photo' }
    const zip = unzipSync((await buildCapturesExport({ outbox: [old] }, meta)).bytes)
    expect(Object.keys(zip)).toContain('fotos/local-7-IMG_0001_1_.JPG')
  })
})

describe('utilidades', () => {
  it('safeFileName quita rutas y caracteres raros', () => {
    expect(safeFileName('../../etc/pass wd')).toBe('pass_wd')
    expect(safeFileName('Válvula ñ.jpg')).toBe('Valvula_n.jpg')
    expect(safeFileName('')).toBe('archivo')
  })
  it('dataUrlBytes solo acepta imágenes en base64', () => {
    expect(dataUrlBytes('data:image/png;base64,AAEC')?.bytes).toEqual(new Uint8Array([0, 1, 2]))
    expect(dataUrlBytes('data:text/html;base64,AAEC')).toBeNull()
    expect(dataUrlBytes(null)).toBeNull()
  })
})
