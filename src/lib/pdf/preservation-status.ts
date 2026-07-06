/**
 * Preservation Status PDF — pdf-lib (Workers-native).
 *
 * Org-wide preservation register grouped by project, flagging overdue and
 * due-soon plans. Mirrors the layout patterns of system-completion.ts.
 */

import {
  Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H,
  sanitize,
  type Color, type TableCol,
} from './renderer'

export type PreservationPlanRow = {
  tag: string | null
  procedureCode: string | null
  procedureTitle: string | null
  frequency: string | null
  status: string
  nextDueDate: string
  lastPerformedDate: string | null
  /** 'overdue' | 'soon' | 'ok' | 'inactive' — precomputed against generation date */
  due: 'overdue' | 'soon' | 'ok' | 'inactive'
}

export type PreservationProjectGroup = {
  code: string
  name: string
  plans: PreservationPlanRow[]
}

export type PreservationStatusData = {
  orgName: string
  generatedAt: string
  soonWindowDays: number
  projects: PreservationProjectGroup[]
}

const DUE_COLOR: Record<PreservationPlanRow['due'], Color> = {
  overdue: COLOR.red,
  soon: COLOR.amber,
  ok: COLOR.greenStrong,
  inactive: COLOR.muted,
}

const DUE_LABEL: Record<PreservationPlanRow['due'], string> = {
  overdue: 'OVERDUE',
  soon: 'Due soon',
  ok: 'On track',
  inactive: 'Inactive',
}

const COLS: TableCol[] = [
  { w: 78, label: 'Tag' },
  { w: 48, label: 'Proc' },
  { w: 150, label: 'Procedure' },
  { w: 58, label: 'Frequency', align: 'center' },
  { w: 62, label: 'Next Due', align: 'center' },
  { w: 69, label: 'Status', align: 'center' },
]

export async function renderPreservationStatusPdf(data: PreservationStatusData): Promise<Uint8Array> {
  const r = await Renderer.create()
  r.doc.setTitle(`Preservation Status · ${data.orgName}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Preservation Status Report')

  const allPlans = data.projects.flatMap(p => p.plans)
  const overdue = allPlans.filter(p => p.due === 'overdue').length
  const soon = allPlans.filter(p => p.due === 'soon').length

  r.setFooter(({ page, pageNum }) => {
    const footerY = MARGIN
    page.drawLine({
      start: { x: MARGIN, y: footerY + FOOTER_H - 4 },
      end:   { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 },
      thickness: 0.5, color: COLOR.borderLight,
    })
    page.drawText(sanitize(`CommUp · ${data.orgName}`), {
      x: MARGIN, y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty,
    })
    const centerText = sanitize(`Generated: ${data.generatedAt}`)
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
  r.drawTextCentered('Preservation Status', { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
  r.moveY(15)
  r.drawTextCentered(data.orgName, {
    y: r.y - 11, size: 11, bold: true, color: COLOR.text, maxWidth: CONTENT_W,
  })
  r.moveY(13)
  r.moveY(6)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1.2, COLOR.text)
  r.moveY(10)

  // ─── Summary cards ────────────────────────────────────────────────────────
  r.infoCardRow([
    { label: 'Overdue', value: String(overdue), sub: overdue > 0 ? 'Action required' : 'None' },
    { label: 'Due Soon', value: String(soon), sub: `Next ${data.soonWindowDays} days` },
    { label: 'Total Plans', value: String(allPlans.length) },
    { label: 'Projects', value: String(data.projects.length) },
  ])

  // ─── Per-project registers ────────────────────────────────────────────────
  if (data.projects.length === 0) {
    r.accentSection('Projects')
    r.empty('No preservation plans recorded.')
  }

  for (const proj of data.projects) {
    const projOverdue = proj.plans.filter(p => p.due === 'overdue').length
    r.accentSection(`${proj.code} — ${proj.name}  (${projOverdue} overdue)`)
    r.tableHeader(COLS)

    if (proj.plans.length === 0) {
      r.empty('No plans in this project.')
      continue
    }

    proj.plans.forEach((p, i) => {
      r.tableRow(
        COLS,
        [
          p.tag ?? '—',
          p.procedureCode ?? '—',
          p.procedureTitle ?? '—',
          p.frequency ?? '—',
          p.nextDueDate,
          DUE_LABEL[p.due],
        ],
        {
          alternate: i % 2 === 1,
          valueColors: [COLOR.text, COLOR.muted, COLOR.textLight, COLOR.muted, COLOR.text, DUE_COLOR[p.due]],
          valueBold: [true, false, false, false, false, p.due === 'overdue'],
        },
      )
    })
    r.moveY(4)
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
