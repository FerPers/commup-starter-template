/**
 * PSSR (Pre-Startup Safety Review) PDF — pdf-lib (Workers-native).
 * Follows the same pattern as certificate.ts and itr.ts.
 */

import {
  Renderer, COLOR, A4_W, A4_H, MARGIN, CONTENT_W, FOOTER_H,
  sanitize, truncateToWidth, wrapText,
  type Color,
} from './renderer'

type PssrReviewItem = {
  id: string
  item_order: number
  category: string
  element: string
  requirement: string
  notes_hint: string | null
  status: 'pending' | 'si' | 'no' | 'na'
  responsible: string | null
  actions: string | null
  completion_date: string | null
}

type PssrSignatureRow = {
  id: string
  discipline: string | null
  signature_data: string
  signed_at: string
  profiles: { full_name: string } | null
}

export type PssrPdfData = {
  id: string
  review_number: string
  title: string
  status: 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected'
  notes: string | null
  review_due_date: string | null
  approved_at: string | null
  rfsu_certificate_id: string | null
  systems: { code: string; name: string } | null
  projectName: string
  projectCode: string
  projectClient: string | null
  items: PssrReviewItem[]
  signatures: PssrSignatureRow[]
}

function statusVisual(status: PssrPdfData['status']): { fg: Color; bg: Color; label: string } {
  if (status === 'approved')         return { fg: COLOR.greenStrong, bg: COLOR.greenBg,     label: 'APPROVED' }
  if (status === 'pending_approval') return { fg: COLOR.amber,       bg: COLOR.amberBg,     label: 'PENDING APPROVAL' }
  if (status === 'in_progress')      return { fg: COLOR.blue,        bg: COLOR.blueBg,      label: 'IN PROGRESS' }
  if (status === 'rejected')         return { fg: COLOR.red,         bg: COLOR.redBg,       label: 'REJECTED' }
  return { fg: COLOR.muted, bg: COLOR.borderLight, label: 'DRAFT' }
}

function itemStatusVisual(s: PssrReviewItem['status']): { fg: Color; bg: Color; label: string } {
  if (s === 'si') return { fg: COLOR.greenStrong, bg: COLOR.greenBg,     label: 'SI' }
  if (s === 'no') return { fg: COLOR.red,         bg: COLOR.redBg,       label: 'NO' }
  if (s === 'na') return { fg: COLOR.muted,       bg: COLOR.borderLight, label: 'N/A' }
  return            { fg: COLOR.empty,       bg: COLOR.borderXlight, label: '—' }
}

export async function renderPssrPdf(review: PssrPdfData): Promise<Uint8Array> {
  const r = await Renderer.create()
  r.doc.setTitle(`PSSR ${review.review_number}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Pre-Startup Safety Review')

  const generatedAt = new Date().toISOString().slice(0, 10)
  const visual = statusVisual(review.status)
  const total = review.items.length
  const resolved = review.items.filter(i => i.status === 'si' || i.status === 'na').length
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0

  r.setFooter(({ page, pageNum }) => {
    const footerY = MARGIN
    page.drawLine({
      start: { x: MARGIN, y: footerY + FOOTER_H - 4 },
      end:   { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 },
      thickness: 0.5, color: COLOR.borderLight,
    })
    page.drawText(sanitize(`CommUp · ${review.review_number}`), {
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
  r.drawTextCentered('Pre-Startup Safety Review', { y: r.y - 13, size: 13, bold: true, color: COLOR.text })
  r.moveY(15)
  r.drawTextCentered(review.review_number, { y: r.y - 11, size: 11, oblique: true, color: COLOR.muted })
  r.moveY(13)
  r.drawTextCentered(review.title, { y: r.y - 11, size: 11, bold: true, color: COLOR.text, maxWidth: CONTENT_W })
  r.moveY(16)

  // Status badge centered
  const badgeLabel = visual.label + (review.approved_at ? ` · ${review.approved_at.slice(0, 10)}` : '')
  const badgeTxt = sanitize(badgeLabel)
  const badgeW = r.fontBold.widthOfTextAtSize(badgeTxt, 9) + 24
  const badgeH = 18
  const badgeX = (A4_W - badgeW) / 2
  r.drawRect({ x: badgeX, y: r.y - badgeH, width: badgeW, height: badgeH, color: visual.bg })
  r.page.drawText(badgeTxt, {
    x: badgeX + 12, y: r.y - badgeH + 5, size: 9, font: r.fontBold, color: visual.fg,
  })
  r.moveY(badgeH + 6)

  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1.2, COLOR.text)
  r.moveY(10)

  // ─── Info card grid ───────────────────────────────────────────────────────
  const infoCards: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: 'Project',
      value: `${review.projectCode} — ${review.projectName}`,
      sub: review.projectClient ? `Client: ${review.projectClient}` : undefined,
    },
  ]
  if (review.systems) {
    infoCards.push({
      label: 'System',
      value: `${review.systems.code} — ${review.systems.name}`,
    })
  }
  infoCards.push({
    label: 'Progress',
    value: `${resolved} / ${total} (${pct}%)`,
    sub: review.review_due_date ? `Due: ${review.review_due_date}` : undefined,
  })
  r.infoCardRow(infoCards)

  // ─── Items by category ────────────────────────────────────────────────────
  // Preserve category order from items (first-seen)
  const catOrder: string[] = []
  const byCategory = new Map<string, PssrReviewItem[]>()
  for (const it of review.items) {
    if (!byCategory.has(it.category)) {
      byCategory.set(it.category, [])
      catOrder.push(it.category)
    }
    byCategory.get(it.category)!.push(it)
  }

  for (const cat of catOrder) {
    const catItems = byCategory.get(cat)!
    const catResolved = catItems.filter(i => i.status === 'si' || i.status === 'na').length
    r.accentSection(`${cat} (${catResolved}/${catItems.length})`)

    for (const item of catItems) {
      const iv = itemStatusVisual(item.status)
      const orderLabel = `#${item.item_order}`
      const wrapW = CONTENT_W - 80 // leaves room for status badge on the right

      const elementLines = wrapText(item.element, r.fontBold, 9, wrapW)
      const reqLines     = wrapText(item.requirement, r.fontRegular, 8.5, wrapW)
      const detailLines: string[] = []
      if (item.responsible)     detailLines.push(`Responsable: ${item.responsible}`)
      if (item.actions)         detailLines.push(`Acciones: ${item.actions}`)
      if (item.completion_date) detailLines.push(`Fecha: ${item.completion_date}`)
      const detailWrapped: string[] = []
      for (const d of detailLines) {
        for (const ln of wrapText(d, r.fontOblique, 7.5, wrapW)) detailWrapped.push(ln)
      }

      const blockH =
        8 +
        elementLines.length * 11 +
        reqLines.length * 10 +
        (detailWrapped.length > 0 ? 4 + detailWrapped.length * 9 : 0) +
        8

      r.ensureSpace(blockH + 4)
      const top = r.y

      // Left accent bar (status color)
      r.drawRect({ x: MARGIN, y: top - blockH, width: 3, height: blockH, color: iv.fg })

      // Order number
      r.page.drawText(sanitize(orderLabel), {
        x: MARGIN + 10, y: top - 14, size: 8, font: r.fontBold, color: COLOR.empty,
      })

      // Element + requirement (offset from order tag)
      const textX = MARGIN + 40
      let lineY = top - 14
      for (const ln of elementLines) {
        r.page.drawText(sanitize(ln), { x: textX, y: lineY, size: 9, font: r.fontBold, color: COLOR.text })
        lineY -= 11
      }
      for (const ln of reqLines) {
        r.page.drawText(sanitize(ln), { x: textX, y: lineY, size: 8.5, font: r.fontRegular, color: COLOR.textLight })
        lineY -= 10
      }
      if (detailWrapped.length > 0) {
        lineY -= 2
        for (const ln of detailWrapped) {
          r.page.drawText(sanitize(ln), { x: textX, y: lineY, size: 7.5, font: r.fontOblique, color: COLOR.muted })
          lineY -= 9
        }
      }

      // Status badge (top-right)
      const badgeTxtItem = iv.label
      const badgeWItem = r.fontBold.widthOfTextAtSize(badgeTxtItem, 8) + 14
      const badgeHItem = 16
      const badgeXItem = A4_W - MARGIN - badgeWItem
      const badgeYItem = top - badgeHItem - 2
      r.drawRect({ x: badgeXItem, y: badgeYItem, width: badgeWItem, height: badgeHItem, color: iv.bg })
      r.page.drawText(badgeTxtItem, {
        x: badgeXItem + 7, y: badgeYItem + 4, size: 8, font: r.fontBold, color: iv.fg,
      })

      // Separator
      r.drawHLine(MARGIN, A4_W - MARGIN, top - blockH, 0.3, COLOR.borderXlight)
      r.y = top - blockH - 2
    }
  }

  if (catOrder.length === 0) {
    r.empty('No items in this review.')
  }

  // ─── Notes ────────────────────────────────────────────────────────────────
  if (review.notes && review.notes.trim()) {
    r.accentSection('Notes')
    const notesLines = wrapText(review.notes, r.fontRegular, 8.5, CONTENT_W - 20)
    const notesHeight = notesLines.length * 12 + 12
    r.ensureSpace(notesHeight + 4)
    const top = r.y
    r.drawRect({
      x: MARGIN, y: top - notesHeight, width: CONTENT_W, height: notesHeight,
      color: COLOR.cardBg, borderColor: COLOR.border, borderWidth: 0.5,
    })
    let ly = top - 12
    for (const ln of notesLines) {
      r.page.drawText(sanitize(ln), { x: MARGIN + 10, y: ly, size: 8.5, font: r.fontRegular, color: COLOR.textLight })
      ly -= 12
    }
    r.y = top - notesHeight - 4
  }

  // ─── Signatures ───────────────────────────────────────────────────────────
  r.moveY(12)
  r.ensureSpace(80)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1, COLOR.border)
  r.moveY(10)
  r.drawText('SIGNATURES', { x: MARGIN, y: r.y - 9, size: 9, bold: true, color: COLOR.muted })
  r.moveY(16)

  if (review.signatures.length === 0) {
    r.empty('No signatures yet.')
  } else {
    // Grid: 2 columns of signature cards with embedded PNG
    const cols = 2
    const gap = 14
    const boxW = (CONTENT_W - gap * (cols - 1)) / cols
    const boxH = 100

    for (let i = 0; i < review.signatures.length; i++) {
      const sig = review.signatures[i]
      const col = i % cols
      if (col === 0) {
        r.ensureSpace(boxH + 6)
      }
      const x = MARGIN + col * (boxW + gap)
      const top = r.y

      // Card background
      r.drawRect({ x, y: top - boxH, width: boxW, height: boxH,
        color: COLOR.cardBg, borderColor: COLOR.border, borderWidth: 0.5 })
      // Top accent
      r.drawRect({ x, y: top - 2, width: boxW, height: 2, color: COLOR.purple })

      // Embed PNG (signature_data is `data:image/png;base64,...`)
      let imageEmbedded = false
      try {
        const dataUrl = sig.signature_data || ''
        const comma = dataUrl.indexOf(',')
        if (comma > 0 && dataUrl.startsWith('data:image/png')) {
          const b64 = dataUrl.slice(comma + 1)
          // atob is available in Workers runtime
          const bin = atob(b64)
          const bytes = new Uint8Array(bin.length)
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j)
          const png = await r.doc.embedPng(bytes)
          // Fit inside the upper portion (preserve aspect ratio)
          const maxW = boxW - 16
          const maxH = 50
          const ratio = Math.min(maxW / png.width, maxH / png.height)
          const w = png.width * ratio
          const h = png.height * ratio
          const imgX = x + (boxW - w) / 2
          const imgY = top - 10 - h
          r.page.drawImage(png, { x: imgX, y: imgY, width: w, height: h })
          imageEmbedded = true
        }
      } catch {
        // Fall through to text-only placeholder
      }

      if (!imageEmbedded) {
        r.page.drawText('[signature]', {
          x: x + 8, y: top - 30, size: 8, font: r.fontOblique, color: COLOR.empty,
        })
      }

      // Name + meta at bottom
      const name = truncateToWidth(sig.profiles?.full_name ?? '—', r.fontBold, 9, boxW - 16)
      r.page.drawText(name, { x: x + 8, y: top - boxH + 26, size: 9, font: r.fontBold, color: COLOR.text })
      if (sig.discipline) {
        const disc = truncateToWidth(sig.discipline, r.fontRegular, 8, boxW - 16)
        r.page.drawText(disc, { x: x + 8, y: top - boxH + 15, size: 8, font: r.fontRegular, color: COLOR.muted })
      }
      const dateStr = sig.signed_at ? new Date(sig.signed_at).toISOString().slice(0, 16).replace('T', ' ') : ''
      r.page.drawText(sanitize(dateStr), {
        x: x + 8, y: top - boxH + 5, size: 7, font: r.fontRegular, color: COLOR.empty,
      })

      // Advance y after the second column completes (or at the last sig)
      if (col === cols - 1 || i === review.signatures.length - 1) {
        r.y = top - boxH - 8
      }
    }
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
