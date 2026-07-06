/**
 * Completion Dossier PDF — pdf-lib (Workers-native).
 *
 * The handover package for a subsystem certificate (MC/RFPC/RFC/RFSU): a single
 * cohesive document with a cover, certificate summary + signatures, the ITR
 * register for the subsystem/phase, and the punch exceptions carried on the
 * certificate. Mirrors the layout patterns of certificate.ts / system-completion.ts.
 */

import {
  Renderer, COLOR, A4_W, A4_H, MARGIN, CONTENT_W, FOOTER_H,
  sanitize,
  type Color, type TableCol,
} from './renderer'

export type DossierItr = {
  number: string
  templateCode: string | null
  tag: string | null
  status: string
  progressPct: number
}

export type DossierException = {
  punchNumber: string
  category: 'A' | 'B' | 'C'
  status: string
  justification: string
  approvedBy: string | null
}

export type DossierSignature = {
  role: string
  name: string | null
  signedAt: string | null
}

export type CompletionDossierData = {
  projectName: string
  projectCode: string
  projectClient: string | null
  projectLocation: string | null
  certificateNumber: string
  certificateTitle: string
  certificateTypeName: string | null
  certificateStatus: 'pending' | 'in_review' | 'issued' | 'rejected'
  issuedDate: string | null
  issuedBy: string | null
  phaseCode: string | null
  phaseName: string | null
  systemLabel: string | null
  subsystemLabel: string | null
  itrs: DossierItr[]
  exceptions: DossierException[]
  signatures: DossierSignature[]
  openPunchA: number
  openPunchB: number
  openPunchC: number
}

const CERT_STATUS: Record<CompletionDossierData['certificateStatus'], { label: string; color: Color; bg: Color }> = {
  issued:    { label: 'ISSUED', color: COLOR.green, bg: COLOR.greenBg },
  in_review: { label: 'IN REVIEW', color: COLOR.blue, bg: COLOR.blueBg },
  pending:   { label: 'PENDING', color: COLOR.muted, bg: COLOR.borderXlight },
  rejected:  { label: 'REJECTED', color: COLOR.red, bg: COLOR.redBg },
}

const ITR_STATUS_COLOR: Record<string, Color> = {
  not_started: COLOR.muted, in_progress: COLOR.blue, completed: COLOR.amber,
  approved: COLOR.greenStrong, rejected: COLOR.red,
}

const ITR_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', completed: 'Completed',
  approved: 'Approved', rejected: 'Rejected',
}

const ITR_COLS: TableCol[] = [
  { w: 72, label: 'ITR' },
  { w: 60, label: 'Template' },
  { w: 90, label: 'Tag' },
  { w: 90, label: 'Status', align: 'center' },
  { w: 46, label: '%', align: 'right' },
]

const EXC_COLS: TableCol[] = [
  { w: 70, label: 'Punch' },
  { w: 34, label: 'Cat', align: 'center' },
  { w: 60, label: 'Status', align: 'center' },
  { w: 195, label: 'Justification' },
]

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export async function renderCompletionDossierPdf(data: CompletionDossierData): Promise<Uint8Array> {
  const r = await Renderer.create()
  r.doc.setTitle(`Completion Dossier · ${data.certificateNumber}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Completion Dossier')

  const generatedAt = new Date().toISOString().slice(0, 10)
  const approvedItr = data.itrs.filter(i => i.status === 'approved').length

  r.setFooter(({ page, pageNum }) => {
    const footerY = MARGIN
    page.drawLine({
      start: { x: MARGIN, y: footerY + FOOTER_H - 4 },
      end:   { x: A4_W - MARGIN, y: footerY + FOOTER_H - 4 },
      thickness: 0.5, color: COLOR.borderLight,
    })
    page.drawText(sanitize(`CommUp · ${data.certificateNumber}`), {
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

  // ─── Cover ────────────────────────────────────────────────────────────────
  r.newPage()
  r.topBar(COLOR.purple, 6)
  r.y = A4_H - 150
  r.drawTextCentered('CommUp', { y: r.y, size: 22, bold: true, color: COLOR.purple })
  r.moveY(40)
  r.drawTextCentered('COMPLETION DOSSIER', { y: r.y, size: 20, bold: true, color: COLOR.text })
  r.moveY(26)
  if (data.certificateTypeName) {
    r.drawTextCentered(data.certificateTypeName, { y: r.y, size: 13, color: COLOR.muted, maxWidth: CONTENT_W })
    r.moveY(22)
  }
  r.moveY(8)
  r.drawTextCentered(data.certificateNumber, { y: r.y, size: 14, bold: true, color: COLOR.purple })
  r.moveY(30)
  r.drawHLine(MARGIN + 80, A4_W - MARGIN - 80, r.y, 0.8, COLOR.border)
  r.moveY(24)
  r.drawTextCentered(`${data.projectCode} — ${data.projectName}`, { y: r.y, size: 13, bold: true, color: COLOR.text, maxWidth: CONTENT_W })
  r.moveY(18)
  if (data.subsystemLabel) {
    r.drawTextCentered(data.subsystemLabel, { y: r.y, size: 11, color: COLOR.textLight, maxWidth: CONTENT_W })
    r.moveY(16)
  }
  if (data.projectClient) {
    r.drawTextCentered(`Client: ${data.projectClient}`, { y: r.y, size: 10, oblique: true, color: COLOR.muted, maxWidth: CONTENT_W })
    r.moveY(14)
  }
  // Status badge centered
  r.moveY(14)
  const st = CERT_STATUS[data.certificateStatus]
  const badgeTxt = st.label
  const badgeW = r.fontBold.widthOfTextAtSize(badgeTxt, 11) + 24
  r.drawRect({ x: (A4_W - badgeW) / 2, y: r.y - 8, width: badgeW, height: 22, color: st.bg })
  r.drawTextCentered(badgeTxt, { y: r.y, size: 11, bold: true, color: st.color })

  // ─── Certificate summary ──────────────────────────────────────────────────
  r.newPage()
  r.y = A4_H - MARGIN - 4
  r.accentSection('Certificate')
  r.kv('Number', data.certificateNumber)
  r.kv('Title', data.certificateTitle)
  if (data.certificateTypeName) r.kv('Type', data.certificateTypeName)
  r.kv('Phase', [data.phaseCode, data.phaseName].filter(Boolean).join(' — ') || '—')
  if (data.systemLabel) r.kv('System', data.systemLabel)
  if (data.subsystemLabel) r.kv('Subsystem', data.subsystemLabel)
  r.kv('Status', CERT_STATUS[data.certificateStatus].label)
  r.kv('Issued date', data.issuedDate ?? '—')
  r.kv('Issued by', data.issuedBy ?? '—')
  if (data.projectLocation) r.kv('Location', data.projectLocation)

  // ─── Readiness snapshot ───────────────────────────────────────────────────
  r.moveY(4)
  r.infoCardRow([
    { label: 'ITRs Approved', value: `${approvedItr} / ${data.itrs.length}`, sub: `${pct(approvedItr, data.itrs.length)}%` },
    { label: 'Open Cat A', value: String(data.openPunchA), sub: data.openPunchA > 0 ? 'Blocking' : 'None' },
    { label: 'Open Cat B', value: String(data.openPunchB) },
    { label: 'Exceptions', value: String(data.exceptions.length) },
  ])

  // ─── ITR register ─────────────────────────────────────────────────────────
  r.accentSection('ITR Register')
  if (data.itrs.length === 0) {
    r.empty('No ITRs linked to this subsystem/phase.')
  } else {
    r.tableHeader(ITR_COLS)
    data.itrs.forEach((itr, i) => {
      r.tableRow(
        ITR_COLS,
        [
          itr.number,
          itr.templateCode ?? '—',
          itr.tag ?? '—',
          ITR_STATUS_LABEL[itr.status] ?? itr.status,
          `${itr.progressPct}%`,
        ],
        {
          alternate: i % 2 === 1,
          valueColors: [COLOR.text, COLOR.muted, COLOR.text, ITR_STATUS_COLOR[itr.status] ?? COLOR.muted, COLOR.text],
          valueBold: [true, false, false, false, false],
        },
      )
    })
  }

  // ─── Punch exceptions ─────────────────────────────────────────────────────
  r.accentSection('Punch Exceptions', COLOR.amber, COLOR.amberBg)
  if (data.exceptions.length === 0) {
    r.empty('No punch exceptions on this certificate.')
  } else {
    r.tableHeader(EXC_COLS)
    data.exceptions.forEach((e, i) => {
      r.tableRow(
        EXC_COLS,
        [e.punchNumber, e.category, e.status, e.justification],
        {
          alternate: i % 2 === 1,
          valueColors: [COLOR.text, e.category === 'A' ? COLOR.red : COLOR.muted, COLOR.muted, COLOR.textLight],
          valueBold: [true, true, false, false],
        },
      )
    })
  }

  // ─── Signatures ───────────────────────────────────────────────────────────
  r.moveY(10)
  r.accentSection('Signatures')
  const boxes = data.signatures.length > 0
    ? data.signatures.map(s => ({ role: s.role, name: s.name ?? undefined, date: s.signedAt ?? undefined }))
    : [{ role: 'Completion' }, { role: 'Client' }, { role: 'Authority' }]
  r.signatureGrid(boxes)

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
