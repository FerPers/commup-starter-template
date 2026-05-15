/**
 * Shared PDF renderer built on pdf-lib (Workers-native — no Node dependency).
 *
 * Replaces @react-pdf/renderer which failed to resolve its dynamic chunk inside
 * the OpenNext Worker bundle. Used by certificate, ITR, and handover PDFs.
 */

import { PDFDocument, type PDFPage, type PDFFont, StandardFonts, rgb, type RGB } from 'pdf-lib'

export const A4_W = 595.28
export const A4_H = 841.89
export const MARGIN = 36
export const CONTENT_W = A4_W - MARGIN * 2
export const FOOTER_H = 22
export const BOTTOM_LIMIT = MARGIN + FOOTER_H

export const COLOR = {
  text:         rgb(0.059, 0.090, 0.165),
  textLight:    rgb(0.118, 0.161, 0.231),
  muted:        rgb(0.392, 0.455, 0.545),
  empty:        rgb(0.580, 0.639, 0.722),
  border:       rgb(0.796, 0.835, 0.882),
  borderLight:  rgb(0.886, 0.910, 0.941),
  borderXlight: rgb(0.945, 0.961, 0.976),
  cardBg:       rgb(0.973, 0.980, 0.988),
  white:        rgb(1, 1, 1),
  // Brand
  purple:       rgb(0.486, 0.227, 0.929),
  purpleBg:     rgb(0.957, 0.929, 0.996),
  // Status
  green:        rgb(0.086, 0.396, 0.204),
  greenBg:      rgb(0.863, 0.988, 0.906),
  greenStrong:  rgb(0.086, 0.639, 0.290),
  blue:         rgb(0.149, 0.388, 0.922),
  blueBg:       rgb(0.859, 0.918, 0.996),
  red:          rgb(0.600, 0.106, 0.106),
  redBg:        rgb(0.996, 0.886, 0.886),
  amber:        rgb(0.573, 0.251, 0.055),
  amberBg:      rgb(1.000, 0.973, 0.918),
  amberBorder:  rgb(0.992, 0.878, 0.541),
}

export type Color = RGB

/**
 * StandardFonts.Helvetica uses WinAnsi encoding which rejects characters
 * outside Latin-1. Map common non-WinAnsi glyphs (arrows, check marks, emojis)
 * to ASCII; fall back to '?' for anything else. Applied to every drawText.
 */
const UNICODE_MAP: Record<string, string> = {
  '→': '->', '←': '<-', '↑': '^', '↓': 'v',
  '⇒': '=>', '⇐': '<=',
  '✓': 'OK', '✔': 'OK', '✗': 'X', '✘': 'X',
  '—': '-', '–': '-', '…': '...',
  '“': '"', '”': '"', '‘': "'", '’': "'",
  '📷': '[photo]', '✍': '[sig]',
  ' ': ' ',
}

export function sanitize(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).replace(/[^\x00-\xFF]/g, (c) => UNICODE_MAP[c] ?? '?')
}

export function truncateToWidth(rawText: string, font: PDFFont, size: number, maxWidth: number): string {
  const text = sanitize(rawText)
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  const ellipsis = '...'
  const ellipsisW = font.widthOfTextAtSize(ellipsis, size)
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    const candidate = text.slice(0, mid)
    if (font.widthOfTextAtSize(candidate, size) + ellipsisW <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo) + ellipsis
}

/**
 * Wrap text to fit within maxWidth. Returns lines (already sanitized).
 * Greedy word-wrap; breaks oversized words character-by-character as fallback.
 */
export function wrapText(rawText: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const text = sanitize(rawText)
  if (!text) return []
  const lines: string[] = []
  const paragraphs = text.split('\n')
  for (const paragraph of paragraphs) {
    if (!paragraph) { lines.push(''); continue }
    const words = paragraph.split(/\s+/)
    let current = ''
    for (const word of words) {
      const tentative = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(tentative, size) <= maxWidth) {
        current = tentative
      } else if (current) {
        lines.push(current)
        current = word
      } else {
        // Word longer than maxWidth — break char by char
        let chunk = ''
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
            chunk += ch
          } else {
            if (chunk) lines.push(chunk)
            chunk = ch
          }
        }
        if (chunk) current = chunk
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

export type TableCol = {
  w: number
  label: string
  align?: 'left' | 'right' | 'center'
  bold?: boolean
}

export type FooterFn = (ctx: { page: PDFPage; pageNum: number; renderer: Renderer }) => void

/**
 * Renderer class — manages page state, cursor (y), and provides drawing helpers.
 * Pattern: build the doc top-to-bottom; call ensureSpace() before drawing.
 */
export class Renderer {
  doc: PDFDocument
  page!: PDFPage
  fontRegular: PDFFont
  fontBold: PDFFont
  fontOblique: PDFFont
  y: number = A4_H - MARGIN
  pageNum: number = 0
  private totalPagesPlaceholder: { page: PDFPage; x: number; y: number; size: number; color: Color }[] = []
  private footerFn: FooterFn | null = null

  constructor(doc: PDFDocument, fontRegular: PDFFont, fontBold: PDFFont, fontOblique: PDFFont) {
    this.doc = doc
    this.fontRegular = fontRegular
    this.fontBold = fontBold
    this.fontOblique = fontOblique
  }

  static async create(): Promise<Renderer> {
    const doc = await PDFDocument.create()
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique)
    return new Renderer(doc, fontRegular, fontBold, fontOblique)
  }

  setFooter(fn: FooterFn) {
    this.footerFn = fn
  }

  newPage() {
    this.page = this.doc.addPage([A4_W, A4_H])
    this.y = A4_H - MARGIN
    this.pageNum += 1
    if (this.footerFn) this.footerFn({ page: this.page, pageNum: this.pageNum, renderer: this })
  }

  /** Register a placeholder for "Page X / TOTAL" text — call finalizePagePlaceholders() at end. */
  registerTotalPagesPlaceholder(page: PDFPage, x: number, y: number, size: number, color: Color) {
    this.totalPagesPlaceholder.push({ page, x, y, size, color })
  }

  finalizePagePlaceholders() {
    const total = this.pageNum
    for (const ph of this.totalPagesPlaceholder) {
      ph.page.drawText(String(total), {
        x: ph.x, y: ph.y, size: ph.size, font: this.fontRegular, color: ph.color,
      })
    }
  }

  ensureSpace(needed: number) {
    if (this.y - needed < BOTTOM_LIMIT) this.newPage()
  }

  moveY(delta: number) {
    this.y -= delta
  }

  // ─── Primitives ────────────────────────────────────────────────────────────

  drawText(text: string, opts: { x: number; y: number; size: number; bold?: boolean; oblique?: boolean; color?: Color; maxWidth?: number }) {
    const font = opts.bold ? this.fontBold : opts.oblique ? this.fontOblique : this.fontRegular
    const finalText = opts.maxWidth != null
      ? truncateToWidth(text, font, opts.size, opts.maxWidth)
      : sanitize(text)
    this.page.drawText(finalText, {
      x: opts.x, y: opts.y, size: opts.size, font,
      color: opts.color ?? COLOR.text,
    })
  }

  drawTextCentered(text: string, opts: { y: number; size: number; bold?: boolean; oblique?: boolean; color?: Color; maxWidth?: number }) {
    const font = opts.bold ? this.fontBold : opts.oblique ? this.fontOblique : this.fontRegular
    const finalText = opts.maxWidth != null
      ? truncateToWidth(text, font, opts.size, opts.maxWidth)
      : sanitize(text)
    const w = font.widthOfTextAtSize(finalText, opts.size)
    this.page.drawText(finalText, {
      x: (A4_W - w) / 2, y: opts.y, size: opts.size, font,
      color: opts.color ?? COLOR.text,
    })
  }

  drawTextRight(text: string, opts: { rightX: number; y: number; size: number; bold?: boolean; color?: Color; maxWidth?: number }) {
    const font = opts.bold ? this.fontBold : this.fontRegular
    const finalText = opts.maxWidth != null
      ? truncateToWidth(text, font, opts.size, opts.maxWidth)
      : sanitize(text)
    const w = font.widthOfTextAtSize(finalText, opts.size)
    this.page.drawText(finalText, {
      x: opts.rightX - w, y: opts.y, size: opts.size, font,
      color: opts.color ?? COLOR.text,
    })
  }

  drawRect(opts: { x: number; y: number; width: number; height: number; color?: Color; borderColor?: Color; borderWidth?: number }) {
    this.page.drawRectangle({
      x: opts.x, y: opts.y, width: opts.width, height: opts.height,
      color: opts.color,
      borderColor: opts.borderColor,
      borderWidth: opts.borderWidth ?? 0,
    })
  }

  drawHLine(x1: number, x2: number, y: number, thickness: number, color: Color) {
    this.page.drawLine({
      start: { x: x1, y }, end: { x: x2, y }, thickness, color,
    })
  }

  drawVLine(x: number, y1: number, y2: number, thickness: number, color: Color) {
    this.page.drawLine({
      start: { x, y: y1 }, end: { x, y: y2 }, thickness, color,
    })
  }

  // ─── Building blocks ───────────────────────────────────────────────────────

  /** Coloured strip across the top of the current page. Call before any content. */
  topBar(color: Color, thickness: number = 6) {
    this.page.drawRectangle({
      x: 0, y: A4_H - thickness, width: A4_W, height: thickness, color,
    })
  }

  /** Big centered title — use as document headline. */
  titleCentered(text: string, size: number = 18, color: Color = COLOR.text, bold: boolean = true) {
    this.ensureSpace(size + 8)
    this.drawTextCentered(text, { y: this.y - size, size, bold, color })
    this.moveY(size + 4)
  }

  /** Smaller centered subtitle. */
  subtitleCentered(text: string, size: number = 11, color: Color = COLOR.muted, oblique: boolean = false) {
    this.ensureSpace(size + 4)
    this.drawTextCentered(text, { y: this.y - size, size, oblique, color })
    this.moveY(size + 2)
  }

  /** Section header with coloured left border. */
  accentSection(text: string, accentColor: Color = COLOR.purple, bg: Color = COLOR.borderXlight) {
    this.moveY(8)
    this.ensureSpace(20)
    const h = 18
    this.drawRect({ x: MARGIN, y: this.y - h, width: CONTENT_W, height: h, color: bg })
    this.drawRect({ x: MARGIN, y: this.y - h, width: 3, height: h, color: accentColor })
    this.drawText(text.toUpperCase(), {
      x: MARGIN + 10, y: this.y - h + 6, size: 9, bold: true, color: COLOR.muted,
    })
    this.moveY(h + 4)
  }

  /** Key-value pair on one line — key in muted, value in text. */
  kv(key: string, val: string, opts?: { keyW?: number; size?: number }) {
    const keyW = opts?.keyW ?? 110
    const size = opts?.size ?? 9
    this.ensureSpace(size + 4)
    const valX = MARGIN + keyW
    const maxValW = A4_W - MARGIN - valX
    this.drawText(key, { x: MARGIN, y: this.y - size, size, color: COLOR.muted })
    this.drawText(val, { x: valX, y: this.y - size, size, color: COLOR.text, maxWidth: maxValW })
    this.moveY(size + 4)
  }

  /** Plain wrapped paragraph. */
  paragraph(text: string, opts?: { size?: number; color?: Color; oblique?: boolean }) {
    const size = opts?.size ?? 9
    const color = opts?.color ?? COLOR.text
    const oblique = opts?.oblique ?? false
    const font = oblique ? this.fontOblique : this.fontRegular
    const lines = wrapText(text, font, size, CONTENT_W)
    for (const line of lines) {
      this.ensureSpace(size + 3)
      this.drawText(line, { x: MARGIN, y: this.y - size, size, color, oblique })
      this.moveY(size + 3)
    }
  }

  /** Italic muted "no data" placeholder. */
  empty(text: string) {
    this.ensureSpace(14)
    this.drawText(text, { x: MARGIN, y: this.y - 9, size: 8, color: COLOR.empty, oblique: true })
    this.moveY(14)
  }

  /** Filled rounded-rect badge with text — returns end x. */
  badge(text: string, opts: { x: number; y: number; fg: Color; bg: Color; size?: number; padX?: number; padY?: number }): number {
    const size = opts.size ?? 8
    const padX = opts.padX ?? 6
    const padY = opts.padY ?? 3
    const txt = sanitize(text)
    const w = this.fontBold.widthOfTextAtSize(txt, size) + padX * 2
    const h = size + padY * 2
    this.page.drawRectangle({
      x: opts.x, y: opts.y - padY, width: w, height: h,
      color: opts.bg,
    })
    this.page.drawText(txt, {
      x: opts.x + padX, y: opts.y, size, font: this.fontBold, color: opts.fg,
    })
    return opts.x + w
  }

  // ─── Tables ────────────────────────────────────────────────────────────────

  tableHeader(cols: TableCol[], opts?: { bg?: Color; size?: number; height?: number }) {
    const bg = opts?.bg ?? COLOR.borderXlight
    const size = opts?.size ?? 8
    const rowH = opts?.height ?? 14
    this.ensureSpace(rowH + 2)
    this.drawRect({
      x: MARGIN, y: this.y - rowH, width: CONTENT_W, height: rowH,
      color: bg, borderColor: COLOR.borderLight, borderWidth: 0.5,
    })
    let x = MARGIN
    for (const c of cols) {
      const label = truncateToWidth(c.label, this.fontBold, size, c.w - 8)
      const labelW = this.fontBold.widthOfTextAtSize(label, size)
      let tx = x + 4
      if (c.align === 'right')  tx = x + c.w - 4 - labelW
      if (c.align === 'center') tx = x + (c.w - labelW) / 2
      this.page.drawText(label, {
        x: tx, y: this.y - rowH + 4, size, font: this.fontBold, color: COLOR.muted,
      })
      x += c.w
    }
    this.moveY(rowH)
  }

  tableRow(cols: TableCol[], values: string[], opts?: { size?: number; height?: number; alternate?: boolean; valueColors?: (Color | null)[]; valueBold?: boolean[] }) {
    const size = opts?.size ?? 8.5
    const rowH = opts?.height ?? 13
    this.ensureSpace(rowH)
    if (opts?.alternate) {
      this.drawRect({ x: MARGIN, y: this.y - rowH, width: CONTENT_W, height: rowH, color: COLOR.borderXlight })
    }
    let x = MARGIN
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]
      const raw = values[i] ?? ''
      const color = opts?.valueColors?.[i] ?? COLOR.text
      const bold = opts?.valueBold?.[i] ?? c.bold ?? false
      const font = bold ? this.fontBold : this.fontRegular
      const text = truncateToWidth(raw, font, size, c.w - 8)
      const textW = font.widthOfTextAtSize(text, size)
      let tx = x + 4
      if (c.align === 'right')  tx = x + c.w - 4 - textW
      if (c.align === 'center') tx = x + (c.w - textW) / 2
      this.page.drawText(text, {
        x: tx, y: this.y - rowH + 4, size, font, color,
      })
      x += c.w
    }
    this.drawHLine(MARGIN, A4_W - MARGIN, this.y - rowH, 0.3, COLOR.borderXlight)
    this.moveY(rowH)
  }

  // ─── Info card grid ────────────────────────────────────────────────────────

  /**
   * Draws N info cards horizontally — each with a small label and main value.
   * Returns the row height consumed.
   */
  infoCardRow(cards: Array<{ label: string; value: string; sub?: string }>, opts?: { height?: number; gap?: number }): number {
    const gap = opts?.gap ?? 8
    const h = opts?.height ?? 38
    const totalGap = gap * (cards.length - 1)
    const cardW = (CONTENT_W - totalGap) / cards.length
    this.ensureSpace(h + 4)
    let x = MARGIN
    for (const c of cards) {
      this.drawRect({
        x, y: this.y - h, width: cardW, height: h,
        color: COLOR.cardBg, borderColor: COLOR.border, borderWidth: 0.5,
      })
      this.page.drawText(sanitize(c.label).toUpperCase(), {
        x: x + 8, y: this.y - 12, size: 7, font: this.fontBold, color: COLOR.empty,
      })
      const valTxt = truncateToWidth(c.value, this.fontRegular, 9, cardW - 16)
      this.page.drawText(valTxt, {
        x: x + 8, y: this.y - 24, size: 9, font: this.fontRegular, color: COLOR.text,
      })
      if (c.sub) {
        const subTxt = truncateToWidth(c.sub, this.fontRegular, 7.5, cardW - 16)
        this.page.drawText(subTxt, {
          x: x + 8, y: this.y - 33, size: 7.5, font: this.fontRegular, color: COLOR.muted,
        })
      }
      x += cardW + gap
    }
    this.moveY(h + 4)
    return h + 4
  }

  // ─── Signature grid ────────────────────────────────────────────────────────

  /**
   * Draws a horizontal grid of N signature boxes. Each box: top accent line,
   * role label, then either { name, date } if signed, or a dashed line + "Name / Date".
   */
  signatureGrid(boxes: Array<{ role: string; name?: string; date?: string }>, opts?: { accentColor?: Color; height?: number; gap?: number }) {
    const accent = opts?.accentColor ?? COLOR.purple
    const gap = opts?.gap ?? 14
    const h = opts?.height ?? 58
    const totalGap = gap * (boxes.length - 1)
    const boxW = (CONTENT_W - totalGap) / boxes.length
    this.ensureSpace(h + 6)
    let x = MARGIN
    for (const b of boxes) {
      // Top accent line
      this.drawRect({ x, y: this.y - 2, width: boxW, height: 2, color: accent })
      // Role
      this.page.drawText(sanitize(b.role).toUpperCase(), {
        x, y: this.y - 14, size: 7.5, font: this.fontBold, color: COLOR.muted,
      })
      if (b.name) {
        const name = truncateToWidth(b.name, this.fontRegular, 10, boxW)
        this.page.drawText(name, { x, y: this.y - 28, size: 10, font: this.fontRegular, color: COLOR.text })
        this.page.drawText(sanitize(b.date ?? ''), {
          x, y: this.y - 40, size: 7.5, font: this.fontRegular, color: COLOR.empty,
        })
      } else {
        // Dashed signature line — emulate dashes by drawing short segments
        const dashY = this.y - 34
        const dashLen = 3, dashGap = 2
        let dx = x
        while (dx < x + boxW - dashLen) {
          this.drawHLine(dx, dx + dashLen, dashY, 0.6, COLOR.border)
          dx += dashLen + dashGap
        }
        this.page.drawText('Name / Date', {
          x, y: this.y - 46, size: 7.5, font: this.fontOblique, color: COLOR.empty,
        })
      }
      x += boxW + gap
    }
    this.moveY(h)
  }
}
