import type { PDFImage } from 'pdf-lib'
import { COLOR, CONTENT_W, MARGIN, type Renderer, wrapText } from './renderer'

export type ItrPdfSignature = {
  role: string
  signed_at: string
  profiles: { full_name: string } | null
  signature_image?: string | null
}

/** Render the stored trace only; never substitute or reconstruct a person's signature. */
export async function drawItrSignatures(r: Renderer, signatures: ItrPdfSignature[]): Promise<void> {
  const gap = 14
  const width = (CONTENT_W - gap * 2) / 3
  const boxes = await Promise.all(['executor', 'supervisor', 'client'].map(async role => {
    const sig = signatures.find(s => s.role === role)
    let image: PDFImage | undefined
    let imageLabel = sig ? 'Sin trazo almacenado' : 'Pendiente de firma'
    if (sig?.signature_image) {
      try {
        // Stored canvas signatures are PNG data URLs. JPEG is supported for historical imports.
        if (/^data:image\/png;base64,/i.test(sig.signature_image)) image = await r.doc.embedPng(sig.signature_image)
        else if (/^data:image\/jpe?g;base64,/i.test(sig.signature_image)) image = await r.doc.embedJpg(sig.signature_image)
        else throw new Error('Unsupported signature encoding')
      } catch {
        imageLabel = 'Trazo no disponible: imagen inválida'
      }
    }
    const name = sig ? sig.profiles?.full_name ?? 'Usuario registrado (nombre no disponible)' : ''
    const parsedDate = sig ? new Date(sig.signed_at) : null
    const date = parsedDate && Number.isFinite(parsedDate.getTime())
      ? parsedDate.toISOString().replace('T', ' ').replace('Z', ' UTC')
      : sig ? 'Fecha registrada no válida' : ''
    return {role, image, imageLabel, nameLines: wrapText(name, r.fontRegular, 9, width), dateLines: wrapText(date, r.fontRegular, 7, width)}
  }))
  const metadataLines = Math.max(...boxes.map(b => b.nameLines.length * 12 + b.dateLines.length * 10))
  const height = 120 + metadataLines
  r.ensureSpace(height)
  r.drawHLine(MARGIN, MARGIN + CONTENT_W, r.y, 1, COLOR.border)
  r.drawText('FIRMAS / SIGNATURES', {x: MARGIN, y: r.y - 16, size: 9, bold: true, color: COLOR.muted})
  const top = r.y - 30
  boxes.forEach((b, index) => {
    const x = MARGIN + index * (width + gap)
    r.drawRect({x, y: top - 2, width, height: 2, color: COLOR.purple})
    r.drawText(b.role.toUpperCase(), {x, y: top - 15, size: 8, bold: true, color: COLOR.muted})
    if (b.image) {
      const size = b.image.scaleToFit(width, 56)
      r.page.drawImage(b.image, {x: x + (width - size.width) / 2, y: top - 78 + (56 - size.height) / 2, width: size.width, height: size.height})
    } else {
      wrapText(b.imageLabel, r.fontRegular, 7.5, width).forEach((line, i) => {
        r.drawText(line, {x, y: top - 40 - i * 10, size: 7.5, color: b.imageLabel.includes('inválida') ? COLOR.red : COLOR.muted})
      })
    }
    let y = top - 94
    for (const line of b.nameLines) { r.drawText(line, {x, y, size: 9}); y -= 12 }
    for (const line of b.dateLines) { r.drawText(line, {x, y, size: 7, color: COLOR.muted}); y -= 10 }
  })
  r.moveY(height)
}
