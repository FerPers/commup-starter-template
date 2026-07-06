/**
 * Punch List PDF — pdf-lib (Workers-native).
 *
 * Formatted, signable punch report grouped by category (A hard blocker,
 * B transferable, C minor). Complements the Excel export with a print/handover
 * document. Mirrors the layout patterns of phase-progress.ts / system-completion.ts.
 */

import {
  Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H,
  sanitize,
  type Color, type TableCol,
} from './renderer'

export type PunchPdfRow = {
  number: string
  category: 'A' | 'B' | 'C'
  status: string
  tag: string | null
  discipline: string | null
  subsystem: string | null
  description: string
  targetDate: string | null
  assignedTo: string | null
}

export type PunchListPdfData = {
  projectName: string
  projectCode: string
  projectClient: string | null
  punches: PunchPdfRow[]
}

const CAT_META: Record<'A' | 'B' | 'C', { label: string; color: Color; bg: Color }> = {
  A: { label: 'Category A — Hard Blocker', color: COLOR.red, bg: COLOR.redBg },
  B: { label: 'Category B — Transferable with Exception', color: COLOR.amber, bg: COLOR.amberBg },
  C: { label: 'Category C — Minor', color: COLOR.muted, bg: COLOR.borderXlight },
}

const STATUS_COLOR: Record<string, Color> = {
  open: COLOR.red,
  in_progress: COLOR.blue,
  closed: COLOR.greenStrong,
  cancelled: COLOR.muted,
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const COLS: TableCol[] = [
  { w: 58, label: 'Punch' },
  { w: 62, label: 'Tag' },
  { w: 40, label: 'Disc', align: 'center' },
  { w: 70, label: 'Subsystem' },
  { w: 158, label: 'Description' },
  { w: 55, label: 'Status', align: 'center' },
  { w: 50, label: 'Target', align: 'center' },
]

function isOpen(status: string): boolean {
  return status !== 'closed' && status !== 'cancelled'
}

export async function renderPunchListPdf(data: PunchListPdfData): Promise<Uint8Array> {
  const r = await Renderer.create()
  r.doc.setTitle(`Punch List · ${data.projectCode}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Punch List Report')

  const generatedAt = new Date().toISOString().slice(0, 10)

  const openA = data.punches.filter(p => p.category === 'A' && isOpen(p.status)).length
  const openB = data.punches.filter(p => p.category === 'B' && isOpen(p.status)).length
  const openC = data.punches.filter(p => p.category === 'C' && isOpen(p.status)).length

  r.setFooter(({ page, pageNum }) => {
    const footerY = MARGIN
    page.drawLine({
      start: { x: MARGIN, y: footerY + FOOTER_H - 4 },
      end:   { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 },
      thickness: 0.5, color: COLOR.borderLight,
    })
    page.drawText(sanitize(`CommUp · ${data.projectCode}`), {
      x: MARGIN, y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty,
    })
    const centerText = sanitize(`Generated: ${generatedAt}`)
    const centerW = r.fontRegular.widthOfTextAtSize(centerText, 7)
    page.drawText(centerText, {
      x: (A4_W - centerW) / 2, y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty,
    })
    const pageStr = `Page ${pageNum} / `
    const pageStrW = r.fontRegular.widthOfTextAtSize(pageStr, 7)
    const totalX = A4_W - MARGIN - 12
    page.drawText(pageStr, {
      x: totalX - pageStrW, y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty,
    })
    r.registerTotalPagesPlaceholder(page, totalX, footerY + 6, 7, COLOR.empty)
  })

  r.newPage()
  r.topBar(COLOR.purple, 6)

  // ─── Header ───────────────────────────────────────────────────────────────
  r.moveY(8)
  r.drawTextCentered('CommUp', { y: r.y - 18, size: 18, bold: true, color: COLOR.purple })
  r.moveY(22)
  r.drawTextCentered('Punch List Report', { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
  r.moveY(15)
  r.drawTextCentered(`${data.projectCode} — ${data.projectName}`, {
    y: r.y - 11, size: 11, bold: true, color: COLOR.text, maxWidth: CONTENT_W,
  })
  r.moveY(13)
  if (data.projectClient) {
    r.drawTextCentered(`Client: ${data.projectClient}`, {
      y: r.y - 10, size: 10, oblique: true, color: COLOR.muted, maxWidth: CONTENT_W,
    })
    r.moveY(12)
  }
  r.moveY(6)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1.2, COLOR.text)
  r.moveY(10)

  // ─── Summary cards ────────────────────────────────────────────────────────
  r.infoCardRow([
    { label: 'Open Cat A', value: String(openA), sub: openA > 0 ? 'Blocking' : 'None' },
    { label: 'Open Cat B', value: String(openB) },
    { label: 'Open Cat C', value: String(openC) },
    { label: 'Total Punches', value: String(data.punches.length) },
  ])

  // ─── Per-category tables ──────────────────────────────────────────────────
  const cats: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C']
  let anyRows = false

  for (const cat of cats) {
    const rows = data.punches.filter(p => p.category === cat)
    if (rows.length === 0) continue
    anyRows = true

    const meta = CAT_META[cat]
    r.accentSection(meta.label, meta.color, meta.bg)
    r.tableHeader(COLS)

    rows.forEach((p, i) => {
      r.tableRow(
        COLS,
        [
          p.number,
          p.tag ?? '—',
          p.discipline ?? '—',
          p.subsystem ?? '—',
          p.description,
          STATUS_LABEL[p.status] ?? p.status,
          p.targetDate ?? '—',
        ],
        {
          alternate: i % 2 === 1,
          valueColors: [COLOR.text, COLOR.text, COLOR.muted, COLOR.muted, COLOR.textLight, STATUS_COLOR[p.status] ?? COLOR.muted, COLOR.muted],
          valueBold: [true, false, false, false, false, false, false],
        },
      )
    })
    r.moveY(4)
  }

  if (!anyRows) {
    r.accentSection('Punches')
    r.empty('No punches recorded for this project.')
  }

  // ─── Sign-off block ───────────────────────────────────────────────────────
  r.moveY(10)
  r.accentSection('Sign-off')
  r.signatureGrid([
    { role: 'Prepared by' },
    { role: 'Reviewed by' },
    { role: 'Accepted by (Client)' },
  ])

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
