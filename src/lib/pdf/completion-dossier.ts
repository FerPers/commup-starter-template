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
  sanitize, bi,
  type Color, type TableCol,
} from './renderer'
import { todayIn } from '@/lib/time/zone'
import { drawBrandBar, type PdfBranding } from './branding'

export type DossierItr = {
  number: string
  templateCode: string | null
  /** R2b: código del cliente de la plantilla (columna solo si alguno lo tiene). */
  clientCode?: string | null
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
  /** E2: logos de la org y del cliente (sin ellos, el nombre o «CommUp»). */
  branding?: PdfBranding | null
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
  /** Zona del proyecto: fecha «Generado» (el Worker corre en UTC). */
  timezone?: string | null
}

const CERT_STATUS: Record<CompletionDossierData['certificateStatus'], { label: string; color: Color; bg: Color }> = {
  issued:    { label: 'EMITIDO / ISSUED', color: COLOR.green, bg: COLOR.greenBg },
  in_review: { label: 'EN REVISIÓN / IN REVIEW', color: COLOR.blue, bg: COLOR.blueBg },
  pending:   { label: 'PENDIENTE / PENDING', color: COLOR.muted, bg: COLOR.borderXlight },
  rejected:  { label: 'RECHAZADO / REJECTED', color: COLOR.red, bg: COLOR.redBg },
}

// A08: diligenciado = espera firmas (violeta), nunca verde; solo aprobado es verde.
const ITR_STATUS_COLOR: Record<string, Color> = {
  not_started: COLOR.muted, in_progress: COLOR.blue, completed: COLOR.purple,
  approved: COLOR.greenStrong, rejected: COLOR.red,
}

const ITR_STATUS_LABEL: Record<string, string> = {
  not_started: 'Sin iniciar / Not started', in_progress: 'En progreso / In progress', completed: 'Por firmar / Awaiting signatures',
  approved: 'Aprobado / Approved', rejected: 'No conforme / Nonconforming',
}

const PUNCH_STATUS_LABEL: Record<string, string> = {
  open: 'Abierto / Open', in_progress: 'En progreso / In progress', resolved: 'Resuelto / Resolved',
  closed: 'Cerrado / Closed', cancelled: 'Anulado / Cancelled',
}

/** Rol de la firma del certificado (`certificate_signatures.role`) → ES / EN, igual que certificate.ts. */
const SIGNATURE_ROLE: Record<string, [string, string]> = {
  completion: ['Gerente de completamiento', 'Completion Manager'],
  client: ['Representante del cliente', 'Client Representative'],
  authority: ['Autoridad', 'Authority'],
}

const ITR_COLS: TableCol[] = [
  { w: 72, label: 'N.º ITR', labelEn: 'ITR number' },
  { w: 60, label: 'Plantilla', labelEn: 'Template' },
  { w: 90, label: 'Tag', labelEn: 'Tag' },
  { w: 116, label: 'Estado', labelEn: 'Status', align: 'center' },
  { w: 46, label: 'Avance', labelEn: 'Progress', align: 'right' },
]
const CLIENT_COL: TableCol = { w: 96, label: 'Código cliente', labelEn: 'Client code' }

const EXC_COLS: TableCol[] = [
  { w: 70, label: 'Punch', labelEn: 'Punch' },
  { w: 34, label: 'Cat', labelEn: 'Cat', align: 'center' },
  { w: 110, label: 'Estado', labelEn: 'Status', align: 'center' },
  { w: 309, label: 'Justificación', labelEn: 'Justification' },
]

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export async function renderCompletionDossierPdf(data: CompletionDossierData): Promise<Uint8Array> {
  const r = await Renderer.create()
  // V3: PDF formal bilingüe (español / inglés), como el del ITR.
  r.doc.setTitle(`Dossier de completamiento / Completion Dossier · ${data.certificateNumber}`)
  r.doc.setAuthor('CommUp')
  r.doc.setSubject('Dossier de completamiento / Completion Dossier')

  const generatedAt = todayIn(data.timezone)
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

  // ─── Cover ────────────────────────────────────────────────────────────────
  r.newPage()
  r.topBar(COLOR.purple, 6)
  // E2: franja de marca arriba de la portada (org y cliente); el título baja como antes.
  r.y = A4_H - MARGIN - 8
  await drawBrandBar(r, data.branding)
  r.y = A4_H - 190
  r.drawTextCentered('DOSSIER DE COMPLETAMIENTO', { y: r.y, size: 20, bold: true, color: COLOR.text })
  r.moveY(20)
  r.drawTextCentered('COMPLETION DOSSIER', { y: r.y, size: 12, color: COLOR.muted })
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
    r.drawTextCentered(`${bi('Cliente', 'Client')}: ${data.projectClient}`, { y: r.y, size: 10, oblique: true, color: COLOR.muted, maxWidth: CONTENT_W })
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
  r.accentSection(bi('Certificado', 'Certificate'))
  const kvOpts = { keyW: 134 }
  r.kv(bi('Número', 'Number'), data.certificateNumber, kvOpts)
  r.kv(bi('Título', 'Title'), data.certificateTitle, kvOpts)
  if (data.certificateTypeName) r.kv(bi('Tipo', 'Type'), data.certificateTypeName, kvOpts)
  r.kv(bi('Fase', 'Phase'), [data.phaseCode, data.phaseName].filter(Boolean).join(' — ') || '—', kvOpts)
  if (data.systemLabel) r.kv(bi('Sistema', 'System'), data.systemLabel, kvOpts)
  if (data.subsystemLabel) r.kv(bi('Subsistema', 'Subsystem'), data.subsystemLabel, kvOpts)
  r.kv(bi('Estado', 'Status'), CERT_STATUS[data.certificateStatus].label, kvOpts)
  r.kv(bi('Fecha de emisión', 'Issued date'), data.issuedDate ?? '—', kvOpts)
  r.kv(bi('Emitido por', 'Issued by'), data.issuedBy ?? '—', kvOpts)
  if (data.projectLocation) r.kv(bi('Ubicación', 'Location'), data.projectLocation, kvOpts)

  // ─── Readiness snapshot ───────────────────────────────────────────────────
  r.moveY(4)
  r.infoCardRow([
    { label: bi('ITR aprobados', 'Approved'), value: `${approvedItr} / ${data.itrs.length}`, sub: `${pct(approvedItr, data.itrs.length)}%` },
    { label: bi('Cat A abiertos', 'Open Cat A'), value: String(data.openPunchA), sub: data.openPunchA > 0 ? bi('Bloquea', 'Blocking') : bi('Ninguno', 'None') },
    { label: bi('Cat B abiertos', 'Open Cat B'), value: String(data.openPunchB) },
    { label: bi('Excepciones', 'Exceptions'), value: String(data.exceptions.length) },
  ])

  // ─── ITR register ─────────────────────────────────────────────────────────
  r.accentSection(bi('Registro de ITR', 'ITR register'))
  if (data.itrs.length === 0) {
    r.empty(bi('No hay ITR ligados a este subsistema / fase.', 'No ITRs linked to this subsystem / phase.'))
  } else {
    const withClient = data.itrs.some(x => x.clientCode)
    const cols = withClient ? [...ITR_COLS.slice(0, 2), CLIENT_COL, ...ITR_COLS.slice(2)] : ITR_COLS
    r.tableHeader(cols)
    data.itrs.forEach((itr, i) => {
      const values = [itr.number, itr.templateCode ?? '—', itr.tag ?? '—', ITR_STATUS_LABEL[itr.status] ?? itr.status, `${itr.progressPct}%`]
      const colors = [COLOR.text, COLOR.muted, COLOR.text, ITR_STATUS_COLOR[itr.status] ?? COLOR.muted, COLOR.text]
      const bold = [true, false, false, false, false]
      if (withClient) { values.splice(2, 0, itr.clientCode ?? '—'); colors.splice(2, 0, COLOR.muted); bold.splice(2, 0, false) }
      r.tableRow(cols, values, { alternate: i % 2 === 1, valueColors: colors, valueBold: bold })
    })
  }

  // ─── Punch exceptions ─────────────────────────────────────────────────────
  r.accentSection(bi('Excepciones de punch', 'Punch exceptions'), COLOR.amber, COLOR.amberBg)
  if (data.exceptions.length === 0) {
    r.empty(bi('El certificado no tiene excepciones de punch.', 'No punch exceptions on this certificate.'))
  } else {
    r.tableHeader(EXC_COLS)
    data.exceptions.forEach((e, i) => {
      r.tableRow(
        EXC_COLS,
        [e.punchNumber, e.category, PUNCH_STATUS_LABEL[e.status] ?? e.status, e.justification],
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
  r.accentSection(bi('Firmas', 'Signatures'))
  const roleBox = (role: string) => {
    const [es, en] = SIGNATURE_ROLE[role] ?? [role, role]
    return { role: es, roleEn: es === en ? undefined : en }
  }
  const boxes = data.signatures.length > 0
    ? data.signatures.map(s => ({ ...roleBox(s.role), name: s.name ?? undefined, date: s.signedAt ?? undefined }))
    : ['completion', 'client', 'authority'].map(roleBox)
  r.signatureGrid(boxes, { placeholder: 'Nombre / fecha · Name / date' })

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
