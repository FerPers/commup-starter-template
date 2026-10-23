/**
 * Punch List PDF — pdf-lib (Workers-native).
 *
 * Formatted, signable punch report grouped by category (A hard blocker,
 * B transferable, C minor). Complements the Excel export with a print/handover
 * document. Mirrors the layout patterns of phase-progress.ts / system-completion.ts.
 */

import {
  Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H,
  sanitize, bi,
  type Color, type TableCol,
} from './renderer'
import { todayIn } from '@/lib/time/zone'
import { drawBrandBar, type PdfBranding } from './branding'

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
  /** E2: logos de la org y del cliente (sin ellos, «CommUp» como antes). */
  branding?: PdfBranding | null
  /** Zona del proyecto: fecha «Generado» (el Worker corre en UTC). */
  timezone?: string | null
}

const CAT_META: Record<'A' | 'B' | 'C', { label: string; color: Color; bg: Color }> = {
  A: { label: bi('Categoría A — Bloqueante', 'Category A — Hard blocker'), color: COLOR.red, bg: COLOR.redBg },
  B: { label: bi('Categoría B — Transferible con excepción', 'Category B — Transferable with exception'), color: COLOR.amber, bg: COLOR.amberBg },
  C: { label: bi('Categoría C — Menor', 'Category C — Minor'), color: COLOR.muted, bg: COLOR.borderXlight },
}

const STATUS_COLOR: Record<string, Color> = {
  open: COLOR.red,
  in_progress: COLOR.blue,
  closed: COLOR.greenStrong,
  cancelled: COLOR.muted,
}

const STATUS_LABEL: Record<string, string> = {
  open: bi('Abierto', 'Open'),
  in_progress: bi('En curso', 'In progress'),
  closed: bi('Cerrado', 'Closed'),
  cancelled: bi('Anulado', 'Cancelled'),
}

const COLS: TableCol[] = [
  { w: 58, label: 'Punch', labelEn: 'Punch' },
  { w: 62, label: 'Tag', labelEn: 'Tag' },
  { w: 34, label: 'Disc.', labelEn: 'Disc.', align: 'center' },
  { w: 70, label: 'Subsistema', labelEn: 'Subsystem' },
  { w: 139, label: 'Descripción', labelEn: 'Description' },
  { w: 94, label: 'Estado', labelEn: 'Status', align: 'center' },
  { w: 66, label: 'Fecha objetivo', labelEn: 'Target date', align: 'center' },
]

function isOpen(status: string): boolean {
  return status !== 'closed' && status !== 'cancelled'
}

export async function renderPunchListPdf(data: PunchListPdfData): Promise<Uint8Array> {
  const r = await Renderer.create()
  // V3: PDF formal bilingüe (español / inglés), como el del ITR.
  r.doc.setTitle(`Lista de punch / Punch List · ${data.projectCode}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Reporte de lista de punch / Punch List Report')

  const generatedAt = todayIn(data.timezone)

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
    const centerText = sanitize(`Generado / Generated: ${generatedAt}`)
    const centerW = r.fontRegular.widthOfTextAtSize(centerText, 7)
    page.drawText(centerText, {
      x: (A4_W - centerW) / 2, y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty,
    })
    const pageStr = `Pág. / Page ${pageNum} / `
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
  await drawBrandBar(r, data.branding)
  r.drawTextCentered(bi('Reporte de lista de punch', 'Punch List Report'), { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
  r.moveY(15)
  r.drawTextCentered(`${data.projectCode} — ${data.projectName}`, {
    y: r.y - 11, size: 11, bold: true, color: COLOR.text, maxWidth: CONTENT_W,
  })
  r.moveY(13)
  if (data.projectClient) {
    r.drawTextCentered(`${bi('Cliente', 'Client')}: ${data.projectClient}`, {
      y: r.y - 10, size: 10, oblique: true, color: COLOR.muted, maxWidth: CONTENT_W,
    })
    r.moveY(12)
  }
  r.moveY(6)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1.2, COLOR.text)
  r.moveY(10)

  // ─── Summary cards ────────────────────────────────────────────────────────
  r.infoCardRow([
    { label: bi('Cat A abiertos', 'Open'), value: String(openA), sub: openA > 0 ? bi('Bloqueante', 'Blocking') : bi('Ninguno', 'None') },
    { label: bi('Cat B abiertos', 'Open'), value: String(openB) },
    { label: bi('Cat C abiertos', 'Open'), value: String(openC) },
    { label: bi('Total de punch', 'Total'), value: String(data.punches.length) },
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
    r.accentSection('Punch')
    r.empty(bi('No hay punch registrados en este proyecto.', 'No punches recorded for this project.'))
  }

  // ─── Sign-off block ───────────────────────────────────────────────────────
  r.moveY(10)
  r.accentSection(bi('Firmas', 'Sign-off'))
  r.signatureGrid([
    { role: 'Elaborado por', roleEn: 'Prepared by' },
    { role: 'Revisado por', roleEn: 'Reviewed by' },
    { role: 'Aceptado por (cliente)', roleEn: 'Accepted by (client)' },
  ], { placeholder: 'Nombre / fecha · Name / date' })

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
