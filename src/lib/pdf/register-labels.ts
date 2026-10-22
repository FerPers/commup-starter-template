/**
 * Etiquetas QR imprimibles de registros controlados (fase 3, §8.9 del plan readiness).
 * Hoja A4 con 2 × 4 etiquetas recortables; una etiqueta suelta usa la misma hoja.
 * QR con qrcode-generator (JS puro, compatible con Workers), dibujado como rectángulos.
 */

import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { A4_H, A4_W, COLOR, drawQr, sanitize, truncateToWidth, wrapText } from './renderer'

export type RegisterLabel = {
  number: string
  kindLabel: string
  title: string
  project: string
  system: string | null
  url: string
}

export type LabelTexts = { scan: string; system: string; printed: string }

const MARGIN = 28
const GAP = 12
const COLS = 2
const ROWS = 4
const PAD = 10
const QR_SIZE = 140

function drawLabel(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }, l: RegisterLabel, texts: LabelTexts, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: COLOR.border, borderWidth: 0.75, borderDashArray: [4, 3] })
  drawQr(page, l.url, x + PAD - 6, y + h - PAD - QR_SIZE + 6, QR_SIZE)

  const tx = x + PAD + QR_SIZE
  const tw = w - (tx - x) - PAD
  let ty = y + h - PAD - 10
  const text = (s: string, size: number, font: PDFFont, color = COLOR.text) => {
    page.drawText(truncateToWidth(s, font, size, tw), { x: tx, y: ty, size, font, color })
  }
  text(l.kindLabel.toUpperCase(), 7.5, fonts.bold, COLOR.purple); ty -= 20
  // Sin estado impreso: en campo quedaría desactualizado; el QR muestra el estado real.
  text(l.number, 17, fonts.bold); ty -= 18
  for (const line of wrapText(l.title, fonts.regular, 8.5, tw).slice(0, 5)) {
    page.drawText(line, { x: tx, y: ty, size: 8.5, font: fonts.regular, color: COLOR.textLight })
    ty -= 11
  }

  // Pie: proyecto · sistema, y la instrucción de escaneo.
  const foot = sanitize(`${l.project}${l.system ? ` · ${texts.system} ${l.system}` : ''}`)
  page.drawText(truncateToWidth(foot, fonts.bold, 8, w - PAD * 2), { x: x + PAD, y: y + PAD + 12, size: 8, font: fonts.bold, color: COLOR.text })
  page.drawText(truncateToWidth(texts.scan, fonts.regular, 7, w - PAD * 2), { x: x + PAD, y: y + PAD, size: 7, font: fonts.regular, color: COLOR.muted })
}

export async function renderRegisterLabelsPdf(labels: RegisterLabel[], texts: LabelTexts): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) }
  const w = (A4_W - MARGIN * 2 - GAP * (COLS - 1)) / COLS
  const h = (A4_H - MARGIN * 2 - GAP * (ROWS - 1)) / ROWS
  const perPage = COLS * ROWS
  let page: PDFPage | null = null
  labels.forEach((l, i) => {
    const slot = i % perPage
    if (slot === 0) {
      page = doc.addPage([A4_W, A4_H])
      page.drawText(truncateToWidth(texts.printed, fonts.regular, 7, A4_W - MARGIN * 2), { x: MARGIN, y: A4_H - MARGIN + 10, size: 7, font: fonts.regular, color: COLOR.empty })
    }
    const col = slot % COLS
    const row = Math.floor(slot / COLS)
    drawLabel(page!, fonts, l, texts, MARGIN + col * (w + GAP), A4_H - MARGIN - (row + 1) * h - row * GAP, w, h)
  })
  if (!labels.length) doc.addPage([A4_W, A4_H])
  doc.setTitle('CommUp - etiquetas de registros')
  return doc.save()
}
