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
import { getTranslations } from 'next-intl/server'

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

/** `label` = clave de `PdfReports.preservation.col`. */
const COLS: TableCol[] = [
  { w: 78, label: 'tag' },
  { w: 48, label: 'proc' },
  { w: 150, label: 'procedure' },
  { w: 58, label: 'frequency', align: 'center' },
  { w: 62, label: 'nextDue', align: 'center' },
  { w: 69, label: 'status', align: 'center' },
]

export async function renderPreservationStatusPdf(data: PreservationStatusData): Promise<Uint8Array> {
  // V3: reporte en el idioma de quien descarga.
  const t = await getTranslations('PdfReports')
  const tp = await getTranslations('Preservation')
  const frequency = (f: string | null) => !f ? '—' : tp.has(`freq.${f}`) ? tp(`freq.${f}`) : f
  const cols: TableCol[] = COLS.map(c => ({ ...c, label: t(`preservation.col.${c.label}`) }))
  const r = await Renderer.create()
  r.doc.setTitle(`${t('preservation.title')} · ${data.orgName}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject(t('preservation.title'))

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
    const centerText = sanitize(t('common.generated', { date: data.generatedAt }))
    const centerW = r.fontRegular.widthOfTextAtSize(centerText, 7)
    page.drawText(centerText, {
      x: (A4_W - centerW) / 2, y: footerY + 6, size: 7, font: r.fontRegular, color: COLOR.empty,
    })
    const pageStr = `${t('common.page', { n: pageNum })} / `
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
  r.drawTextCentered(t('preservation.title'), { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
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
    { label: t('preservation.overdue'), value: String(overdue), sub: overdue > 0 ? t('preservation.actionRequired') : t('common.none') },
    { label: t('preservation.dueSoon'), value: String(soon), sub: t('preservation.nextDays', { days: data.soonWindowDays }) },
    { label: t('preservation.totalPlans'), value: String(allPlans.length) },
    { label: t('preservation.projects'), value: String(data.projects.length) },
  ])

  // ─── Per-project registers ────────────────────────────────────────────────
  if (data.projects.length === 0) {
    r.accentSection(t('preservation.projects'))
    r.empty(t('preservation.empty'))
  }

  for (const proj of data.projects) {
    const projOverdue = proj.plans.filter(p => p.due === 'overdue').length
    r.accentSection(`${proj.code} — ${proj.name}  (${t('preservation.projectOverdue', { n: projOverdue })})`)
    r.tableHeader(cols)

    if (proj.plans.length === 0) {
      r.empty(t('preservation.emptyProject'))
      continue
    }

    proj.plans.forEach((p, i) => {
      r.tableRow(
        cols,
        [
          p.tag ?? '—',
          p.procedureCode ?? '—',
          p.procedureTitle ?? '—',
          frequency(p.frequency),
          p.nextDueDate,
          t(`preservation.due.${p.due}`),
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
