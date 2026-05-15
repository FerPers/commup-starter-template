/**
 * Phase Progress executive PDF — pdf-lib (Workers-native).
 * Mirrors the layout patterns of certificate.ts / pssr.ts.
 */

import { rgb } from 'pdf-lib'
import {
  Renderer, COLOR, A4_W, A4_H, MARGIN, CONTENT_W, FOOTER_H,
  sanitize, truncateToWidth,
  type Color,
} from './renderer'

export type PhaseProgressRow = {
  id: string
  code: string
  name: string
  colorHex: string
  itrs: { total: number; in_progress: number; completed: number; approved: number }
  certs: { total: number; issued: number }
  openCatA: number
}

export type PhaseProgressData = {
  projectName: string
  projectCode: string
  projectClient: string | null
  phases: PhaseProgressRow[]
  unassignedOpenCatA: number
}

function hexToRgb(hex: string): Color {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return COLOR.purple
  const h = m[1]
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  )
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export async function renderPhaseProgressPdf(data: PhaseProgressData): Promise<Uint8Array> {
  const r = await Renderer.create()
  r.doc.setTitle(`Phase Progress · ${data.projectCode}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Phase Progress Report')

  const generatedAt = new Date().toISOString().slice(0, 10)

  // Project-level aggregates
  const totals = data.phases.reduce(
    (acc, p) => ({
      itrs: acc.itrs + p.itrs.total,
      approved: acc.approved + p.itrs.approved,
      completed: acc.completed + p.itrs.completed,
      inProgress: acc.inProgress + p.itrs.in_progress,
      certsTotal: acc.certsTotal + p.certs.total,
      certsIssued: acc.certsIssued + p.certs.issued,
      openCatA: acc.openCatA + p.openCatA,
    }),
    { itrs: 0, approved: 0, completed: 0, inProgress: 0, certsTotal: 0, certsIssued: 0, openCatA: 0 },
  )
  const overallPct = pct(totals.approved, totals.itrs)
  const totalOpenCatA = totals.openCatA + data.unassignedOpenCatA

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
  r.y = A4_H - MARGIN - 8
  r.drawTextCentered('CommUp', { y: r.y - 18, size: 18, bold: true, color: COLOR.purple })
  r.moveY(22)
  r.drawTextCentered('Phase Progress Report', { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
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

  // ─── Executive summary cards ──────────────────────────────────────────────
  r.infoCardRow([
    { label: 'Overall ITR Progress', value: `${overallPct}%`, sub: `${totals.approved} / ${totals.itrs} approved` },
    { label: 'Certificates Issued',  value: `${totals.certsIssued} / ${totals.certsTotal}` },
    { label: 'Open Cat A Punches',   value: String(totalOpenCatA), sub: totalOpenCatA > 0 ? 'Blocking' : 'None' },
    { label: 'Phases',               value: String(data.phases.length) },
  ])

  // Overall progress bar
  r.ensureSpace(28)
  const barTop = r.y
  const barH = 10
  const barY = barTop - 14 - barH
  r.drawText('Overall Progress (Approved ITRs)', {
    x: MARGIN, y: barTop - 10, size: 8, bold: true, color: COLOR.muted,
  })
  r.drawTextRight(`${overallPct}%`, {
    rightX: A4_W - MARGIN, y: barTop - 10, size: 8, bold: true, color: COLOR.text,
  })
  r.drawRect({ x: MARGIN, y: barY, width: CONTENT_W, height: barH, color: COLOR.borderXlight })
  if (totals.itrs > 0) {
    r.drawRect({
      x: MARGIN, y: barY, width: (CONTENT_W * overallPct) / 100, height: barH, color: COLOR.purple,
    })
  }
  r.y = barY - 4

  // ─── Per-phase detail ─────────────────────────────────────────────────────
  r.accentSection('Phase Detail')

  if (data.phases.length === 0) {
    r.empty('No phases configured for this project.')
  }

  for (const phase of data.phases) {
    const phaseColor = hexToRgb(phase.colorHex)
    const phasePct = pct(phase.itrs.approved, phase.itrs.total)

    // Reserve approximate space for a phase block (header + stats + bar)
    const blockH = 96
    r.ensureSpace(blockH + 6)
    const top = r.y

    // Card background
    r.drawRect({
      x: MARGIN, y: top - blockH, width: CONTENT_W, height: blockH,
      color: COLOR.cardBg, borderColor: COLOR.border, borderWidth: 0.5,
    })
    // Left phase-color accent strip
    r.drawRect({ x: MARGIN, y: top - blockH, width: 4, height: blockH, color: phaseColor })

    // Phase code badge (top-right)
    const codeTxt = sanitize(phase.code)
    const codeW = r.fontBold.widthOfTextAtSize(codeTxt, 10) + 14
    const codeH = 18
    const codeX = A4_W - MARGIN - 8 - codeW
    const codeY = top - 8 - codeH
    r.drawRect({ x: codeX, y: codeY, width: codeW, height: codeH, color: phaseColor })
    r.page.drawText(codeTxt, {
      x: codeX + 7, y: codeY + 5, size: 10, font: r.fontBold, color: COLOR.white,
    })

    // Phase name (top-left, room for badge on right)
    const nameMaxW = CONTENT_W - 24 - codeW - 8
    r.drawText(phase.name, {
      x: MARGIN + 14, y: top - 18, size: 12, bold: true, color: COLOR.text, maxWidth: nameMaxW,
    })

    // Stats row — 4 inline metrics under the name
    const statY = top - 38
    const innerX = MARGIN + 14
    const innerW = CONTENT_W - 28
    const cellW = innerW / 4
    const cells = [
      { label: 'TOTAL ITRS',      value: String(phase.itrs.total),      color: COLOR.text },
      { label: 'IN PROGRESS',     value: String(phase.itrs.in_progress), color: COLOR.blue },
      { label: 'COMPLETED',       value: String(phase.itrs.completed),  color: COLOR.amber },
      { label: 'APPROVED',        value: `${phase.itrs.approved} (${phasePct}%)`, color: COLOR.greenStrong },
    ]
    cells.forEach((c, i) => {
      const cx = innerX + cellW * i
      r.page.drawText(sanitize(c.label), {
        x: cx, y: statY, size: 7, font: r.fontBold, color: COLOR.muted,
      })
      const v = truncateToWidth(c.value, r.fontBold, 12, cellW - 4)
      r.page.drawText(v, {
        x: cx, y: statY - 14, size: 12, font: r.fontBold, color: c.color,
      })
    })

    // Progress bar
    const phBarH = 7
    const phBarY = top - 72
    r.drawRect({ x: innerX, y: phBarY, width: innerW, height: phBarH, color: COLOR.borderXlight })
    if (phase.itrs.total > 0) {
      r.drawRect({
        x: innerX, y: phBarY, width: (innerW * phasePct) / 100, height: phBarH, color: phaseColor,
      })
    }

    // Bottom strip: certificates + Cat A badge
    const stripY = top - 86
    r.page.drawText(
      sanitize(`Certificates: ${phase.certs.issued} / ${phase.certs.total} issued`),
      { x: innerX, y: stripY, size: 8, font: r.fontRegular, color: COLOR.muted },
    )

    const catATxt = `Cat A open: ${phase.openCatA}`
    const catAColor = phase.openCatA > 0 ? COLOR.red : COLOR.muted
    const catABg = phase.openCatA > 0 ? COLOR.redBg : COLOR.borderXlight
    const catAW = r.fontBold.widthOfTextAtSize(catATxt, 8) + 12
    const catAH = 14
    const catAX = A4_W - MARGIN - 14 - catAW
    r.drawRect({ x: catAX, y: stripY - 3, width: catAW, height: catAH, color: catABg })
    r.page.drawText(sanitize(catATxt), {
      x: catAX + 6, y: stripY, size: 8, font: r.fontBold, color: catAColor,
    })

    r.y = top - blockH - 8
  }

  // ─── Unassigned punches note ──────────────────────────────────────────────
  if (data.unassignedOpenCatA > 0) {
    r.moveY(4)
    r.ensureSpace(20)
    const noteH = 18
    r.drawRect({
      x: MARGIN, y: r.y - noteH, width: CONTENT_W, height: noteH,
      color: COLOR.amberBg, borderColor: COLOR.amberBorder, borderWidth: 0.5,
    })
    r.page.drawText(
      sanitize(`Note: ${data.unassignedOpenCatA} open Cat A punch(es) without a phase assignment (subsystem has no current phase).`),
      { x: MARGIN + 10, y: r.y - 12, size: 8, font: r.fontOblique, color: COLOR.amber },
    )
    r.moveY(noteH + 4)
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
