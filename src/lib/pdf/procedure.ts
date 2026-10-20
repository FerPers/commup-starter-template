/**
 * PDF de un procedimiento (fase 6 del plan readiness, sesión 1): 15 secciones del catálogo (las vacías no
 * salen), tabla de pasos con hold points y criterios de parada, y bloque de aprobación / verificación en
 * campo. Bilingüe; regenerado desde la revisión guardada.
 */

import { PROCEDURE_SECTIONS, type ProcedureSection } from '@/lib/startup/catalog'
import { A4_W, COLOR, CONTENT_W, FOOTER_H, MARGIN, Renderer, sanitize, wrapText } from './renderer'
import { dateTimeIn, zoneLabel } from '@/lib/time/zone'

type Lang = 'es' | 'en'

export type ProcedurePdfInput = {
  lang: Lang
  orgName: string
  projectCode: string
  number: string
  title: string
  kindLabel: string
  system: string | null
  rev: number
  statusLabel: string
  approved: boolean
  sectionLabels: Record<ProcedureSection, string>
  sections: Record<string, string>
  steps: { ord: number; action: string; responsible: string | null; expected: string | null; tag: string | null; hold: boolean; capacityLabel: string | null; stop: string | null }[]
  author: string | null
  approvedBy: string | null
  approvedAt: string | null
  fieldVerifiedBy: string | null
  fieldVerifiedAt: string | null
  walkdownNote: string | null
  hash: string | null
  /** S10 (E-15c): zona del proyecto para las horas de aprobación y verificación. */
  timezone?: string
}

const T = {
  doc: { es: 'Procedimiento', en: 'Procedure' },
  steps: { es: 'Pasos', en: 'Steps' },
  hold: { es: 'HOLD POINT — libera', en: 'HOLD POINT — released by' },
  stop: { es: 'Detener si', en: 'Stop if' },
  expected: { es: 'Esperado', en: 'Expected' },
  responsible: { es: 'Responsable', en: 'Responsible' },
  signoff: { es: 'Aprobación y verificación en campo', en: 'Approval and field verification' },
  author: { es: 'Redactó', en: 'Prepared by' },
  approved: { es: 'Aprobó', en: 'Approved by' },
  verified: { es: 'Verificó en campo', en: 'Field verified by' },
  walkdown: { es: 'Walkdown', en: 'Walkdown' },
  page: { es: 'Página', en: 'Page' },
  notApproved: { es: 'NO APROBADO — no usar en campo', en: 'NOT APPROVED — do not use in the field' },
}

export async function renderProcedurePdf(x: ProcedurePdfInput): Promise<Uint8Array> {
  const tz = x.timezone ?? 'UTC'
  const at = (iso: string | null | undefined) => (iso ? `${dateTimeIn(iso, tz)} ${zoneLabel(tz, new Date(iso))}` : '')
  const L = x.lang
  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${x.number} R${x.rev} · ${x.title}`))
  r.doc.setAuthor('CommUp')
  r.setFooter(({ page, pageNum }) => {
    page.drawLine({ start: { x: MARGIN, y: MARGIN + FOOTER_H - 4 }, end: { x: A4_W - MARGIN, y: MARGIN + FOOTER_H - 4 }, thickness: 0.5, color: COLOR.borderLight })
    page.drawText(sanitize(`${x.number} R${x.rev} · ${x.statusLabel}${x.hash ? ` · sha256 ${x.hash.slice(0, 16)}` : ''}`), { x: MARGIN, y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    const s = `${T.page[L]} ${pageNum} / `
    const totalX = A4_W - MARGIN - 12
    page.drawText(s, { x: totalX - r.fontRegular.widthOfTextAtSize(s, 7), y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    r.registerTotalPagesPlaceholder(page, totalX, MARGIN + 6, 7, COLOR.empty)
  })

  r.newPage()
  r.topBar(COLOR.purple, 6)
  r.moveY(8)
  r.drawText('CommUp', { x: MARGIN, y: r.y - 14, size: 14, bold: true, color: COLOR.purple })
  r.badge(`R${x.rev} · ${x.statusLabel}`, { x: A4_W - MARGIN - 130, y: r.y - 14, fg: x.approved ? COLOR.green : COLOR.amber, bg: x.approved ? COLOR.greenBg : COLOR.amberBg, size: 9 })
  r.moveY(20)
  r.drawText(`${T.doc[L]} ${x.number} — ${x.title}`, { x: MARGIN, y: r.y - 13, size: 13, bold: true, maxWidth: CONTENT_W })
  r.moveY(16)
  r.drawText(`${x.orgName} · ${x.projectCode} · ${x.kindLabel}${x.system ? ` · ${x.system}` : ''}`, { x: MARGIN, y: r.y - 10, size: 9.5, color: COLOR.muted, maxWidth: CONTENT_W })
  r.moveY(14)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1, COLOR.text)
  r.moveY(8)
  if (!x.approved) { r.paragraph(T.notApproved[L], { size: 10, color: COLOR.red }); r.moveY(4) }

  const para = (text: string, size = 9, color = COLOR.text, indent = 0) => {
    for (const raw of text.split('\n')) {
      const lines = wrapText(raw, r.fontRegular, size, CONTENT_W - indent - 4)
      if (!lines.length) { r.moveY(4); continue }
      for (const l of lines) { r.ensureSpace(size + 3); r.drawText(l, { x: MARGIN + indent, y: r.y - size, size, color }); r.moveY(size + 3) }
    }
  }

  PROCEDURE_SECTIONS.forEach((k, idx) => {
    const body = x.sections[k]?.trim()
    if (k === 'sequence') {
      r.accentSection(`${idx + 1}. ${x.sectionLabels[k]}`)
      if (body) para(body)
      for (const s of x.steps) {
        r.ensureSpace(30)
        r.moveY(3)
        const head = `${s.ord}. ${s.action}${s.tag ? `  [${s.tag}]` : ''}`
        wrapText(head, r.fontBold, 9.5, CONTENT_W - 4).forEach(l => { r.ensureSpace(13); r.drawText(l, { x: MARGIN, y: r.y - 9.5, size: 9.5, bold: true }); r.moveY(13) })
        const meta = [s.responsible && `${T.responsible[L]}: ${s.responsible}`, s.expected && `${T.expected[L]}: ${s.expected}`].filter(Boolean).join(' · ')
        if (meta) para(meta, 8.5, COLOR.muted, 14)
        if (s.stop) para(`${T.stop[L]}: ${s.stop}`, 8.5, COLOR.red, 14)
        if (s.hold) para(`${T.hold[L]} ${s.capacityLabel ?? ''}  ________________  ____/____/______`, 8.5, COLOR.amber, 14)
      }
      return
    }
    if (!body) return
    r.accentSection(`${idx + 1}. ${x.sectionLabels[k]}`)
    para(body)
  })

  r.moveY(8)
  r.accentSection(T.signoff[L])
  r.kv(T.author[L], x.author ?? '—')
  r.kv(T.approved[L], `${x.approvedBy ?? '—'}  ${at(x.approvedAt)}`)
  r.kv(T.verified[L], `${x.fieldVerifiedBy ?? '—'}  ${at(x.fieldVerifiedAt)}`)
  if (x.walkdownNote) r.kv(T.walkdown[L], x.walkdownNote)

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
