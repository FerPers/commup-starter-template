/**
 * ITR (Inspection & Test Record) PDF — pdf-lib (Workers-native).
 * Replaces the @react-pdf/renderer implementation in ItrPdfDocument.tsx.
 */

import {
  Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H, BOTTOM_LIMIT,
  sanitize, truncateToWidth, wrapText,
  type Color,
} from './renderer'

type ItrItem = {
  id: string
  item_number: string | null
  description: string
  item_type: string
  is_critical: boolean
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  unit: string | null
  order_index: number
}

type ItrSection = {
  id: string
  title: string
  order_index: number
  itr_template_items: ItrItem[]
}

type ItrResponse = {
  item_id: string
  value_text: string | null
  value_numeric: number | null
  value_bool: boolean | null
  value_option: string | null
  remarks: string | null
  is_passed: boolean | null
}

type ItrSignature = {
  role: string
  signed_at: string
  profiles: { full_name: string } | null
}

export type ItrPdfData = {
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  itr_templates: {
    code: string
    title: string
    description: string | null
    itr_template_sections: ItrSection[]
  } | null
  tags: { tag_number: string; description: string } | null
  projects: { code: string; name: string } | null
  itr_responses: ItrResponse[]
  itr_signatures: ItrSignature[]
}

function statusVisual(status: string): { fg: Color; bg: Color; label: string } {
  const s = status.toLowerCase()
  if (s === 'approved')    return { fg: COLOR.purple,      bg: COLOR.purpleBg,    label: 'APPROVED' }
  if (s === 'completed')   return { fg: COLOR.greenStrong, bg: COLOR.greenBg,     label: 'COMPLETED' }
  if (s === 'in_progress') return { fg: COLOR.blue,        bg: COLOR.blueBg,      label: 'IN PROGRESS' }
  if (s === 'rejected')    return { fg: COLOR.red,         bg: COLOR.redBg,       label: 'REJECTED' }
  if (s === 'not_started') return { fg: COLOR.muted,       bg: COLOR.borderLight, label: 'NOT STARTED' }
  return { fg: COLOR.muted, bg: COLOR.borderLight, label: status.toUpperCase() }
}

function formatResponse(item: ItrItem, response: ItrResponse | undefined): string {
  if (!response) return '-'
  if (item.item_type === 'checkbox' || item.item_type === 'yes_no') {
    return response.value_bool === true ? 'OK Yes' : response.value_bool === false ? 'X No' : '-'
  }
  if (item.item_type === 'measurement' || item.item_type === 'number') {
    const val = response.value_numeric
    if (val === null || val === undefined) return '-'
    return `${val}${item.unit ? ` ${item.unit}` : ''}`
  }
  if (item.item_type === 'select') return response.value_option ?? '-'
  if (item.item_type === 'text') return response.value_text?.slice(0, 40) ?? '-'
  if (item.item_type === 'photo') return response.value_text ? '[photo]' : '-'
  if (item.item_type === 'signature') return response.value_text ? '[signed]' : '-'
  if (item.item_type === 'date') return response.value_text ?? '-'
  return '-'
}

export async function renderItrPdf(itr: ItrPdfData): Promise<Uint8Array> {
  const r = await Renderer.create()
  r.doc.setTitle(`ITR ${itr.itr_number}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Inspection & Test Record')

  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
  const visual = statusVisual(itr.status)
  const progressPct = itr.progress_pct ?? 0

  r.setFooter(({ page, pageNum }) => {
    const footerY = MARGIN
    page.drawLine({
      start: { x: MARGIN, y: footerY + FOOTER_H - 4 },
      end:   { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 },
      thickness: 0.5, color: COLOR.borderLight,
    })
    page.drawText(sanitize(`CommUp · ITR ${itr.itr_number}`), {
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

  // ─── Header (left-aligned with right-side info) ──────────────────────────
  // CommUp logo + subtitle on left, ITR number + status badge on right
  r.drawText('CommUp', { x: MARGIN, y: r.y - 16, size: 16, bold: true, color: COLOR.purple })
  r.drawText('Inspection & Test Record', {
    x: MARGIN, y: r.y - 26, size: 8, color: COLOR.muted,
  })

  r.drawTextRight(itr.itr_number, { rightX: A4_W - MARGIN, y: r.y - 14, size: 13, bold: true, color: COLOR.text })
  // Status badge right-aligned
  const badgeTxt = sanitize(visual.label)
  const badgeW = r.fontBold.widthOfTextAtSize(badgeTxt, 8) + 12
  const badgeH = 14
  const badgeX = A4_W - MARGIN - badgeW
  r.drawRect({ x: badgeX, y: r.y - 32, width: badgeW, height: badgeH, color: visual.bg })
  r.page.drawText(badgeTxt, {
    x: badgeX + 6, y: r.y - 29, size: 8, font: r.fontBold, color: visual.fg,
  })

  r.moveY(40)

  // Meta row (wrapped key:value pairs)
  const metas: Array<[string, string | null | undefined]> = [
    ['Project',  itr.projects ? `${itr.projects.code} — ${itr.projects.name}` : null],
    ['Tag',      itr.tags ? `${itr.tags.tag_number} — ${itr.tags.description}` : null],
    ['Date',     itr.scheduled_date],
    ['Template', itr.itr_templates ? `${itr.itr_templates.code} — ${itr.itr_templates.title}` : null],
  ]
  const metaTextSize = 9
  for (const [label, value] of metas) {
    if (!value) continue
    r.ensureSpace(metaTextSize + 4)
    const labelTxt = `${label}: `
    r.drawText(labelTxt, { x: MARGIN, y: r.y - metaTextSize, size: metaTextSize, bold: true, color: COLOR.textLight })
    const labelW = r.fontBold.widthOfTextAtSize(sanitize(labelTxt), metaTextSize)
    r.drawText(value, {
      x: MARGIN + labelW, y: r.y - metaTextSize, size: metaTextSize, color: COLOR.text,
      maxWidth: CONTENT_W - labelW,
    })
    r.moveY(metaTextSize + 3)
  }

  // Progress bar
  r.moveY(4)
  r.ensureSpace(14)
  const progLabel = 'Progress:'
  r.drawText(progLabel, { x: MARGIN, y: r.y - 8, size: 8, color: COLOR.muted })
  const labelW = r.fontRegular.widthOfTextAtSize(sanitize(progLabel), 8)
  const barX = MARGIN + labelW + 6
  const barW = CONTENT_W - labelW - 6 - 30
  const barY = r.y - 8
  r.drawRect({ x: barX, y: barY, width: barW, height: 5, color: COLOR.borderLight })
  const fillColor = progressPct >= 100 ? COLOR.greenStrong : COLOR.blue
  r.drawRect({ x: barX, y: barY, width: barW * (progressPct / 100), height: 5, color: fillColor })
  r.drawTextRight(`${progressPct}%`, { rightX: A4_W - MARGIN, y: barY, size: 8, color: COLOR.muted })
  r.moveY(14)

  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1.2, COLOR.text)
  r.moveY(8)

  // ─── Column headers row ──────────────────────────────────────────────────
  const COLS = {
    num:  { x: MARGIN,                 w: 28 },
    desc: { x: MARGIN + 28,             w: CONTENT_W - 28 - 90 - 38 },
    resp: { x: MARGIN + CONTENT_W - 128, w: 90 },
    result: { x: MARGIN + CONTENT_W - 38, w: 38 },
  }

  const drawColumnHeaders = () => {
    r.ensureSpace(16)
    r.drawRect({ x: MARGIN, y: r.y - 14, width: CONTENT_W, height: 14, color: COLOR.borderXlight })
    r.drawText('#',           { x: COLS.num.x + 4, y: r.y - 10, size: 7.5, bold: true, color: COLOR.muted })
    r.drawText('Description', { x: COLS.desc.x + 4, y: r.y - 10, size: 7.5, bold: true, color: COLOR.muted })
    const respTxt = sanitize('Response')
    const respTxtW = r.fontBold.widthOfTextAtSize(respTxt, 7.5)
    r.page.drawText(respTxt, {
      x: COLS.resp.x + (COLS.resp.w - respTxtW) / 2, y: r.y - 10, size: 7.5, font: r.fontBold, color: COLOR.muted,
    })
    const resTxt = sanitize('Result')
    const resTxtW = r.fontBold.widthOfTextAtSize(resTxt, 7.5)
    r.page.drawText(resTxt, {
      x: COLS.result.x + (COLS.result.w - resTxtW) / 2, y: r.y - 10, size: 7.5, font: r.fontBold, color: COLOR.muted,
    })
    r.moveY(16)
  }

  drawColumnHeaders()

  // ─── Sections + items ────────────────────────────────────────────────────
  const sections = (itr.itr_templates?.itr_template_sections ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)

  const responseMap = Object.fromEntries(itr.itr_responses.map(rr => [rr.item_id, rr]))

  for (const section of sections) {
    // Section header
    r.moveY(6)
    r.ensureSpace(18)
    r.drawRect({ x: MARGIN, y: r.y - 16, width: CONTENT_W, height: 16, color: COLOR.borderXlight })
    r.drawRect({ x: MARGIN, y: r.y - 16, width: 3, height: 16, color: COLOR.purple })
    r.drawText(section.title.toUpperCase(), {
      x: MARGIN + 10, y: r.y - 12, size: 8.5, bold: true, color: COLOR.textLight,
    })
    r.moveY(18)

    const items = (section.itr_template_items ?? [])
      .slice()
      .sort((a, b) => a.order_index - b.order_index)

    for (const item of items) {
      const resp = responseMap[item.id]
      const isPassed = resp?.is_passed
      const responseText = formatResponse(item, resp)

      // Pre-compute height
      const descMaxW = COLS.desc.w - 16 - (item.is_critical ? 10 : 0)
      const descLines = wrapText(item.description, r.fontRegular, 8.5, descMaxW)
      const acceptanceText = item.acceptance_text
        ? `Criterion: ${item.acceptance_text}`
        : (item.acceptance_min !== null || item.acceptance_max !== null)
          ? `Range: ${item.acceptance_min ?? '-'} - ${item.acceptance_max ?? '-'}${item.unit ? ` ${item.unit}` : ''}`
          : null
      const acceptanceLines = acceptanceText ? wrapText(acceptanceText, r.fontRegular, 7, descMaxW) : []
      const remarksText = resp?.remarks ? `Remarks: ${resp.remarks}` : null
      const remarksLines = remarksText ? wrapText(remarksText, r.fontOblique, 7.5, descMaxW) : []
      const rowH = Math.max(
        18,
        4 + descLines.length * 11 + acceptanceLines.length * 9 + remarksLines.length * 10 + 4
      )

      // Page break + redraw column headers if needed
      if (r.y - rowH < BOTTOM_LIMIT) {
        r.newPage()
        drawColumnHeaders()
      }

      // Row background (fail tint)
      if (isPassed === false) {
        r.drawRect({ x: MARGIN, y: r.y - rowH, width: CONTENT_W, height: rowH, color: COLOR.redBg })
      }

      // Item number
      r.drawText(item.item_number ?? '', {
        x: COLS.num.x + 4, y: r.y - 10, size: 8, oblique: true, color: COLOR.empty,
      })

      // Critical dot (if critical)
      const descX = COLS.desc.x + 4
      let dx = descX
      if (item.is_critical) {
        r.page.drawCircle({
          x: dx + 3, y: r.y - 8, size: 2.5, color: COLOR.red,
        })
        dx += 8
      }

      // Description lines
      let ly = r.y - 10
      for (const line of descLines) {
        r.drawText(line, { x: dx, y: ly, size: 8.5, color: COLOR.text })
        ly -= 11
      }
      // Acceptance
      for (const line of acceptanceLines) {
        r.drawText(line, { x: descX, y: ly, size: 7, color: COLOR.empty })
        ly -= 9
      }
      // Remarks
      for (const line of remarksLines) {
        r.drawText(line, { x: descX, y: ly, size: 7.5, oblique: true, color: COLOR.muted })
        ly -= 10
      }

      // Response column
      const respColor = isPassed === true ? COLOR.greenStrong : isPassed === false ? COLOR.red : COLOR.muted
      const respFont = isPassed !== null ? r.fontBold : r.fontRegular
      const respTxt = truncateToWidth(responseText, respFont, 8.5, COLS.resp.w - 8)
      const respW = respFont.widthOfTextAtSize(respTxt, 8.5)
      r.page.drawText(respTxt, {
        x: COLS.resp.x + (COLS.resp.w - respW) / 2, y: r.y - 10, size: 8.5, font: respFont, color: respColor,
      })

      // Result column (PASS/FAIL)
      const resTxt = isPassed === true ? 'PASS' : isPassed === false ? 'FAIL' : ''
      if (resTxt) {
        const resFont = r.fontBold
        const resW = resFont.widthOfTextAtSize(resTxt, 8.5)
        const resColor = isPassed === true ? COLOR.greenStrong : COLOR.red
        r.page.drawText(resTxt, {
          x: COLS.result.x + (COLS.result.w - resW) / 2, y: r.y - 10, size: 8.5, font: resFont, color: resColor,
        })
      }

      // Row separator
      r.drawHLine(MARGIN, A4_W - MARGIN, r.y - rowH, 0.3, COLOR.borderLight)
      r.moveY(rowH)
    }
  }

  // ─── Signatures ──────────────────────────────────────────────────────────
  r.moveY(12)
  r.ensureSpace(80)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1, COLOR.border)
  r.moveY(10)
  r.drawText('SIGNATURES', { x: MARGIN, y: r.y - 9, size: 9, bold: true, color: COLOR.muted })
  r.moveY(16)

  const sigBoxes = (['executor', 'supervisor', 'client'] as const).map(role => {
    const sig = itr.itr_signatures.find(s => s.role === role)
    return {
      role: role.charAt(0).toUpperCase() + role.slice(1),
      name: sig?.profiles?.full_name,
      date: sig?.signed_at?.slice(0, 10),
    }
  })
  r.signatureGrid(sigBoxes, { accentColor: COLOR.purple })

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
