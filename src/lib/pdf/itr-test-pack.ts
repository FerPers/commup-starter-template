/**
 * ITR Test Pack PDF — pdf-lib (Workers-native).
 *
 * Register of ITRs grouped by subsystem (the "test pack" index of a system),
 * with template, tag, status and dates. Mirrors the layout patterns of
 * system-completion.ts.
 */

import {
  Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H,
  sanitize, bi,
  type Color, type TableCol,
} from './renderer'
import { todayIn } from '@/lib/time/zone'

export type TestPackItr = {
  number: string
  templateCode: string | null
  templateTitle: string | null
  tag: string | null
  status: string
  progressPct: number
  scheduledDate: string | null
  completedDate: string | null
}

export type TestPackSubsystem = {
  code: string
  name: string
  itrs: TestPackItr[]
}

export type ItrTestPackData = {
  projectName: string
  projectCode: string
  projectClient: string | null
  subsystems: TestPackSubsystem[]
  /** Zona del proyecto: fecha «Generado» (el Worker corre en UTC). */
  timezone?: string | null
}

const STATUS_COLOR: Record<string, Color> = {
  not_started: COLOR.muted,
  in_progress: COLOR.blue,
  completed: COLOR.amber,
  approved: COLOR.greenStrong,
  rejected: COLOR.red,
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'No iniciado / Not started',
  in_progress: 'En progreso / In progress',
  completed: 'Completado / Completed',
  approved: 'Aprobado / Approved',
  rejected: 'Rechazado / Rejected',
}

const COLS: TableCol[] = [
  { w: 62, label: 'N.º ITR', labelEn: 'ITR number' },
  { w: 48, label: 'Plantilla', labelEn: 'Template' },
  { w: 62, label: 'Tag', labelEn: 'Tag' },
  { w: 150, label: 'Título', labelEn: 'Title' },
  { w: 106, label: 'Estado', labelEn: 'Status', align: 'center' },
  { w: 38, label: 'Avance', labelEn: 'Progress', align: 'right' },
  { w: 57, label: 'Completado', labelEn: 'Completed', align: 'center' },
]

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export async function renderItrTestPackPdf(data: ItrTestPackData): Promise<Uint8Array> {
  const r = await Renderer.create()
  // V3: PDF formal bilingüe (español / inglés), como el del ITR.
  r.doc.setTitle(`Paquete de pruebas ITR / ITR Test Pack · ${data.projectCode}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Paquete de pruebas ITR / ITR Test Pack')

  const generatedAt = todayIn(data.timezone)

  const allItrs = data.subsystems.flatMap(s => s.itrs)
  const total = allItrs.length
  const approved = allItrs.filter(i => i.status === 'approved').length

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
  r.drawTextCentered('CommUp', { y: r.y - 18, size: 18, bold: true, color: COLOR.purple })
  r.moveY(22)
  r.drawTextCentered(bi('Paquete de pruebas ITR', 'ITR Test Pack'), { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
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
    { label: bi('Total de ITR', 'Total ITRs'), value: String(total) },
    { label: bi('Aprobados', 'Approved'), value: `${approved} / ${total}`, sub: `${pct(approved, total)}%` },
    { label: bi('Subsistemas', 'Subsystems'), value: String(data.subsystems.length) },
  ])

  // ─── Per-subsystem registers ──────────────────────────────────────────────
  if (data.subsystems.length === 0) {
    r.accentSection(bi('Subsistemas', 'Subsystems'))
    r.empty(bi('El proyecto no tiene ITR registrados.', 'No ITRs recorded for this project.'))
  }

  for (const sub of data.subsystems) {
    const subApproved = sub.itrs.filter(i => i.status === 'approved').length
    r.accentSection(`${sub.code} — ${sub.name}  (${subApproved}/${sub.itrs.length} ${bi('aprobados', 'approved')})`)
    r.tableHeader(COLS)

    if (sub.itrs.length === 0) {
      r.empty(bi('El subsistema no tiene ITR.', 'No ITRs in this subsystem.'))
      continue
    }

    sub.itrs.forEach((itr, i) => {
      r.tableRow(
        COLS,
        [
          itr.number,
          itr.templateCode ?? '—',
          itr.tag ?? '—',
          itr.templateTitle ?? '—',
          STATUS_LABEL[itr.status] ?? itr.status,
          `${itr.progressPct}%`,
          itr.completedDate ?? '—',
        ],
        {
          alternate: i % 2 === 1,
          valueColors: [COLOR.text, COLOR.muted, COLOR.text, COLOR.textLight, STATUS_COLOR[itr.status] ?? COLOR.muted, COLOR.text, COLOR.muted],
          valueBold: [true, false, false, false, false, false, false],
        },
      )
    })
    r.moveY(4)
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
