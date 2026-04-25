/**
 * Handover Package PDF — server-side render via pdf-lib.
 * Returns a Uint8Array that the export endpoint uploads to Storage.
 *
 * pdf-lib is Workers-native (pure Web APIs — no Node runtime dependency).
 * The previous @react-pdf/renderer implementation failed to resolve its
 * dynamic chunk inside the OpenNext Worker bundle.
 */

import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, RGB } from 'pdf-lib'
import type { HandoverPackageData } from './types'

const A4_W = 595.28
const A4_H = 841.89
const MARGIN = 36
const CONTENT_W = A4_W - MARGIN * 2
const FOOTER_H = 22
const BOTTOM_LIMIT = MARGIN + FOOTER_H

const COLOR = {
  text:         rgb(0.059, 0.090, 0.165),
  muted:        rgb(0.392, 0.455, 0.545),
  border:       rgb(0.796, 0.835, 0.882),
  borderLight:  rgb(0.886, 0.910, 0.941),
  borderXlight: rgb(0.945, 0.961, 0.976),
  tableHeadBg:  rgb(0.945, 0.961, 0.976),
  empty:        rgb(0.580, 0.639, 0.722),
  white:        rgb(1, 1, 1),
  green:        rgb(0.086, 0.396, 0.204),
  greenBg:      rgb(0.863, 0.988, 0.906),
  blue:         rgb(0.118, 0.251, 0.686),
  blueBg:       rgb(0.859, 0.918, 0.996),
  red:          rgb(0.600, 0.106, 0.106),
  redBg:        rgb(0.996, 0.886, 0.886),
  amber:        rgb(0.573, 0.251, 0.055),
  amberBg:      rgb(0.996, 0.953, 0.780),
}

type TableCol = { w: number; label: string; align?: 'left' | 'right' }

/**
 * StandardFonts.Helvetica uses WinAnsi encoding, which covers Latin-1 + a few
 * CP1252 extensions but rejects characters like → (U+2192), check marks, CJK.
 * Embedding a Unicode-capable font (via fontkit) is heavy for Workers, so we
 * map common non-WinAnsi glyphs to ASCII equivalents and fall back to '?' for
 * anything else. User-supplied strings (project names, descriptions) are
 * passed through this before drawing to avoid runtime encode failures.
 */
const UNICODE_MAP: Record<string, string> = {
  '→': '->',  // →
  '←': '<-',  // ←
  '↑': '^',   // ↑
  '↓': 'v',   // ↓
  '⇒': '=>',  // ⇒
  '⇐': '<=',  // ⇐
  '✓': 'OK',  // ✓
  '✔': 'OK',  // ✔
  '✗': 'X',   // ✗
  '✘': 'X',   // ✘
  ' ': ' ',   // non-breaking space
}

function sanitize(s: string): string {
  if (!s) return s
  return s.replace(/[^\x00-\xFF]/g, (c) => UNICODE_MAP[c] ?? '?')
}

function truncateToWidth(rawText: string, font: PDFFont, size: number, maxWidth: number): string {
  const text = sanitize(rawText)
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  const ellipsis = '…'
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

function statusColors(status: string): { fg: RGB; bg: RGB } {
  const s = status.toLowerCase()
  if (s.includes('approv') || s.includes('issu') || s.includes('complet') || s.includes('closed'))
    return { fg: COLOR.green, bg: COLOR.greenBg }
  if (s.includes('progress')) return { fg: COLOR.blue, bg: COLOR.blueBg }
  if (s.includes('reject') || s.includes('block') || s.includes('fail'))
    return { fg: COLOR.red, bg: COLOR.redBg }
  return { fg: COLOR.amber, bg: COLOR.amberBg }
}

class Renderer {
  doc: PDFDocument
  page!: PDFPage
  fontRegular: PDFFont
  fontBold: PDFFont
  y: number = A4_H - MARGIN
  pageNum: number = 0
  totalPagesPlaceholder: { page: PDFPage; x: number; y: number }[] = []

  constructor(
    doc: PDFDocument,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    private projectName: string,
    private schemaVersion: string,
    private hashShort: string,
  ) {
    this.doc = doc
    this.fontRegular = fontRegular
    this.fontBold = fontBold
    this.newPage()
  }

  newPage() {
    this.page = this.doc.addPage([A4_W, A4_H])
    this.y = A4_H - MARGIN
    this.pageNum += 1
    this.drawFooter()
  }

  drawFooter() {
    const footerY = MARGIN
    this.page.drawLine({
      start: { x: MARGIN, y: footerY + FOOTER_H - 4 },
      end:   { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 },
      thickness: 0.5,
      color: COLOR.borderLight,
    })
    const leftText  = truncateToWidth(
      `CommUp Handover Package v${this.schemaVersion} · ${this.projectName}`,
      this.fontRegular, 7, CONTENT_W / 2 - 20,
    )
    const rightText = sanitize(`sig:${this.hashShort}...`)
    this.page.drawText(leftText, {
      x: MARGIN, y: footerY + 6, size: 7, font: this.fontRegular, color: COLOR.empty,
    })
    const rightW = this.fontRegular.widthOfTextAtSize(rightText, 7)
    this.page.drawText(rightText, {
      x: A4_W - MARGIN - rightW, y: footerY + 6, size: 7, font: this.fontRegular, color: COLOR.empty,
    })
    this.totalPagesPlaceholder.push({ page: this.page, x: A4_W / 2 - 20, y: footerY + 6 })
    this.page.drawText(`Page ${this.pageNum} /`, {
      x: A4_W / 2 - 28, y: footerY + 6, size: 7, font: this.fontRegular, color: COLOR.empty,
    })
  }

  finalizeFooter() {
    const total = this.pageNum
    for (const ph of this.totalPagesPlaceholder) {
      ph.page.drawText(String(total), {
        x: ph.x + 6, y: ph.y, size: 7, font: this.fontRegular, color: COLOR.empty,
      })
    }
  }

  ensureSpace(needed: number) {
    if (this.y - needed < BOTTOM_LIMIT) this.newPage()
  }

  moveY(delta: number) {
    this.y -= delta
  }

  title(text: string) {
    this.ensureSpace(28)
    this.page.drawText(sanitize(text), {
      x: MARGIN, y: this.y - 20, size: 20, font: this.fontBold, color: COLOR.text,
    })
    this.moveY(24)
  }

  subtitle(text: string) {
    this.ensureSpace(18)
    this.page.drawText(sanitize(text), {
      x: MARGIN, y: this.y - 11, size: 11, font: this.fontRegular, color: COLOR.muted,
    })
    this.moveY(18)
  }

  section(text: string) {
    this.moveY(10)
    this.ensureSpace(22)
    this.page.drawText(sanitize(text), {
      x: MARGIN, y: this.y - 13, size: 13, font: this.fontBold, color: COLOR.text,
    })
    this.moveY(16)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 4 },
      end:   { x: A4_W - MARGIN, y: this.y + 4 },
      thickness: 0.5,
      color: COLOR.border,
    })
    this.moveY(4)
  }

  kv(key: string, val: string) {
    this.ensureSpace(12)
    const keyX = MARGIN
    const valX = MARGIN + 110
    const maxValW = A4_W - MARGIN - valX
    const truncVal = truncateToWidth(val, this.fontRegular, 9, maxValW)
    this.page.drawText(sanitize(key), {
      x: keyX, y: this.y - 9, size: 9, font: this.fontRegular, color: COLOR.muted,
    })
    this.page.drawText(truncVal, {
      x: valX, y: this.y - 9, size: 9, font: this.fontRegular, color: COLOR.text,
    })
    this.moveY(12)
  }

  empty(text: string) {
    this.ensureSpace(12)
    this.page.drawText(sanitize(text), {
      x: MARGIN, y: this.y - 8, size: 8, font: this.fontRegular, color: COLOR.empty,
    })
    this.moveY(12)
  }

  tableHeader(cols: TableCol[]) {
    this.ensureSpace(16)
    const rowH = 14
    this.page.drawRectangle({
      x: MARGIN, y: this.y - rowH, width: CONTENT_W, height: rowH,
      color: COLOR.tableHeadBg,
      borderColor: COLOR.borderLight, borderWidth: 0.5,
    })
    let x = MARGIN
    for (const c of cols) {
      const text = truncateToWidth(c.label, this.fontBold, 8, c.w - 8)
      this.page.drawText(text, {
        x: x + 4, y: this.y - rowH + 4, size: 8, font: this.fontBold, color: COLOR.text,
      })
      x += c.w
    }
    this.moveY(rowH)
  }

  tableRow(cols: TableCol[], values: string[], opts?: { statusColIndex?: number }) {
    const rowH = 13
    this.ensureSpace(rowH)
    let x = MARGIN
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]
      const raw = values[i] ?? ''
      const isStatus = opts?.statusColIndex === i
      const textColor = isStatus ? statusColors(raw).fg : COLOR.text
      const text = truncateToWidth(raw, this.fontRegular, 8, c.w - 8)
      this.page.drawText(text, {
        x: x + 4, y: this.y - rowH + 4, size: 8, font: this.fontRegular, color: textColor,
      })
      x += c.w
    }
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - rowH },
      end:   { x: A4_W - MARGIN, y: this.y - rowH },
      thickness: 0.3,
      color: COLOR.borderXlight,
    })
    this.moveY(rowH)
  }
}

export async function renderHandoverPdf(
  data: HandoverPackageData,
  signatureHash: string,
): Promise<Uint8Array> {
  const pkg = data.handover_package
  const totalTags = pkg.systems.reduce((a, s) => a + s.tag_count, 0)
  const totalItrs = pkg.systems.reduce((a, s) => a + s.itr_count, 0)
  const totalCatA = pkg.systems.reduce((a, s) => a + s.punch_summary.cat_a_open, 0)
  const totalCatB = pkg.systems.reduce((a, s) => a + s.punch_summary.cat_b_open, 0)
  const hashShort = signatureHash.slice(0, 16)

  const doc = await PDFDocument.create()
  doc.setTitle(`Handover Package — ${pkg.project.name}`)
  doc.setAuthor('CommUp')
  doc.setCreator(`CommUp Handover Exporter v${pkg.schema_version}`)

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold)

  const r = new Renderer(doc, fontRegular, fontBold, pkg.project.name, pkg.schema_version, hashShort)

  r.title('Handover Package')
  r.subtitle(`Schema v${pkg.schema_version} · Generated ${pkg.generated_at}`)

  r.section('Project')
  r.kv('Name',        pkg.project.name)
  r.kv('Code',        pkg.project.code)
  r.kv('Client',      pkg.project.client || '—')
  r.kv('Location',    pkg.project.location || '—')
  r.kv('Status',      pkg.project.status)
  r.kv('Start / End', `${pkg.project.start_date ?? '—'} -> ${pkg.project.end_date ?? '—'}`)

  r.section('Executive summary')
  r.kv('Systems',          String(pkg.systems.length))
  r.kv('Tags',             String(totalTags))
  r.kv('ITRs',             String(totalItrs))
  r.kv('Punch Cat A open', String(totalCatA))
  r.kv('Punch Cat B open', `${totalCatB} (transferable)`)
  r.kv('Certificates',     String(pkg.certificates.length))

  r.section('Systems')
  if (pkg.systems.length === 0) {
    r.empty('No systems in scope.')
  } else {
    const tagCols: TableCol[] = [
      { w: 90,  label: 'Tag' },
      { w: 210, label: 'Description' },
      { w: 75,  label: 'Manufacturer' },
      { w: 70,  label: 'Model' },
      { w: 78,  label: 'Status' },
    ]
    for (const sys of pkg.systems) {
      r.ensureSpace(40)
      r.page.drawText(sanitize(`${sys.code} — ${sys.name}`), {
        x: MARGIN, y: r.y - 10, size: 11, font: r.fontBold, color: COLOR.text,
      })
      r.moveY(14)
      r.kv('Tags / ITRs', `${sys.tag_count} tags · ${sys.itr_approved}/${sys.itr_count} ITRs approved`)
      r.kv('Punch open',  `A:${sys.punch_summary.cat_a_open} · B:${sys.punch_summary.cat_b_open} · C:${sys.punch_summary.cat_c_open}`)
      if (sys.tags.length > 0) {
        r.tableHeader(tagCols)
        for (const t of sys.tags) {
          r.tableRow(tagCols, [
            t.tag_number,
            t.description ?? '',
            t.manufacturer ?? '—',
            t.model ?? '—',
            t.status,
          ], { statusColIndex: 4 })
        }
      }
      r.moveY(6)
    }
  }

  r.section('Punch items Cat B (transferable to Operations)')
  if (pkg.punch_items.length === 0) {
    r.empty('No Cat B punches in scope.')
  } else {
    const punchCols: TableCol[] = [
      { w: 80,  label: 'Number' },
      { w: 238, label: 'Description' },
      { w: 60,  label: 'Priority' },
      { w: 65,  label: 'Status' },
      { w: 80,  label: 'Target date' },
    ]
    r.tableHeader(punchCols)
    for (const p of pkg.punch_items) {
      r.tableRow(punchCols, [
        p.punch_number,
        p.description ?? '',
        p.priority ?? '',
        p.status,
        p.target_date ?? '—',
      ], { statusColIndex: 3 })
    }
  }

  r.section('Certificates')
  if (pkg.certificates.length === 0) {
    r.empty('No certificates in scope.')
  } else {
    const certCols: TableCol[] = [
      { w: 100, label: 'Number' },
      { w: 293, label: 'Title' },
      { w: 60,  label: 'Status' },
      { w: 70,  label: 'Issued' },
    ]
    r.tableHeader(certCols)
    for (const c of pkg.certificates) {
      r.tableRow(certCols, [
        c.certificate_number,
        c.title ?? '',
        c.status,
        c.issued_date ?? '—',
      ], { statusColIndex: 2 })
    }
  }

  r.section('Digital signature')
  r.kv('Algorithm', 'HMAC-SHA256')
  r.kv('Hash',      signatureHash)
  r.moveY(4)
  r.empty('Hash calculated over the companion JSON payload. Verify integrity by recomputing HMAC-SHA256 with the org’s handover signing secret.')

  r.finalizeFooter()

  return await doc.save()
}
