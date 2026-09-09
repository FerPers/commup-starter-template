import { evaluateContinuity } from '../itr/continuity'
import { drawItrSignatures } from './itr-signatures'
/**
 * ITR (Inspection & Test Record) PDF — pdf-lib (Workers-native).
 * Replaces the @react-pdf/renderer implementation in ItrPdfDocument.tsx.
 */

import {
  Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H, BOTTOM_LIMIT,
  sanitize, wrapText,
  type Color,
} from './renderer'

type ItrItem = {
  id: string
  item_number: string | null
  description: string
  description_es?: string | null
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

type ItrAttachmentRef = {
  item_id: string | null
  file_url: string
  file_type: string
  captured_at: string | null
}

type ItrSignature = {
  signature_image?: string | null
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
    title_es?: string | null
    description: string | null
    itr_template_sections: ItrSection[]
  } | null
  tags: {
    tag_number: string; description: string
    manufacturer?: string | null; model?: string | null; serial_number?: string | null
    datasheet_number?: string | null; pid_drawing?: string | null
    range_min?: number | null; range_max?: number | null; eng_unit?: string | null; revision?: string | null
  } | null
  projects: { code: string; name: string } | null
  itr_responses: ItrResponse[]
  itr_signatures: ItrSignature[]
  itr_attachments?: ItrAttachmentRef[]
}

/** «Evidencia: 2 foto(s) · documento: cert.pdf» — nombres de archivo, nunca URLs firmadas. */
function evidenceSummary(attachments: ItrAttachmentRef[]): string | null {
  const photos = attachments.filter(a => a.file_type.startsWith('image/')).length
  const documents = attachments.filter(a => a.file_type === 'application/pdf').map(a => a.file_url.split('/').pop() ?? 'documento')
  if (photos === 0 && documents.length === 0) return null
  const parts: string[] = []
  if (photos > 0) parts.push(`${photos} foto(s) / photo(s)`)
  if (documents.length > 0) parts.push(`documento(s): ${documents.join(', ')}`)
  return `Evidencia / Evidence: ${parts.join(' · ')}`
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
  if (item.item_type === 'text') return response.value_text ?? '-'
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
  // Bilingüe: español primero cuando existe traducción; el inglés queda como
  // referencia (título completo y, por ítem, en gris debajo de la instrucción).
  const tplTitleEs = itr.itr_templates?.title_es?.trim()
  const metas: Array<[string, string | null | undefined]> = [
    ['Proyecto / Project',  itr.projects ? `${itr.projects.code} — ${itr.projects.name}` : null],
    ['Tag',                 itr.tags ? `${itr.tags.tag_number} — ${itr.tags.description}` : null],
    ['Fabricante / Manufacturer', itr.tags?.manufacturer],
    ['Modelo / Model',      itr.tags?.model],
    ['Serie / Serial',      itr.tags?.serial_number],
    ['Rango / Range',       itr.tags && itr.tags.range_min !== null && itr.tags.range_min !== undefined && itr.tags.range_max !== null && itr.tags.range_max !== undefined
      ? `${itr.tags.range_min} - ${itr.tags.range_max}${itr.tags.eng_unit ? ` ${itr.tags.eng_unit}` : ''}` : null],
    ['Hoja de datos / Datasheet', itr.tags?.datasheet_number ? `${itr.tags.datasheet_number}${itr.tags.revision ? ` rev. ${itr.tags.revision}` : ''}` : null],
    ['P&ID',                itr.tags?.pid_drawing],
    ['Fecha / Date',        itr.scheduled_date],
    ['Plantilla / Template', itr.itr_templates ? `${itr.itr_templates.code} — ${tplTitleEs ?? itr.itr_templates.title}` : null],
    ...(tplTitleEs && tplTitleEs !== itr.itr_templates?.title ? [['Title (EN)', itr.itr_templates?.title] as [string, string | undefined]] : []),
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
  const attachmentsByItem = new Map<string | null, ItrAttachmentRef[]>()
  for (const att of itr.itr_attachments ?? []) {
    attachmentsByItem.set(att.item_id, [...(attachmentsByItem.get(att.item_id) ?? []), att])
  }

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
      if (item.item_type === 'continuity') {
        r.paragraph(`${item.item_number ?? ''} ${item.description_es?.trim() ? item.description_es.trim() : item.description}`, {size: 9})
        if (item.description_es?.trim() && item.description_es.trim() !== item.description.trim()) r.paragraph(item.description, {size: 8, oblique: true})
        if (item.acceptance_text) r.paragraph(`Criterio: ${item.acceptance_text}`, {size: 8})
        const evaluation = evaluateContinuity(resp?.value_text)
        if (!evaluation.data) {
          r.paragraph(resp?.value_text ? 'Registro de continuidad inválido; revisar captura.' : 'Continuidad pendiente de captura.', {color: COLOR.red})
        } else {
          const capture = evaluation.data
          r.paragraph(`${capture.grouping === 'pairs' ? 'Pares' : 'Conductores'}: ${capture.count}. Pantallas: ${capture.shields.join(', ') || 'Ninguna'}. Lectura ${capture.measurementRequired ? 'obligatoria' : 'opcional'}.`, {size: 8})
          if (!evaluation.isComplete) r.paragraph('Captura incompleta: revisar terminales, resultados y requisitos aplicables.', {size: 8, color: COLOR.red})
          const widths = [48, 78, 78, 61, 47, 40, CONTENT_W - 352]
          const labels = ['Conductor', 'Origen', 'Destino', 'Resultado', 'Lectura', 'Unidad', 'Observaciones']
          const drawContinuityHeader = () => {
            r.ensureSpace(34)
            r.drawRect({x: MARGIN, y: r.y - 16, width: CONTENT_W, height: 16, color: COLOR.borderXlight})
            let x = MARGIN
            labels.forEach((label, i) => {
              r.drawText(label, {x: x + 3, y: r.y - 11, size: 7, bold: true, color: COLOR.muted})
              x += widths[i]
            })
            r.moveY(18)
          }
          drawContinuityHeader()
          for (const row of capture.rows) {
            const result = row.result === 'pass' ? 'PASS' : row.result === 'fail' ? 'FAIL' : row.result === 'not_applicable' ? 'No aplica' : 'Pendiente'
            const cells = [row.id, row.from || '-', row.to || '-', result, row.reading === null ? '-' : String(row.reading), row.unit || '-', row.remarks || '-']
            const lines = cells.map((value, i) => wrapText(value, r.fontRegular, 7.5, widths[i] - 6))
            const total = Math.max(...lines.map(cell => cell.length), 1)
            let offset = 0
            while (offset < total) {
              if (r.y - 18 < BOTTOM_LIMIT) {
                r.newPage()
                r.paragraph(`Continuidad ${item.item_number ?? ''} - ${row.id}${offset ? ' (continuación)' : ''}`, {size: 8})
                drawContinuityHeader()
              }
              const count = Math.min(total - offset, Math.max(1, Math.floor((r.y - BOTTOM_LIMIT - 6) / 10)))
              const height = count * 10 + 6
              if (row.result === 'fail') r.drawRect({x: MARGIN, y: r.y - height, width: CONTENT_W, height, color: COLOR.redBg})
              let x = MARGIN
              lines.forEach((cell, column) => {
                for (let line = 0; line < count; line++) {
                  const text = cell[offset + line]
                  if (text !== undefined) r.drawText(text, {x: x + 3, y: r.y - 9 - line * 10, size: 7.5, color: row.result === 'fail' && column === 3 ? COLOR.red : COLOR.text})
                }
                x += widths[column]
              })
              r.drawHLine(MARGIN, MARGIN + CONTENT_W, r.y - height, 0.3, COLOR.borderLight)
              r.moveY(height)
              offset += count
            }
          }
        }
        if (resp?.remarks) r.paragraph(`Observaciones generales: ${resp.remarks}`, {size: 8, oblique: true})
        r.moveY(6)
        drawColumnHeaders()
        continue
      }
      const isPassed = resp?.is_passed
      const responseText = formatResponse(item, resp)

      // Pre-compute height
      const descMaxW = COLS.desc.w - 16 - (item.is_critical ? 10 : 0)
      const es = item.description_es?.trim() ? item.description_es.trim() : undefined
      const primaryText = es ?? item.description
      const secondaryText = es && es !== item.description.trim() ? item.description : null
      const descLines = wrapText(primaryText, r.fontRegular, 8.5, descMaxW)
      const enLines = secondaryText ? wrapText(secondaryText, r.fontOblique, 7, descMaxW) : []
      const acceptanceText = item.acceptance_text
        ? `Criterio / Criterion: ${item.acceptance_text}`
        : (item.acceptance_min !== null || item.acceptance_max !== null)
          ? `Rango / Range: ${item.acceptance_min ?? '-'} - ${item.acceptance_max ?? '-'}${item.unit ? ` ${item.unit}` : ''}`
          : null
      const acceptanceLines = acceptanceText ? wrapText(acceptanceText, r.fontRegular, 7, descMaxW) : []
      const remarksText = resp?.remarks ? `Observaciones / Remarks: ${resp.remarks}` : null
      const remarksLines = remarksText ? wrapText(remarksText, r.fontOblique, 7.5, descMaxW) : []
      const evidenceText = evidenceSummary(attachmentsByItem.get(item.id) ?? [])
      const evidenceLines = evidenceText ? wrapText(evidenceText, r.fontRegular, 7, descMaxW) : []
      const descriptionRows = [
        ...descLines.map(text => ({ text, size: 8.5, oblique: false, color: COLOR.text })),
        ...enLines.map(text => ({ text, size: 7, oblique: true, color: COLOR.empty })),
        ...acceptanceLines.map(text => ({ text, size: 7, oblique: false, color: COLOR.empty })),
        ...remarksLines.map(text => ({ text, size: 7.5, oblique: true, color: COLOR.muted })),
        ...evidenceLines.map(text => ({ text, size: 7, oblique: false, color: COLOR.muted })),
      ]
      const respBold = isPassed === true || isPassed === false
      const responseLines = wrapText(responseText, respBold ? r.fontBold : r.fontRegular, 8.5, COLS.resp.w - 8)
      const totalLines = Math.max(descriptionRows.length, responseLines.length, 1)
      const respColor = isPassed === true ? COLOR.greenStrong : isPassed === false ? COLOR.red : COLOR.muted
      // Split a single long item across pages; never truncate its captured value.
      let offset = 0
      while (offset < totalLines) {
        if (r.y - 19 < BOTTOM_LIMIT) { r.newPage(); drawColumnHeaders() }
        const available = Math.max(1, Math.floor((r.y - BOTTOM_LIMIT - 8) / 11))
        const count = Math.min(available, totalLines - offset)
        const height = count * 11 + 8
        if (isPassed === false) r.drawRect({ x: MARGIN, y: r.y - height, width: CONTENT_W, height, color: COLOR.redBg })
        r.drawText(item.item_number ?? '', { x: COLS.num.x + 4, y: r.y - 10, size: 8, oblique: true, color: COLOR.empty })
        if (item.is_critical) r.page.drawCircle({ x: COLS.desc.x + 7, y: r.y - 8, size: 2.5, color: COLOR.red })
        for (let index = 0; index < count; index++) {
          const y = r.y - 10 - index * 11
          const description = descriptionRows[offset + index]
          if (description) r.drawText(description.text, { x: COLS.desc.x + 4 + (item.is_critical ? 8 : 0), y, size: description.size, oblique: description.oblique, color: description.color })
          const responseLine = responseLines[offset + index]
          if (responseLine !== undefined) r.drawText(responseLine, { x: COLS.resp.x + 4, y, size: 8.5, bold: respBold, color: respColor })
        }
        if (offset === 0 && respBold) r.drawText(isPassed ? 'PASS' : 'FAIL', { x: COLS.result.x + 4, y: r.y - 10, size: 8.5, bold: true, color: respColor })
        r.drawHLine(MARGIN, A4_W - MARGIN, r.y - height, 0.3, COLOR.borderLight)
        r.moveY(height)
        offset += count
      }
    }
  }

  const generalEvidence = evidenceSummary(attachmentsByItem.get(null) ?? [])
  if (generalEvidence) {
    r.moveY(8)
    r.paragraph(`${generalEvidence} (generales / general)`, { size: 8, color: COLOR.muted })
  }

  r.moveY(12)
  await drawItrSignatures(r, itr.itr_signatures)

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
