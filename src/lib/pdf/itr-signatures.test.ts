import { describe, expect, it, vi } from 'vitest'
import { PDFName } from 'pdf-lib'
import { Renderer, BOTTOM_LIMIT } from './renderer'
import { drawItrSignatures } from './itr-signatures'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6z8AAAAASUVORK5CYII='

describe('ITR signature evidence', () => {
  it('embeds a PNG and retains signer identity/date while moving the block to a safe page', async () => {
    const r = await Renderer.create(); r.newPage(); r.y = BOTTOM_LIMIT + 30
    const text = vi.spyOn(r, 'drawText')
    await drawItrSignatures(r, [{ role: 'executor', signed_at: '2026-09-09T15:20:00.931Z', profiles: { full_name: 'Inspector Test' }, signature_image: png }])
    await r.doc.save()
    expect(r.pageNum).toBe(2)
    expect(r.y).toBeGreaterThan(BOTTOM_LIMIT)
    expect(r.page.node.Resources()?.get(PDFName.of('XObject'))).toBeDefined()
    expect(text.mock.calls.map(c => c[0]).join(' ')).toContain('Inspector Test')
    expect(text.mock.calls.map(c => c[0]).join(' ')).toContain('2026-09-09 15:20:00.931 UTC')
  })
  it('distinguishes unsigned roles from signed records without a stored trace', async () => {
    const r = await Renderer.create(); r.newPage(); const text = vi.spyOn(r, 'drawText')
    await drawItrSignatures(r, [{role: 'executor', signed_at: '2026-09-09T15:20:00Z', profiles: null, signature_image: null}])
    const labels = text.mock.calls.map(c => c[0])
    expect(labels).toContain('Sin trazo almacenado')
    expect(labels.filter(l => l === 'Pendiente de firma')).toHaveLength(2)
  })
  it('marks a corrupt stored trace visibly instead of omitting it silently', async () => {
    const r = await Renderer.create(); r.newPage(); const text = vi.spyOn(r, 'drawText')
    await drawItrSignatures(r, [{role: 'executor', signed_at: '2026-09-09T15:20:00Z', profiles: {full_name: 'Test'}, signature_image: 'data:image/png;base64,AAAA'}])
    expect(text.mock.calls.map(c => c[0])).toContain('Trazo no disponible: imagen inválida')
  })
})
