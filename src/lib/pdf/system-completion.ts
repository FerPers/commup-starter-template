/**
 * System Completion Status PDF — pdf-lib (Workers-native).
 *
 * The flagship commissioning deliverable: per subsystem (grouped by system),
 * ITR completion, open punches by category, certificate status and readiness
 * toward Mechanical Completion. Mirrors the layout patterns of phase-progress.ts.
 */

import {
  Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H,
  sanitize, bi,
  type Color, type TableCol,
} from './renderer'
import { todayIn } from '@/lib/time/zone'

export type SubsystemStatus = {
  code: string
  name: string
  phaseCode: string | null
  itrTotal: number
  itrApproved: number
  punchOpenA: number
  punchOpenB: number
  punchOpenC: number
  certStatus: 'issued' | 'in_review' | 'pending' | 'rejected' | 'none'
}

export type SystemGroup = {
  code: string
  name: string
  subsystems: SubsystemStatus[]
}

export type SystemCompletionData = {
  projectName: string
  projectCode: string
  projectClient: string | null
  systems: SystemGroup[]
  /** Zona del proyecto: fecha «Generado» (el Worker corre en UTC). */
  timezone?: string | null
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

/** A subsystem is ready for MC when all ITRs are approved and no Cat A punch is open. */
function isReady(s: SubsystemStatus): boolean {
  return s.itrTotal > 0 && s.itrApproved === s.itrTotal && s.punchOpenA === 0
}

const CERT_LABEL: Record<SubsystemStatus['certStatus'], string> = {
  issued: 'Emitido / Issued',
  in_review: 'En revisión / In review',
  pending: 'Pendiente / Pending',
  rejected: 'Rechazado / Rejected',
  none: '—',
}

// V3: encabezado bilingüe; A / B / C son iguales en los dos idiomas (sin segunda línea).
const COLS: TableCol[] = [
  { w: 54, label: 'Subsistema', labelEn: 'Subsystem' },
  { w: 121, label: 'Nombre', labelEn: 'Name' },
  { w: 32, label: 'Fase', labelEn: 'Phase', align: 'center' },
  { w: 46, label: 'ITR', labelEn: 'ITRs', align: 'center' },
  { w: 40, label: 'Avance', labelEn: 'Progress', align: 'right' },
  { w: 22, label: 'A', labelEn: '', align: 'center' },
  { w: 22, label: 'B', labelEn: '', align: 'center' },
  { w: 22, label: 'C', labelEn: '', align: 'center' },
  { w: 94, label: 'Certificado', labelEn: 'Certificate', align: 'center' },
  { w: 70, label: 'Listo MC', labelEn: 'MC ready', align: 'center' },
]

export async function renderSystemCompletionPdf(data: SystemCompletionData): Promise<Uint8Array> {
  const r = await Renderer.create()
  // V3: PDF formal bilingüe (español / inglés), como el del ITR.
  r.doc.setTitle(`Completamiento de sistemas / System Completion · ${data.projectCode}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Estado de completamiento de sistemas / System Completion Status Report')

  const generatedAt = todayIn(data.timezone)

  // Project-level aggregates
  const allSubs = data.systems.flatMap(s => s.subsystems)
  const totalSubs = allSubs.length
  const readySubs = allSubs.filter(isReady).length
  const totalItr = allSubs.reduce((n, s) => n + s.itrTotal, 0)
  const approvedItr = allSubs.reduce((n, s) => n + s.itrApproved, 0)
  const totalOpenA = allSubs.reduce((n, s) => n + s.punchOpenA, 0)
  const certsIssued = allSubs.filter(s => s.certStatus === 'issued').length

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
  r.drawTextCentered(bi('Estado de completamiento de sistemas', 'System Completion Status'), { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
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

  // ─── Executive summary cards ──────────────────────────────────────────────
  r.infoCardRow([
    { label: bi('Listos para MC', 'MC-ready'), value: `${readySubs} / ${totalSubs}`, sub: `${pct(readySubs, totalSubs)}%` },
    { label: bi('ITR aprobados', 'Approved'), value: `${approvedItr} / ${totalItr}`, sub: `${pct(approvedItr, totalItr)}%` },
    { label: bi('Cat A abiertos', 'Open Cat A'), value: String(totalOpenA), sub: totalOpenA > 0 ? bi('Bloquea', 'Blocking') : bi('Ninguno', 'None') },
    { label: bi('Cert. emitidos', 'Issued'), value: String(certsIssued) },
  ])

  // ─── Per-system tables ────────────────────────────────────────────────────
  if (data.systems.length === 0) {
    r.accentSection(bi('Sistemas', 'Systems'))
    r.empty(bi('El proyecto no tiene sistemas configurados.', 'No systems configured for this project.'))
  }

  for (const sys of data.systems) {
    r.accentSection(`${sys.code} — ${sys.name}`)
    r.tableHeader(COLS)

    if (sys.subsystems.length === 0) {
      r.empty(bi('El sistema no tiene subsistemas.', 'No subsystems in this system.'))
    }

    sys.subsystems.forEach((s, i) => {
      const p = pct(s.itrApproved, s.itrTotal)
      const ready = isReady(s)
      const pctColor: Color =
        p === 100 ? COLOR.greenStrong : p >= 50 ? COLOR.amber : p > 0 ? COLOR.blue : COLOR.muted
      const aColor: Color = s.punchOpenA > 0 ? COLOR.red : COLOR.muted
      const certColor: Color = s.certStatus === 'issued' ? COLOR.greenStrong
        : s.certStatus === 'rejected' ? COLOR.red
        : s.certStatus === 'none' ? COLOR.muted : COLOR.blue
      const readyColor: Color = ready ? COLOR.greenStrong : COLOR.muted

      r.tableRow(
        COLS,
        [
          s.code,
          s.name,
          s.phaseCode ?? '—',
          `${s.itrApproved}/${s.itrTotal}`,
          `${p}%`,
          String(s.punchOpenA),
          String(s.punchOpenB),
          String(s.punchOpenC),
          CERT_LABEL[s.certStatus],
          ready ? 'LISTO / READY' : 'Aún no / Not yet',
        ],
        {
          alternate: i % 2 === 1,
          valueColors: [COLOR.text, COLOR.text, COLOR.muted, COLOR.text, pctColor, aColor, COLOR.muted, COLOR.muted, certColor, readyColor],
          valueBold: [true, false, false, false, true, s.punchOpenA > 0, false, false, false, ready],
        },
      )
    })

    // System subtotal strip
    const sysItrTotal = sys.subsystems.reduce((n, s) => n + s.itrTotal, 0)
    const sysItrApproved = sys.subsystems.reduce((n, s) => n + s.itrApproved, 0)
    const sysReady = sys.subsystems.filter(isReady).length
    const sysOpenA = sys.subsystems.reduce((n, s) => n + s.punchOpenA, 0)
    r.moveY(2)
    r.ensureSpace(12)
    r.drawText(
      sanitize(`Subtotal: ${bi('listos para MC', 'MC-ready')} ${sysReady}/${sys.subsystems.length} · ITR ${sysItrApproved}/${sysItrTotal} (${pct(sysItrApproved, sysItrTotal)}%) · ${bi('Cat A abiertos', 'open Cat A')} ${sysOpenA}`),
      { x: MARGIN + 4, y: r.y - 8, size: 7.5, oblique: true, color: COLOR.muted },
    )
    r.moveY(12)
  }

  // ─── Legend ───────────────────────────────────────────────────────────────
  r.moveY(6)
  r.ensureSpace(26)
  r.drawText(
    sanitize('A / B / C = punch abiertos por categoría. Listo MC = todos los ITR aprobados y ningún punch Cat A abierto.'),
    { x: MARGIN, y: r.y - 8, size: 7.5, oblique: true, color: COLOR.empty, maxWidth: CONTENT_W },
  )
  r.moveY(11)
  r.drawText(
    sanitize('A / B / C = open punches by category. MC ready = all ITRs approved and no open Cat A punch.'),
    { x: MARGIN, y: r.y - 8, size: 7.5, oblique: true, color: COLOR.empty, maxWidth: CONTENT_W },
  )
  r.moveY(12)

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
