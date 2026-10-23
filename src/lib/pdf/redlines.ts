/**
 * F-21c (plan referente § P): PDF de red-lines de un sistema, anexo del paquete de handover. Formal, bilingüe.
 *  - Portada A4: sistema, conteo por estado y la tabla de todos sus red-lines (plano, revisión, hoja, estado, qué cambió,
 *    quién lo creó y quién lo revisó).
 *  - Después, cada página del P&ID con red-lines SIN incorporar (abiertos o aceptados), copiada del PDF original de
 *    su revisión, con sus marcas encima del color de su estado y su número; y un sello arriba a la izquierda.
 * Las marcas están en unidad 0..1 de la hoja como se ve; `toPdfPoint` las lleva al espacio sin rotar de pdf-lib (igual
 * que el PDF de límites) y los textos se giran con la hoja.
 */

import { PDFDocument, degrees, rgb, type PDFPage } from 'pdf-lib'
import { Renderer, COLOR, A4_W, MARGIN, FOOTER_H, sanitize, bi, type TableCol, type Color } from './renderer'
import { drawBrandBar, drawRecordQr, type PdfBranding } from './branding'
import { todayIn } from '@/lib/time/zone'
import { normalizeRotation, rotatedSize, toPdfPoint, type Pt, type Rotation } from '@/lib/pid/geometry'
import { markupMetrics } from '@/lib/pid/markups'
import { cloudPoints, displayMarks, redlineAnchor, REDLINE_STATUS_STYLE, REDLINE_STATUSES, type Redline, type RedlineStatus } from '@/lib/pid/redlines'

export type RedlinePdfItem = Pick<Redline, 'id' | 'number' | 'page_num' | 'status' | 'description' | 'marks' | 'page_rotation' | 'created_at' | 'reviewed_at' | 'review_note'> & {
  revision_id: string
  document_number: string
  rev: string
  incorporated_rev: string | null
  created_by_name: string
  reviewed_by_name: string | null
}

export type RedlinesPdfInput = {
  projectName: string
  projectCode: string
  timezone: string | null
  branding?: PdfBranding | null
  system: { code: string; name: string; color: string }
  redlines: RedlinePdfItem[]
  /** PDF original de cada revisión con red-lines sin incorporar (por id de revisión); lo que falta va en `omitted`. */
  sources: Record<string, Uint8Array>
  omitted: { number: string; reason: string }[]
  /** QR a la pestaña Planos de la ficha del sistema. */
  recordUrl?: string | null
}

const STATUS_LABEL: Record<RedlineStatus, [string, string]> = {
  open: ['Abierta', 'Open'], accepted: ['Aceptada', 'Accepted'], rejected: ['Rechazada', 'Rejected'], incorporated: ['Incorporada', 'Incorporated'],
}

function hexToRgb(hex: string): Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return COLOR.muted
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Red-lines pendientes de incorporar (los que se dibujan sobre el plano). */
export const pendingForDrawing = (list: Pick<RedlinePdfItem, 'status'>[]) => list.filter(r => r.status === 'open' || r.status === 'accepted')

/** Página del plano con los red-lines encima. */
function overlayPage(r: Renderer, page: PDFPage, items: RedlinePdfItem[], stamp: string[]) {
  const rotation: Rotation = normalizeRotation(page.getRotation().angle)
  const box = page.getCropBox()
  const seen = rotatedSize({ w: box.width, h: box.height }, rotation)
  const m = markupMetrics(seen)
  const at = (p: Pt) => toPdfPoint({ x: p.x / seen.w, y: p.y / seen.h }, rotation, box)
  const P = (u: Pt) => ({ x: u.x * seen.w, y: u.y * seen.h })
  const font = r.fontBold
  const stroke = m.barStroke * 0.9
  const svg = (pts: Pt[], close: boolean) =>
    pts.map((p, i) => { const q = at(p); return `${i ? 'L' : 'M'}${q.x.toFixed(2)} ${(-q.y).toFixed(2)}` }).join(' ') + (close ? ' Z' : '')
  const circle = (c: Pt, rad: number, n = 24) => Array.from({ length: n }, (_, i) => ({ x: c.x + rad * Math.cos((2 * Math.PI * i) / n), y: c.y + rad * Math.sin((2 * Math.PI * i) / n) }))
  const text = (s: string, start: Pt, size: number, color: Color) => {
    const q = at(start)
    page.drawText(sanitize(s), { x: q.x, y: q.y, size, font, color, rotate: degrees(rotation) })
  }

  for (const it of items) {
    const color = hexToRgb(REDLINE_STATUS_STYLE[it.status].ink)
    const marks = displayMarks(it, rotation)
    for (const mk of marks) {
      if (mk.k === 'cloud') {
        page.drawSvgPath(svg(cloudPoints(mk.p[0], mk.p[1], seen, Math.min(seen.w, seen.h) * 0.018), true), { x: 0, y: 0, borderColor: color, borderWidth: stroke, color, opacity: 0.06 })
      } else if (mk.k === 'pen') {
        page.drawSvgPath(svg(mk.p.map(P), false), { x: 0, y: 0, borderColor: color, borderWidth: stroke * 1.2 })
      } else if (mk.k === 'text') {
        text(mk.t ?? '', P(mk.p[0]), m.font * 1.25, color)
      } else {
        const c = P(mk.p[0])
        page.drawSvgPath(svg(circle(c, m.font * 1.3), true), { x: 0, y: 0, borderColor: color, borderWidth: stroke, color, opacity: 0.18 })
        page.drawSvgPath(svg(circle(c, m.font * 0.35), true), { x: 0, y: 0, color })
      }
    }
    // Número en un círculo en el ancla (esquina de la nube o primer punto), como el visor.
    const anchor = redlineAnchor(marks)
    if (anchor) {
      const c = P(anchor)
      const rad = m.font * 1.15
      page.drawSvgPath(svg(circle(c, rad), true), { x: 0, y: 0, color, borderColor: COLOR.white, borderWidth: stroke })
      const label = String(Number(it.number.replace(/\D/g, '')))
      const w = font.widthOfTextAtSize(label, m.font * 0.95)
      text(label, { x: c.x - w / 2, y: c.y + m.font * 0.33 }, m.font * 0.95, COLOR.white)
    }
  }

  // Sello arriba a la izquierda (fondo blanco, borde rojo).
  const red = hexToRgb(REDLINE_STATUS_STYLE.open.ink)
  const size = m.font * 0.9
  const pad = size * 0.6
  const lines = stamp.map(sanitize)
  const w = Math.max(...lines.map((l, i) => (i === 0 ? font : r.fontRegular).widthOfTextAtSize(l, size))) + pad * 2
  const h = lines.length * size * 1.35 + pad * 1.4
  const o = { x: m.font * 2, y: m.font * 2 }
  const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  page.drawSvgPath(svg(rect(o.x, o.y, o.x + w, o.y + h), true), { x: 0, y: 0, color: red })
  page.drawSvgPath(svg(rect(o.x + m.barStroke, o.y + m.barStroke, o.x + w - m.barStroke, o.y + h - m.barStroke), true), { x: 0, y: 0, color: COLOR.white })
  lines.forEach((l, i) => {
    const q = at({ x: o.x + pad, y: o.y + pad + size * (1 + i * 1.35) - size * 0.2 })
    page.drawText(l, { x: q.x, y: q.y, size, font: i === 0 ? font : r.fontRegular, color: i === 0 ? red : COLOR.textLight, rotate: degrees(rotation) })
  })
}

export async function renderRedlinesPdf(x: RedlinesPdfInput): Promise<Uint8Array> {
  const sys = x.system
  const r = await Renderer.create()
  r.doc.setTitle(`Red-line de campo / Field red-lines ${sys.code}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Red-line de campo / Field red-lines')
  const generatedAt = todayIn(x.timezone)
  const accent = hexToRgb(REDLINE_STATUS_STYLE.open.ink)

  // Hojas a dibujar: (revisión, página) con red-lines sin incorporar.
  const pending = pendingForDrawing(x.redlines) as RedlinePdfItem[]
  const omitted = [...x.omitted]
  const loaded = new Map<string, PDFDocument>()
  for (const revId of new Set(pending.map(p => p.revision_id))) {
    const bytes = x.sources[revId]
    if (!bytes) continue
    try { loaded.set(revId, await PDFDocument.load(bytes, { updateMetadata: false })) }
    catch {
      const n = pending.find(p => p.revision_id === revId)
      omitted.push({ number: n ? `${n.document_number} rev ${n.rev}` : revId, reason: bi('PDF cifrado o dañado', 'encrypted or damaged PDF') })
    }
  }

  r.setFooter(({ page }) => {
    const footerY = MARGIN
    page.drawLine({ start: { x: MARGIN, y: footerY + FOOTER_H - 4 }, end: { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 }, thickness: 0.5, color: COLOR.borderLight })
    page.drawText(sanitize(`CommUp · Red-line ${sys.code} · ${x.projectCode}`), { x: MARGIN, y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    const right = sanitize(`Generado / Generated: ${generatedAt}`)
    page.drawText(right, { x: A4_W - MARGIN - r.fontRegular.widthOfTextAtSize(right, 7), y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
  })

  // ── Portada ──
  r.newPage()
  await drawBrandBar(r, x.branding)
  const qrSize = 58
  const topY = r.y
  if (x.recordUrl) drawRecordQr(r, x.recordUrl, A4_W - MARGIN - qrSize, topY, qrSize)
  r.drawText(bi('Red-line de campo', 'Field red-lines'), { x: MARGIN, y: r.y - 16, size: 16, bold: true, color: COLOR.text, maxWidth: A4_W - MARGIN * 2 - qrSize - 12 })
  r.moveY(24)
  r.drawRect({ x: MARGIN, y: r.y - 12, width: 12, height: 12, color: hexToRgb(sys.color) })
  r.drawText(`${sys.code} — ${sys.name}`, { x: MARGIN + 18, y: r.y - 11, size: 12, bold: true, color: COLOR.text, maxWidth: A4_W - MARGIN * 2 - qrSize - 30 })
  r.moveY(20)
  r.drawText(`${bi('Proyecto', 'Project')}: ${x.projectCode} · ${x.projectName}`, { x: MARGIN, y: r.y - 9, size: 9, color: COLOR.muted, maxWidth: A4_W - MARGIN * 2 - qrSize - 12 })
  r.moveY(14)
  r.y = Math.min(r.y, topY - qrSize - 22)
  r.moveY(6)

  const count = (s: RedlineStatus) => x.redlines.filter(it => it.status === s).length
  r.infoCardRow(REDLINE_STATUSES.map(s => ({ label: STATUS_LABEL[s][0], value: String(count(s)), sub: STATUS_LABEL[s][1] })), { height: 42 })

  r.accentSection(bi('Red-lines del sistema', 'System red-lines'), accent)
  r.paragraph(bi(
    'Diferencias entre el plano y lo construido marcadas en campo. Las abiertas y aceptadas aún no están en el plano: se dibujan en las hojas que siguen.',
    'Differences between the drawing and the as-built state marked in the field. Open and accepted ones are not yet on the drawing: they are drawn on the following sheets.',
  ), { size: 8, color: COLOR.muted })
  r.moveY(4)
  if (x.redlines.length === 0) {
    r.empty(bi('El sistema no tiene red-lines.', 'The system has no red-lines.'))
  } else {
    const cols: TableCol[] = [
      { label: 'N.º', labelEn: 'No.', w: 52, bold: true },
      { label: 'Plano · rev · hoja', labelEn: 'Drawing · rev · sheet', w: 108 },
      { label: 'Estado', labelEn: 'Status', w: 90 },
      { label: 'Qué cambió', labelEn: 'What changed', w: 146 },
      { label: 'Creó / revisó', labelEn: 'Raised / reviewed', w: 127 },
    ]
    r.tableHeader(cols)
    x.redlines.forEach((it, i) => {
      const status = `${STATUS_LABEL[it.status][0]}${it.incorporated_rev ? ` · rev ${it.incorporated_rev}` : ''}`
      const who = [it.created_by_name, it.reviewed_by_name].filter(Boolean).join(' / ')
      const desc = it.status === 'rejected' && it.review_note ? `${it.description} — ${it.review_note}` : it.description
      r.tableRow(cols, [it.number, `${it.document_number} · ${it.rev} · ${it.page_num}`, status, desc, who],
        { alternate: i % 2 === 1, valueColors: [null, null, hexToRgb(REDLINE_STATUS_STYLE[it.status].ink), null, null] })
    })
  }
  if (omitted.length) {
    r.accentSection(bi('Hojas no incluidas', 'Sheets not included'), COLOR.amber)
    for (const o of omitted) r.paragraph(`${o.number}: ${o.reason}`, { size: 8.5, color: COLOR.amber })
  }

  // ── Hojas del plano con los red-lines sin incorporar ──
  const groups = new Map<string, RedlinePdfItem[]>()
  for (const it of pending) {
    const key = `${it.revision_id}#${it.page_num}`
    groups.set(key, [...(groups.get(key) ?? []), it])
  }
  for (const [key, items] of groups) {
    const src = loaded.get(key.split('#')[0])
    if (!src) continue
    const idx = items[0].page_num - 1
    if (idx < 0 || idx >= src.getPageCount()) continue
    const [page] = await r.doc.copyPages(src, [idx])
    r.doc.addPage(page)
    overlayPage(r, page, items, [
      `Red-line · ${sys.code} — ${sys.name}`,
      `${items[0].document_number} · Rev. ${items[0].rev} · ${bi('Hoja', 'Sheet')} ${items[0].page_num} · ${items.map(i => i.number).join(', ')}`,
      `CommUp · ${x.projectCode} · ${generatedAt}`,
    ])
  }

  return r.doc.save()
}
