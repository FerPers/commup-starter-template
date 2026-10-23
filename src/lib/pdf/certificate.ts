/**
 * Completion Certificate PDF — pdf-lib (Workers-native).
 * Replaces the @react-pdf/renderer implementation in CertPdfDocument.tsx.
 */

import {
  Renderer, COLOR, A4_W, A4_H, MARGIN, CONTENT_W, FOOTER_H,
  sanitize, truncateToWidth, wrapText, bi,
  type TableCol, type Color,
} from './renderer'
import { todayIn } from '@/lib/time/zone'
import { drawBrandBar, drawRecordQr, type PdfBranding } from './branding'

type ExceptionRow = {
  id: string
  justification: string
  approved_at: string
  punches: { punch_number: string; description: string; category: string } | null
  approved_by_profile: { full_name: string } | null
}

type ItrRow = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  itr_templates: { code: string; title: string } | null
  tags: { tag_number: string; description: string } | null
}

type SignatureRow = {
  id: string
  role: 'completion' | 'client' | 'authority'
  signed_at: string
  comments: string | null
  signer_profile: { full_name: string } | null
}

export type CertPdfData = {
  id: string
  certificate_number: string
  title: string
  status: string
  issued_date: string | null
  notes: string | null
  created_at: string
  project_phases: {
    code: string
    name: string
    color: string
    certificate_name: string | null
  } | null
  subsystems: {
    code: string
    name: string
    systems: { code: string; name: string } | null
  } | null
  issued_by_profile: { full_name: string } | null
  projectName: string
  projectCode: string
  projectClient: string | null
  exceptions: ExceptionRow[]
  itrs: ItrRow[]
  signatures: SignatureRow[]
  /** E2: logos de la org y del cliente (sin ellos, «CommUp» como antes). */
  branding?: PdfBranding | null
  /** E2: QR al certificado en la app. */
  recordUrl?: string | null
  /** Zona del proyecto: fecha «Generado» (el Worker corre en UTC). */
  timezone?: string | null
}

function statusVisual(status: string): { fg: Color; bg: Color; label: string } {
  const s = status.toLowerCase()
  if (s === 'issued')    return { fg: COLOR.greenStrong, bg: COLOR.greenBg, label: 'EMITIDO / ISSUED' }
  if (s === 'in_review') return { fg: COLOR.amber, bg: COLOR.amberBg, label: 'EN REVISIÓN / IN REVIEW' }
  if (s === 'pending')   return { fg: COLOR.muted, bg: COLOR.borderLight, label: 'PENDIENTE / PENDING' }
  if (s === 'rejected')  return { fg: COLOR.red, bg: COLOR.redBg, label: 'RECHAZADO / REJECTED' }
  if (s === 'revoked')   return { fg: COLOR.purple, bg: COLOR.purpleBg, label: 'REVOCADO / REVOKED' }
  return { fg: COLOR.muted, bg: COLOR.borderLight, label: status.toUpperCase() }
}

export async function renderCertificatePdf(cert: CertPdfData): Promise<Uint8Array> {
  const r = await Renderer.create()
  // V3: PDF formal bilingüe (español / inglés), como el del ITR.
  r.doc.setTitle(`Certificado / Certificate ${cert.certificate_number}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Certificado de completamiento / Completion Certificate')

  const generatedAt = todayIn(cert.timezone)
  const approvedItrs = cert.itrs.filter(i => i.status === 'approved')
  const visual = statusVisual(cert.status)

  r.setFooter(({ page, pageNum }) => {
    const footerY = MARGIN
    page.drawLine({
      start: { x: MARGIN, y: footerY + FOOTER_H - 4 },
      end:   { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 },
      thickness: 0.5, color: COLOR.borderLight,
    })
    page.drawText(sanitize(`CommUp · ${cert.certificate_number}`), {
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

  // ─── Header (centered) ────────────────────────────────────────────────────
  r.y = A4_H - MARGIN - 8
  await drawBrandBar(r, cert.branding)

  // E2: QR al registro a la derecha del encabezado; los títulos centrados dejan su espacio.
  const QR = 58
  const headTop = r.y
  if (cert.recordUrl) drawRecordQr(r, cert.recordUrl, A4_W - MARGIN - QR, headTop, QR)
  const headW = cert.recordUrl ? CONTENT_W - 2 * (QR + 12) : CONTENT_W

  const certHeading = cert.project_phases?.certificate_name ?? 'Certificado de completamiento / Completion Certificate'
  r.drawTextCentered(certHeading, { y: r.y - 13, size: 13, bold: true, color: COLOR.text, maxWidth: headW })
  r.moveY(15)
  r.drawTextCentered(cert.certificate_number, { y: r.y - 11, size: 11, oblique: true, color: COLOR.muted })
  r.moveY(13)
  r.drawTextCentered(cert.title, { y: r.y - 11, size: 11, bold: true, color: COLOR.text, maxWidth: headW })
  r.moveY(16)

  // Status badge centered
  const badgeLabel = visual.label + (cert.issued_date ? ` · ${cert.issued_date}` : '')
  const badgeTxt = sanitize(badgeLabel)
  const badgeW = r.fontBold.widthOfTextAtSize(badgeTxt, 9) + 24
  const badgeH = 18
  const badgeX = (A4_W - badgeW) / 2
  r.drawRect({ x: badgeX, y: r.y - badgeH, width: badgeW, height: badgeH, color: visual.bg })
  r.page.drawText(badgeTxt, {
    x: badgeX + 12, y: r.y - badgeH + 5, size: 9, font: r.fontBold, color: visual.fg,
  })
  r.moveY(badgeH + 6)
  if (cert.recordUrl) r.y = Math.min(r.y, headTop - QR - 20)

  // Separator line under header
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1.2, COLOR.text)
  r.moveY(10)

  // ─── Info card grid ───────────────────────────────────────────────────────
  const infoCards: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: bi('Proyecto', 'Project'),
      value: `${cert.projectCode} — ${cert.projectName}`,
      sub: cert.projectClient ? `${bi('Cliente', 'Client')}: ${cert.projectClient}` : undefined,
    },
    {
      label: bi('Fase', 'Phase'),
      value: `${cert.project_phases?.code ?? '-'} — ${cert.project_phases?.name ?? '-'}`,
    },
  ]
  if (cert.subsystems) {
    infoCards.push({
      label: bi('Subsistema', 'Subsystem'),
      value: `${cert.subsystems.code} — ${cert.subsystems.name}`,
      sub: cert.subsystems.systems ? `${bi('Sistema', 'System')}: ${cert.subsystems.systems.code}` : undefined,
    })
  }
  infoCards.push({
    label: bi('Aprobados', 'Approved'),
    value: `${approvedItrs.length} ITR`,
    sub: cert.exceptions.length > 0 ? `${cert.exceptions.length} exc. Cat B` : undefined,
  })
  r.infoCardRow(infoCards)

  // ─── ITR Table ────────────────────────────────────────────────────────────
  r.accentSection(`${bi('ITR aprobados', 'Approved Inspection & Test Records')} (${approvedItrs.length})`)
  const itrCols: TableCol[] = [
    { w: 75, label: 'N.º ITR', labelEn: 'ITR number', bold: true },
    { w: 60, label: 'Plantilla', labelEn: 'Template' },
    { w: 190, label: 'Descripción', labelEn: 'Description' },
    { w: 80, label: 'Tag', labelEn: 'Tag' },
    { w: 118, label: 'Estado', labelEn: 'Status', align: 'center' },
  ]
  if (approvedItrs.length === 0) {
    r.empty(bi('El certificado no tiene ITR aprobados.', 'No approved ITRs associated with this certificate.'))
  } else {
    r.tableHeader(itrCols)
    approvedItrs.forEach((itr, idx) => {
      r.tableRow(itrCols, [
        itr.itr_number,
        itr.itr_templates?.code ?? '-',
        itr.itr_templates?.title ?? '-',
        itr.tags?.tag_number ?? '-',
        'APROBADO / APPROVED',
      ], {
        alternate: idx % 2 === 1,
        valueColors: [COLOR.text, COLOR.muted, COLOR.text, COLOR.textLight, COLOR.greenStrong],
        valueBold:   [true,        false,       false,      false,           true],
      })
    })
  }

  // ─── Cat B exceptions ─────────────────────────────────────────────────────
  if (cert.exceptions.length > 0) {
    r.accentSection(`${bi('Excepciones de punch Cat B', 'Category B Punch Exceptions')} (${cert.exceptions.length})`, COLOR.amber, COLOR.amberBg)
    for (const exc of cert.exceptions) {
      const punchTxt = `Punch ${exc.punches?.punch_number ?? '-'} · Cat B`
      const descTxt  = exc.punches?.description ?? '-'
      const justTxt  = `${bi('Justificación', 'Justification')}: ${exc.justification}`
      const metaTxt  = `${bi('Aprobó', 'Approved by')} ${exc.approved_by_profile?.full_name ?? '-'} · ${exc.approved_at.slice(0, 10)}`
      // Pre-compute block height
      const wrapW = CONTENT_W - 20
      const lines = [
        ...new Array(1).fill(0).map(() => truncateToWidth(punchTxt, r.fontBold, 9, wrapW)),
      ]
      const descLines = wrapText(descTxt, r.fontRegular, 8.5, wrapW)
      const justLines = wrapText(justTxt, r.fontOblique, 7.5, wrapW)
      const lineHeights = 12 + descLines.length * 10 + justLines.length * 10 + 12 + 8
      r.ensureSpace(lineHeights + 4)
      const top = r.y
      r.drawRect({
        x: MARGIN, y: top - lineHeights, width: CONTENT_W, height: lineHeights,
        color: COLOR.amberBg, borderColor: COLOR.amberBorder, borderWidth: 0.75,
      })
      let lineY = top - 12
      r.page.drawText(sanitize(lines[0]), { x: MARGIN + 10, y: lineY, size: 9, font: r.fontBold, color: COLOR.amber })
      lineY -= 12
      for (const ln of descLines) {
        r.page.drawText(sanitize(ln), { x: MARGIN + 10, y: lineY, size: 8.5, font: r.fontRegular, color: COLOR.text })
        lineY -= 10
      }
      for (const ln of justLines) {
        r.page.drawText(sanitize(ln), { x: MARGIN + 10, y: lineY, size: 7.5, font: r.fontOblique, color: COLOR.muted })
        lineY -= 10
      }
      r.page.drawText(sanitize(metaTxt), { x: MARGIN + 10, y: lineY, size: 7, font: r.fontRegular, color: COLOR.empty })
      r.y = top - lineHeights - 4
    }
  }

  // ─── Notes ─────────────────────────────────────────────────────────────────
  if (cert.notes) {
    r.accentSection(bi('Notas', 'Notes'))
    const notesLines = wrapText(cert.notes, r.fontRegular, 8.5, CONTENT_W - 20)
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

  // ─── Signatures ────────────────────────────────────────────────────────────
  r.moveY(12)
  r.ensureSpace(80)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1, COLOR.border)
  r.moveY(10)
  r.drawText('FIRMAS AUTORIZADAS / AUTHORIZED SIGNATURES', { x: MARGIN, y: r.y - 9, size: 9, bold: true, color: COLOR.muted })
  r.moveY(16)

  const sigBoxes: Array<{ role: string; roleEn: string; name?: string; date?: string }> = [
    {
      role: 'Emitido por',
      roleEn: 'Issued by',
      name: cert.issued_by_profile?.full_name,
      date: cert.issued_date ?? undefined,
    },
  ]
  for (const role of ['completion', 'client', 'authority'] as const) {
    const sig = cert.signatures.find(s => s.role === role)
    const [roleEs, roleEn] =
      role === 'completion' ? ['Gerente de completamiento', 'Completion Manager'] :
      role === 'client'     ? ['Representante del cliente', 'Client Representative'] :
                              ['Autoridad', 'Authority']
    sigBoxes.push({
      role: roleEs,
      roleEn,
      name: sig?.signer_profile?.full_name,
      date: sig ? new Date(sig.signed_at).toISOString().split('T')[0] : undefined,
    })
  }
  r.signatureGrid(sigBoxes, { accentColor: COLOR.purple, placeholder: 'Nombre / fecha · Name / date' })

  r.finalizePagePlaceholders()
  return await r.doc.save()
}

