/**
 * P4 (plan referente; decisión de Luis 2026-10-23: «solo ese sistema»): PDF LOSH de un sistema. Formal, bilingüe.
 *  - Portada A4: sistema, índice de hojas (plano, revisión, páginas, marcas, por revisar) y controles (pines
 *    cruzados, conectores sin par, hojas que no entraron).
 *  - Después, cada página vigente del P&ID donde el sistema tiene marcas, copiada del PDF original, con SOLO sus
 *    marcas encima: recorrido resaltado translúcido en su color, límites con el código de cada lado, etiquetas y
 *    conectores a otra hoja; y un sello arriba a la izquierda.
 * Las marcas están en unidad 0..1 de la hoja como se ve; `toPdfPoint` las lleva al espacio sin rotar de pdf-lib
 * (CropBox = la caja que muestra pdf.js) y los textos se giran con la hoja para leerse derechos.
 */

import { PDFDocument, LineCapStyle, degrees, rgb, type PDFPage } from 'pdf-lib'
import { Renderer, COLOR, A4_W, MARGIN, FOOTER_H, sanitize, bi, type TableCol, type Color } from './renderer'
import { drawBrandBar, drawRecordQr, type PdfBranding } from './branding'
import { todayIn } from '@/lib/time/zone'
import { normalizeRotation, rotatedSize, toPdfPoint, type Pt, type Rotation } from '@/lib/pid/geometry'
import { displayPoints, labelText, limitNormal, markupMetrics, type Markup } from '@/lib/pid/markups'
import { connectorText } from '@/lib/pid/control'
import type { SystemLosh } from '@/lib/pid/losh-server'

export type LoshPdfInput = {
  projectName: string
  projectCode: string
  timezone: string | null
  branding?: PdfBranding | null
  losh: SystemLosh
  /** PDF original de cada revisión (por id de revisión); lo que falta va en `omitted`. */
  sources: Record<string, Uint8Array>
  omitted: { number: string; reason: string }[]
  /** QR a la pestaña Planos de la ficha del sistema. */
  recordUrl?: string | null
}

const INK = rgb(0.078, 0.129, 0.239) // #14213d, como el visor
const HIGHLIGHT_OPACITY = 0.45

function hexToRgb(hex: string): Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return COLOR.muted
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Página del plano con las marcas del sistema encima. */
function overlayPage(r: Renderer, page: PDFPage, markups: Markup[], x: {
  losh: SystemLosh; color: Color; stamp: string[]
}) {
  const rotation: Rotation = normalizeRotation(page.getRotation().angle)
  const box = page.getCropBox()
  const seen = rotatedSize({ w: box.width, h: box.height }, rotation)
  const m = markupMetrics(seen)
  const sys = x.losh.system
  const code = (id: string) => x.losh.codes[id] ?? '?'
  /** Punto en puntos de la hoja como se ve (origen arriba a la izquierda) → pdf-lib. */
  const at = (p: Pt) => toPdfPoint({ x: p.x / seen.w, y: p.y / seen.h }, rotation, box)
  const P = (u: Pt) => ({ x: u.x * seen.w, y: u.y * seen.h })
  const font = r.fontBold

  const polygon = (pts: Pt[], fill: Color, opacity = 1) => {
    const d = pts.map((p, i) => { const q = at(p); return `${i ? 'L' : 'M'}${q.x.toFixed(2)} ${(-q.y).toFixed(2)}` }).join(' ') + ' Z'
    page.drawSvgPath(d, { x: 0, y: 0, color: fill, opacity })
  }
  const text = (s: string, start: Pt, size: number, color: Color) => {
    const q = at(start)
    page.drawText(sanitize(s), { x: q.x, y: q.y, size, font, color, rotate: degrees(rotation) })
  }
  /** Chip centrado en `c` (puntos de la hoja como se ve). */
  const chip = (c: Pt, s: string, fill: Color, size = m.font) => {
    const t = sanitize(s)
    const w = font.widthOfTextAtSize(t, size) + size * 0.9
    const h = size * 1.6
    polygon([{ x: c.x - w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y + h / 2 }, { x: c.x - w / 2, y: c.y + h / 2 }], fill)
    text(t, { x: c.x - w / 2 + size * 0.45, y: c.y + size * 0.35 }, size, COLOR.white)
    return { w, h }
  }

  const pts = (mk: Markup) => displayPoints(mk, rotation).map(P)

  // 1. Recorridos del sistema (debajo de todo).
  for (const mk of markups.filter(k => k.kind === 'line' && k.system_id === sys.id)) {
    const q = pts(mk).map(at)
    if (q.length < 2) continue
    const d = q.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join(' ')
    page.drawSvgPath(d, { x: 0, y: 0, borderColor: x.color, borderWidth: m.highlight, borderOpacity: HIGHLIGHT_OPACITY, borderLineCap: LineCapStyle.Round })
  }

  // 2. Límites donde el sistema está a un lado u otro: barra oscura y el código de cada lado (como el visor).
  for (const mk of markups.filter(k => k.kind === 'limit')) {
    const unit = displayPoints(mk, rotation)
    if (unit.length !== 2) continue
    const [a, b] = unit.map(P)
    const qa = at(a), qb = at(b)
    page.drawLine({ start: qa, end: qb, thickness: m.barStroke, color: INK })
    const n = limitNormal(unit as [Pt, Pt], seen)
    const vertical = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x)
    const end = vertical ? (a.y <= b.y ? a : b) : (a.x >= b.x ? a : b)
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const len = Math.hypot(end.x - c.x, end.y - c.y) || 1
    const u = { x: (end.x - c.x) / len, y: (end.y - c.y) / len }
    const gap = m.font * 0.35
    for (const [sid, sign] of [[mk.system_id, -1], [mk.other_system_id, 1]] as const) {
      if (!sid) continue
      const label = code(sid)
      const w = font.widthOfTextAtSize(sanitize(label), m.font) + m.font * 0.9, h = m.font * 1.6
      const along = (Math.abs(u.x) * w + Math.abs(u.y) * h) / 2 + gap
      const across = (Math.abs(n.x) * w + Math.abs(n.y) * h) / 2 + gap
      chip({ x: end.x + u.x * along + sign * n.x * across, y: end.y + u.y * along + sign * n.y * across }, label, sid === sys.id ? x.color : INK)
    }
  }

  // 3. Etiquetas del sistema.
  for (const mk of markups.filter(k => k.kind === 'label' && k.system_id === sys.id)) {
    const [c] = pts(mk)
    if (c) chip(c, labelText(mk, code), x.color)
  }

  // 4. Conectores del sistema: flecha fuera de hoja con el número de la hoja destino.
  for (const mk of markups.filter(k => k.kind === 'connector' && k.system_id === sys.id)) {
    const [c] = pts(mk)
    if (!c) continue
    const target = mk.target_document_id ? { number: x.losh.pidNumbers[mk.target_document_id] ?? '?' } : null
    const label = sanitize(connectorText(target, mk.target_page, 'h.'))
    const size = m.font
    const h = size * 1.8, w = font.widthOfTextAtSize(label, size) + size * 1.4 + h / 2
    const x0 = c.x - w / 2, y0 = c.y - h / 2
    polygon([{ x: x0, y: y0 }, { x: x0 + w - h / 2, y: y0 }, { x: x0 + w, y: c.y }, { x: x0 + w - h / 2, y: y0 + h }, { x: x0, y: y0 + h }], x.color)
    text(label, { x: x0 + size * 0.6, y: c.y + size * 0.35 }, size, COLOR.white)
  }

  // 5. Sello arriba a la izquierda (fondo blanco, borde del color del sistema).
  const size = m.font * 0.9
  const pad = size * 0.6
  const lines = x.stamp.map(sanitize)
  const w = Math.max(...lines.map((l, i) => (i === 0 ? font : r.fontRegular).widthOfTextAtSize(l, size))) + pad * 2
  const h = lines.length * size * 1.35 + pad * 1.4
  const o = { x: m.font * 2, y: m.font * 2 }
  polygon([{ x: o.x, y: o.y }, { x: o.x + w, y: o.y }, { x: o.x + w, y: o.y + h }, { x: o.x, y: o.y + h }], x.color)
  const inset = m.barStroke
  polygon([{ x: o.x + inset, y: o.y + inset }, { x: o.x + w - inset, y: o.y + inset }, { x: o.x + w - inset, y: o.y + h - inset }, { x: o.x + inset, y: o.y + h - inset }], COLOR.white)
  lines.forEach((l, i) => {
    const q = at({ x: o.x + pad, y: o.y + pad + size * (1 + i * 1.35) - size * 0.2 })
    page.drawText(l, { x: q.x, y: q.y, size, font: i === 0 ? font : r.fontRegular, color: i === 0 ? INK : COLOR.textLight, rotate: degrees(rotation) })
  })
}

export async function renderLoshPdf(x: LoshPdfInput): Promise<Uint8Array> {
  const { losh } = x
  const sys = losh.system
  const r = await Renderer.create()
  r.doc.setTitle(`Límites de sistema / System boundaries ${sys.code}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Planos de límites del sistema / System boundary drawings')
  const generatedAt = todayIn(x.timezone)
  const color = hexToRgb(sys.color)

  // Los PDF originales se abren antes de la portada: lo que no abre (cifrado, dañado) se lista en ella.
  const omitted = [...x.omitted]
  const loaded = new Map<string, PDFDocument>()
  for (const sheet of losh.sheets) {
    const bytes = x.sources[sheet.revision_id]
    if (!bytes) continue
    try {
      const src = await PDFDocument.load(bytes, { updateMetadata: false })
      loaded.set(sheet.revision_id, src)
      const missing = sheet.pages.filter(p => p > src.getPageCount())
      if (missing.length) omitted.push({ number: sheet.number, reason: bi(`el PDF no tiene la página ${missing.join(', ')}`, `the PDF has no page ${missing.join(', ')}`) })
    } catch {
      omitted.push({ number: sheet.number, reason: bi('PDF cifrado o dañado', 'encrypted or damaged PDF') })
    }
  }

  r.setFooter(({ page }) => {
    const footerY = MARGIN
    page.drawLine({ start: { x: MARGIN, y: footerY + FOOTER_H - 4 }, end: { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 }, thickness: 0.5, color: COLOR.borderLight })
    page.drawText(sanitize(`CommUp · ${bi('Límites', 'Boundaries')} ${sys.code} · ${x.projectCode}`), { x: MARGIN, y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    const right = sanitize(`Generado / Generated: ${generatedAt}`)
    page.drawText(right, { x: A4_W - MARGIN - r.fontRegular.widthOfTextAtSize(right, 7), y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
  })

  // ── Portada ──
  r.newPage()
  await drawBrandBar(r, x.branding)
  const qrSize = 58
  const topY = r.y
  if (x.recordUrl) drawRecordQr(r, x.recordUrl, A4_W - MARGIN - qrSize, topY, qrSize)
  r.drawText(bi('Planos de límites del sistema', 'System boundary drawings'), { x: MARGIN, y: r.y - 16, size: 16, bold: true, color: COLOR.text, maxWidth: A4_W - MARGIN * 2 - qrSize - 12 })
  r.moveY(24)
  r.drawRect({ x: MARGIN, y: r.y - 12, width: 12, height: 12, color })
  r.drawText(`${sys.code} — ${sys.name}`, { x: MARGIN + 18, y: r.y - 11, size: 12, bold: true, color: COLOR.text, maxWidth: A4_W - MARGIN * 2 - qrSize - 30 })
  r.moveY(20)
  r.drawText(`${bi('Proyecto', 'Project')}: ${x.projectCode} · ${x.projectName}`, { x: MARGIN, y: r.y - 9, size: 9, color: COLOR.muted, maxWidth: A4_W - MARGIN * 2 - qrSize - 12 })
  r.moveY(14)
  r.y = Math.min(r.y, topY - qrSize - 22)
  r.moveY(6)

  const pages = losh.sheets.reduce((n, s) => n + s.pages.length, 0)
  const marks = losh.sheets.reduce((n, s) => n + s.markups.length, 0)
  const review = losh.sheets.reduce((n, s) => n + s.review, 0)
  // Rótulo en español y el inglés debajo: en cuatro columnas el bilingüe en una línea no entra.
  const drawings = losh.sheets.length
  r.infoCardRow([
    { label: 'Hojas', value: String(pages), sub: `Sheets · ${drawings} ${drawings === 1 ? 'plano / drawing' : 'planos / drawings'}` },
    { label: 'Marcas', value: String(marks), sub: review ? `Marks · ${review} por revisar / to review` : 'Marks' },
    { label: 'Pines cruzados', value: String(losh.conflicts.length), sub: 'Crossed pins' },
    { label: 'Conectores sin par', value: String(losh.unpaired.length), sub: 'Unpaired connectors' },
  ], { height: 42 })

  r.accentSection(bi('Hojas incluidas', 'Included sheets'), color)
  if (losh.sheets.length === 0) {
    r.empty(bi('El sistema no tiene límites marcados en las revisiones vigentes.', 'The system has no limits marked on the current revisions.'))
  } else {
    const cols: TableCol[] = [
      { label: 'Plano', labelEn: 'Drawing', w: 190, bold: true },
      { label: 'Revisión', labelEn: 'Revision', w: 70 },
      { label: 'Páginas', labelEn: 'Pages', w: 100 },
      { label: 'Marcas', labelEn: 'Marks', w: 70, align: 'right' },
      { label: 'Por revisar', labelEn: 'To review', w: 93, align: 'right' },
    ]
    r.tableHeader(cols)
    losh.sheets.forEach((s, i) => r.tableRow(cols,
      [s.number, `${s.rev} · ${s.rev_status.toUpperCase()}`, s.pages.join(', '), String(s.markups.length), s.review ? String(s.review) : '—'],
      { alternate: i % 2 === 1, valueColors: [null, null, null, null, s.review ? COLOR.amber : null] }))
  }

  r.accentSection(bi('Controles', 'Checks'), color)
  r.paragraph(bi(
    'Pin cruzado: el pin de un tag cae sobre el recorrido resaltado de otro sistema y no sobre el suyo. Conector sin par: la otra hoja no tiene un conector del mismo sistema que vuelva a esta.',
    'Crossed pin: a tag pin sits on another system’s highlighted run and not on its own. Unpaired connector: the other sheet has no connector of the same system pointing back.',
  ), { size: 8, color: COLOR.muted })
  r.moveY(4)
  if (losh.conflicts.length === 0 && losh.unpaired.length === 0) {
    r.empty(bi('Sin observaciones.', 'No findings.'))
  }
  if (losh.conflicts.length) {
    const cols: TableCol[] = [
      { label: 'Plano', labelEn: 'Drawing', w: 150, bold: true },
      { label: 'Página', labelEn: 'Page', w: 50, align: 'center' },
      { label: 'Tag', labelEn: 'Tag', w: 133 },
      { label: 'Sistema del tag', labelEn: 'Tag system', w: 95 },
      { label: 'Cae sobre', labelEn: 'Sits on', w: 95 },
    ]
    r.tableHeader(cols)
    losh.conflicts.forEach((c, i) => r.tableRow(cols,
      [c.number, String(c.page_num), c.tag_number, losh.codes[c.system_id] ?? '?', losh.codes[c.other_system_id] ?? '?'],
      { alternate: i % 2 === 1, valueColors: [null, null, null, null, COLOR.amber] }))
    r.moveY(6)
  }
  if (losh.unpaired.length) {
    const cols: TableCol[] = [
      { label: 'Plano', labelEn: 'Drawing', w: 170, bold: true },
      { label: 'Página', labelEn: 'Page', w: 60, align: 'center' },
      { label: 'Sigue en', labelEn: 'Continues on', w: 233 },
      { label: 'Página', labelEn: 'Page', w: 60, align: 'center' },
    ]
    r.tableHeader(cols)
    losh.unpaired.forEach((c, i) => r.tableRow(cols,
      [c.number, String(c.page_num), c.target_number ?? bi('(destino borrado)', '(target deleted)'), c.target_page ? String(c.target_page) : '—'],
      { alternate: i % 2 === 1 }))
  }
  if (omitted.length) {
    r.accentSection(bi('Hojas no incluidas', 'Sheets not included'), COLOR.amber)
    for (const o of omitted) r.paragraph(`${o.number}: ${o.reason}`, { size: 8.5, color: COLOR.amber })
  }

  // ── Hojas del plano con las marcas ──
  for (const sheet of losh.sheets) {
    const src = loaded.get(sheet.revision_id)
    if (!src) continue
    const indexes = sheet.pages.map(p => p - 1).filter(i => i >= 0 && i < src.getPageCount())
    const copied = await r.doc.copyPages(src, indexes)
    copied.forEach((page, i) => {
      r.doc.addPage(page)
      const num = indexes[i] + 1
      overlayPage(r, page, sheet.markups.filter(mk => mk.page_num === num), {
        losh, color,
        stamp: [
          `${bi('Límites', 'Boundaries')} · ${sys.code} — ${sys.name}`,
          `${sheet.number} · Rev. ${sheet.rev} · ${bi('Hoja', 'Sheet')} ${num}`,
          `CommUp · ${x.projectCode} · ${generatedAt}`,
        ],
      })
    })
  }

  return r.doc.save()
}
