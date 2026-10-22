import { describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { allowedLogoUrl, logoKind, type PdfBranding } from './branding'
import { Renderer } from './renderer'
import { renderItrPdf, type ItrPdfData } from './itr'
import { renderCertificatePdf, type CertPdfData } from './certificate'

const BASE = 'https://abc.supabase.co'
// PNG de 1 × 1 válido.
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))

describe('allowedLogoUrl', () => {
  it('solo el bucket público de logos de nuestro Supabase, sin el ?v= de caché', () => {
    expect(allowedLogoUrl(`${BASE}/storage/v1/object/public/org-assets/org/logo.png?v=1`, BASE))
      .toBe(`${BASE}/storage/v1/object/public/org-assets/org/logo.png`)
    expect(allowedLogoUrl(`${BASE}/storage/v1/object/public/project-documents/x.png`, BASE)).toBeNull()
    expect(allowedLogoUrl('https://evil.example/storage/v1/object/public/org-assets/x.png', BASE)).toBeNull()
    expect(allowedLogoUrl(`${BASE}/storage/v1/object/public/org-assets/../secret`, BASE)).toBeNull()
    expect(allowedLogoUrl(null, BASE)).toBeNull()
    expect(allowedLogoUrl(`${BASE}/storage/v1/object/public/org-assets/x.png`, undefined)).toBeNull()
  })
})

describe('logoKind', () => {
  it('por los primeros bytes: PNG y JPG sí, WebP no', () => {
    expect(logoKind(PNG)).toBe('png')
    expect(logoKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpg')
    expect(logoKind(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBeNull()
  })
})

const branding: PdfBranding = { orgName: 'DEMO Refinería', orgLogo: { bytes: PNG, kind: 'png' }, clientName: 'Operador XYZ', clientLogo: null }

it('el ITR lleva la marca, el QR y ya no titula «CommUp»', async () => {
  const draw = vi.spyOn(Renderer.prototype, 'drawText')
  const right = vi.spyOn(Renderer.prototype, 'drawTextRight')
  const rect = vi.spyOn(PDFDocument.prototype, 'embedPng')
  const data: ItrPdfData = {
    itr_number: 'ITR-QA', status: 'approved', progress_pct: 100, scheduled_date: null, tags: null, projects: null, itr_signatures: [],
    itr_templates: { code: 'QA', title: 'Prueba', description: null, itr_template_sections: [] }, itr_responses: [],
    branding, recordUrl: 'https://commup.app/projects/p/tags/t/itrs/i',
  }
  try {
    const bytes = await renderItrPdf(data)
    const texts = [...draw.mock.calls, ...right.mock.calls].map(([t]) => t)
    expect(texts).toContain('Operador XYZ')
    expect(texts).not.toContain('CommUp')
    expect(rect).toHaveBeenCalled()
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  } finally { draw.mockRestore(); right.mockRestore(); rect.mockRestore() }
})

it('el certificado sin marca conserva «CommUp» y con QR deja espacio a los títulos', async () => {
  const draw = vi.spyOn(Renderer.prototype, 'drawText')
  const cert: CertPdfData = {
    id: 'c', certificate_number: 'MC-0001', title: 'Mechanical Completion A100-S02', status: 'issued', issued_date: '2026-10-22',
    notes: null, created_at: '2026-10-22', project_phases: null, subsystems: null, issued_by_profile: null,
    projectName: 'Planta GLP', projectCode: 'DEMO-GLP', projectClient: null, exceptions: [], itrs: [], signatures: [],
    recordUrl: 'https://commup.app/projects/p/certificates/c',
  }
  try {
    await renderCertificatePdf(cert)
    expect(draw.mock.calls.map(([t]) => t)).toContain('CommUp')
  } finally { draw.mockRestore() }
})
