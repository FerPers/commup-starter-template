/**
 * Area KPIs executive PDF — pdf-lib (Workers-native).
 * Per-area snapshot for project review meetings: tags, ITRs, punches by
 * category, certificates, plus top-3 systems by open punches.
 */

import {
  Renderer, COLOR, A4_W, A4_H, MARGIN, CONTENT_W, FOOTER_H,
  sanitize, truncateToWidth,
  type Color,
} from './renderer'

export type AreaSystemTopEntry = {
  code: string
  name: string
  openPunches: number
}

export type AreaKpisRow = {
  id: string
  code: string
  name: string
  tagCount: number
  itrs: { total: number; completed: number; approved: number }
  punches: { openA: number; openB: number; openC: number }
  certs: { total: number; issued: number }
  topSystems: AreaSystemTopEntry[]
}

export type AreaKpisData = {
  projectName: string
  projectCode: string
  projectClient: string | null
  areas: AreaKpisRow[]
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export async function renderAreaKpisPdf(data: AreaKpisData): Promise<Uint8Array> {
  const r = await Renderer.create()
  r.doc.setTitle(`Area KPIs · ${data.projectCode}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Area KPIs Report')

  const generatedAt = new Date().toISOString().slice(0, 10)

  // Global aggregates (sum across areas)
  const totals = data.areas.reduce(
    (acc, a) => ({
      tags: acc.tags + a.tagCount,
      itrs: acc.itrs + a.itrs.total,
      approved: acc.approved + a.itrs.approved,
      completed: acc.completed + a.itrs.completed,
      certsTotal: acc.certsTotal + a.certs.total,
      certsIssued: acc.certsIssued + a.certs.issued,
      openA: acc.openA + a.punches.openA,
      openB: acc.openB + a.punches.openB,
      openC: acc.openC + a.punches.openC,
    }),
    { tags: 0, itrs: 0, approved: 0, completed: 0, certsTotal: 0, certsIssued: 0, openA: 0, openB: 0, openC: 0 },
  )
  const overallPct = pct(totals.approved, totals.itrs)
  const totalOpenPunches = totals.openA + totals.openB + totals.openC

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
  r.drawTextCentered('Area KPIs Report', { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
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

  // ─── Project-level summary cards ──────────────────────────────────────────
  r.infoCardRow([
    { label: 'Areas',            value: String(data.areas.length) },
    { label: 'Tags',             value: String(totals.tags) },
    { label: 'ITRs Approved',    value: `${totals.approved} / ${totals.itrs}`, sub: `${overallPct}%` },
    { label: 'Certs Issued',     value: `${totals.certsIssued} / ${totals.certsTotal}` },
    { label: 'Open Punches',     value: String(totalOpenPunches), sub: `A:${totals.openA} B:${totals.openB} C:${totals.openC}` },
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

  // ─── Per-area detail ──────────────────────────────────────────────────────
  r.accentSection('Area Detail')

  if (data.areas.length === 0) {
    r.empty('No areas configured for this project.')
  }

  for (const area of data.areas) {
    const areaPct = pct(area.itrs.approved, area.itrs.total)
    const topRows = area.topSystems.length

    // Block height depends on whether we have top systems and how many
    const baseH = 100
    const topH = topRows > 0 ? 16 + topRows * 12 : 0
    const blockH = baseH + topH

    r.ensureSpace(blockH + 8)
    const top = r.y

    // Card background + left accent
    r.drawRect({
      x: MARGIN, y: top - blockH, width: CONTENT_W, height: blockH,
      color: COLOR.cardBg, borderColor: COLOR.border, borderWidth: 0.5,
    })
    r.drawRect({ x: MARGIN, y: top - blockH, width: 4, height: blockH, color: COLOR.purple })

    // Area code badge (top-right)
    const codeTxt = sanitize(area.code)
    const codeW = r.fontBold.widthOfTextAtSize(codeTxt, 10) + 14
    const codeH = 18
    const codeX = A4_W - MARGIN - 8 - codeW
    const codeY = top - 8 - codeH
    r.drawRect({ x: codeX, y: codeY, width: codeW, height: codeH, color: COLOR.purple })
    r.page.drawText(codeTxt, {
      x: codeX + 7, y: codeY + 5, size: 10, font: r.fontBold, color: COLOR.white,
    })

    // Area name (top-left)
    const nameMaxW = CONTENT_W - 24 - codeW - 8
    r.drawText(area.name, {
      x: MARGIN + 14, y: top - 18, size: 12, bold: true, color: COLOR.text, maxWidth: nameMaxW,
    })

    // Stats row — 5 inline metrics
    const innerX = MARGIN + 14
    const innerW = CONTENT_W - 28
    const cellW = innerW / 5
    const statY = top - 38
    const cells = [
      { label: 'TAGS',          value: String(area.tagCount),                color: COLOR.text },
      { label: 'ITRS TOTAL',    value: String(area.itrs.total),              color: COLOR.text },
      { label: 'COMPLETED',     value: String(area.itrs.completed),          color: COLOR.amber },
      { label: 'APPROVED',      value: `${area.itrs.approved} (${areaPct}%)`, color: COLOR.greenStrong },
      { label: 'CERTS ISSUED',  value: `${area.certs.issued}/${area.certs.total}`, color: COLOR.text },
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
    const aBarH = 7
    const aBarY = top - 72
    r.drawRect({ x: innerX, y: aBarY, width: innerW, height: aBarH, color: COLOR.borderXlight })
    if (area.itrs.total > 0) {
      r.drawRect({
        x: innerX, y: aBarY, width: (innerW * areaPct) / 100, height: aBarH, color: COLOR.purple,
      })
    }

    // Punch badges (A / B / C) inline
    const punchY = top - 90
    let bx = innerX
    const drawPunchBadge = (label: string, count: number, fg: Color, bg: Color) => {
      const txt = `${label}: ${count}`
      const w = r.fontBold.widthOfTextAtSize(txt, 8) + 12
      const h = 14
      r.drawRect({ x: bx, y: punchY - 3, width: w, height: h, color: bg })
      r.page.drawText(sanitize(txt), {
        x: bx + 6, y: punchY, size: 8, font: r.fontBold, color: fg,
      })
      bx += w + 6
    }
    drawPunchBadge('Cat A', area.punches.openA, area.punches.openA > 0 ? COLOR.red    : COLOR.muted, area.punches.openA > 0 ? COLOR.redBg    : COLOR.borderXlight)
    drawPunchBadge('Cat B', area.punches.openB, area.punches.openB > 0 ? COLOR.amber  : COLOR.muted, area.punches.openB > 0 ? COLOR.amberBg  : COLOR.borderXlight)
    drawPunchBadge('Cat C', area.punches.openC, area.punches.openC > 0 ? COLOR.blue   : COLOR.muted, area.punches.openC > 0 ? COLOR.blueBg   : COLOR.borderXlight)

    // Top systems drill-down
    if (topRows > 0) {
      const topYStart = top - baseH - 4
      r.page.drawText('TOP SYSTEMS BY OPEN PUNCHES', {
        x: innerX, y: topYStart, size: 7, font: r.fontBold, color: COLOR.muted,
      })
      let ty = topYStart - 12
      for (const sys of area.topSystems) {
        const label = truncateToWidth(`${sys.code} — ${sys.name}`, r.fontRegular, 9, innerW - 60)
        r.page.drawText(label, {
          x: innerX, y: ty, size: 9, font: r.fontRegular, color: COLOR.text,
        })
        const cntTxt = `${sys.openPunches}`
        r.drawTextRight(cntTxt, {
          rightX: A4_W - MARGIN - 14, y: ty, size: 9, bold: true,
          color: sys.openPunches > 0 ? COLOR.red : COLOR.muted,
        })
        ty -= 12
      }
    }

    r.y = top - blockH - 8
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
