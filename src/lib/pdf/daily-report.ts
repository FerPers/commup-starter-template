/**
 * PDF del reporte diario y del relevo de turno (fase 5 del plan readiness, sesión 3 — §11.19–22).
 * Se regenera siempre desde los datos congelados (`daily_reports.data` / `shift_handovers.snapshot`) y
 * las secciones guardadas; lo inmutable es el contenido con su hash, no el archivo. Bilingüe.
 */

import { cutInUtc, progressDelta, reportTotals, type ReportData } from '@/lib/daily/report'
import { dateTimeIn, timeIn, zoneLabel } from '@/lib/time/zone'
import { A4_W, COLOR, CONTENT_W, FOOTER_H, MARGIN, Renderer, sanitize, wrapText, type TableCol } from './renderer'

type Lang = 'es' | 'en'

const T = {
  report: { es: 'Reporte diario de comisionamiento', en: 'Daily commissioning report' },
  handover: { es: 'Relevo de turno', en: 'Shift handover' },
  draft: { es: 'BORRADOR', en: 'DRAFT' },
  issued: { es: 'EMITIDO', en: 'ISSUED' },
  superseded: { es: 'REEMPLAZADO', en: 'SUPERSEDED' },
  accepted: { es: 'RECIBIDO', en: 'ACCEPTED' },
  handedOver: { es: 'ENTREGADO', en: 'HANDED OVER' },
  page: { es: 'Página', en: 'Page' },
  weighted: { es: 'Avance ponderado', en: 'Weighted progress' },
  gates: { es: 'Gates aprobados', en: 'Gates approved' },
  itrToday: { es: 'ITR hoy', en: 'ITRs today' },
  punchA: { es: 'Punch A abiertos', en: 'Open Cat A punches' },
  constraints: { es: 'Restricciones', en: 'Constraints' },
  sections: {
    summary: { es: 'Resumen', en: 'Summary' },
    key_events: { es: 'Eventos clave', en: 'Key events' },
    issues: { es: 'Fallas y problemas', en: 'Issues' },
    constraints: { es: 'Restricciones', en: 'Constraints' },
    next_day_plan: { es: 'Plan del día siguiente', en: 'Next-day plan' },
  },
  data: { es: 'Datos del día (foto del', en: 'Day data (snapshot at' },
  itrApproved: { es: 'ITR aprobados hoy', en: 'ITRs approved today' },
  punchRaised: { es: 'Punch levantados hoy', en: 'Punches raised today' },
  critical: { es: 'Restricciones críticas (N≥3 o vencidas)', en: 'Critical constraints (L≥3 or overdue)' },
  overdueActions: { es: 'Acciones vencidas', en: 'Overdue actions' },
  field: { es: 'Estado temporal en campo', en: 'Temporary state in the field' },
  lookahead: { es: 'Próximos 7 días', en: 'Next 7 days' },
  startup: { es: 'Bitácora de arranque', en: 'Start-up log' },
  performance: { es: 'Pruebas de desempeño', en: 'Performance tests' },
  none: { es: 'Sin registros.', en: 'None.' },
  utcCut: { es: 'Reporte armado antes de la zona horaria del proyecto: su día se cortó en UTC (00:00–24:00 UTC). Queda tal como se emitió; para corregirlo, emita una revisión.',
    en: 'Report built before the project time zone existed: its day was cut in UTC (00:00–24:00 UTC). It stays as issued; issue a revision to correct it.' },
  asOf: { es: 'Avance, gates en regresión, abiertos y vencidos: estado al', en: 'Progress, regressed gates, open and overdue items: status as of' },
  listed: { es: 'se listan', en: 'listing' },
  issuedBy: { es: 'Emitido por', en: 'Issued by' },
  hash: { es: 'Hash', en: 'Hash' },
  revision: { es: 'Revisión', en: 'Revision' },
  reason: { es: 'Motivo', en: 'Reason' },
  col: {
    number: { es: 'Número', en: 'Number' }, tag: { es: 'Tag', en: 'Tag' }, system: { es: 'Sistema', en: 'System' },
    cat: { es: 'Cat', en: 'Cat' }, description: { es: 'Descripción', en: 'Description' }, level: { es: 'Nivel', en: 'Level' },
    need: { es: 'Requerida', en: 'Need date' }, due: { es: 'Vencía', en: 'Was due' }, kind: { es: 'Tipo', en: 'Type' },
    status: { es: 'Estado', en: 'Status' }, title: { es: 'Título', en: 'Title' }, date: { es: 'Fecha', en: 'Date' },
    progress: { es: 'Avance', en: 'Progress' },
  },
  shift: { day: { es: 'Día', en: 'Day' }, night: { es: 'Noche', en: 'Night' }, other: { es: 'Otro', en: 'Other' } },
  registers: { es: 'Registros en campo (bypass, ciegas, temporales, energizados)', en: 'Registers in the field (bypasses, blinds, temporaries, energised)' },
  itrsInProgress: { es: 'ITR en curso', en: 'ITRs in progress' },
  openConstraints: { es: 'Restricciones abiertas', en: 'Open constraints' },
  pending: { es: 'Pendientes para el turno entrante', en: 'Pending items for the incoming shift' },
  safety: { es: 'Notas de seguridad', en: 'Safety notes' },
  handedBy: { es: 'Entrega', en: 'Handed over by' },
  receivedBy: { es: 'Recibe', en: 'Received by' },
  comment: { es: 'Comentario de quien recibe', en: 'Receiver comment' },
}

function setup(r: Renderer, footer: string, L: Lang) {
  r.setFooter(({ page, pageNum }) => {
    page.drawLine({ start: { x: MARGIN, y: MARGIN + FOOTER_H - 4 }, end: { x: A4_W - MARGIN, y: MARGIN + FOOTER_H - 4 }, thickness: 0.5, color: COLOR.borderLight })
    page.drawText(sanitize(footer).slice(0, 140), { x: MARGIN, y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    const pageStr = `${T.page[L]} ${pageNum} / `
    const totalX = A4_W - MARGIN - 12
    page.drawText(pageStr, { x: totalX - r.fontRegular.widthOfTextAtSize(pageStr, 7), y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    r.registerTotalPagesPlaceholder(page, totalX, MARGIN + 6, 7, COLOR.empty)
  })
}

function header(r: Renderer, title: string, org: string, line: string, stamp: { text: string; fg: typeof COLOR.text; bg: typeof COLOR.text }) {
  r.newPage()
  r.topBar(COLOR.purple, 6)
  r.moveY(8)
  r.drawText('CommUp', { x: MARGIN, y: r.y - 14, size: 14, bold: true, color: COLOR.purple })
  r.badge(stamp.text, { x: A4_W - MARGIN - 90, y: r.y - 14, fg: stamp.fg, bg: stamp.bg, size: 9 })
  r.moveY(20)
  r.drawText(title, { x: MARGIN, y: r.y - 13, size: 13, bold: true, maxWidth: CONTENT_W })
  r.moveY(16)
  r.drawText(`${org} · ${line}`, { x: MARGIN, y: r.y - 10, size: 9.5, color: COLOR.muted, maxWidth: CONTENT_W })
  r.moveY(14)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1, COLOR.text)
  r.moveY(8)
}

/** Texto con viñetas «- » respetadas; líneas largas se envuelven. */
function block(r: Renderer, text: string | null | undefined, L: Lang) {
  const body = (text ?? '').trim()
  if (!body) { r.empty(T.none[L]); return }
  for (const raw of body.split('\n')) {
    const isBullet = /^\s*[-•*]\s+/.test(raw)
    const line = raw.replace(/^\s*[-•*]\s+/, '')
    const indent = isBullet ? 12 : 0
    const lines = wrapText(line, r.fontRegular, 9, CONTENT_W - indent - 4)
    if (!lines.length) { r.moveY(5); continue }
    lines.forEach((l, i) => {
      r.ensureSpace(12)
      if (isBullet && i === 0) r.drawText('-', { x: MARGIN + 3, y: r.y - 9, size: 9, color: COLOR.muted })
      r.drawText(l, { x: MARGIN + indent, y: r.y - 9, size: 9 })
      r.moveY(12)
    })
  }
  r.moveY(4)
}

function table(r: Renderer, cols: TableCol[], rows: string[][], L: Lang) {
  if (!rows.length) { r.empty(T.none[L]); return }
  r.tableHeader(cols)
  rows.forEach((v, i) => r.tableRow(cols, v, { alternate: i % 2 === 1 }))
  r.moveY(6)
}

const w = (fr: number) => CONTENT_W * fr

export type DailyReportPdfInput = {
  lang: Lang
  orgName: string
  number: string
  revision: number
  revisionReason: string | null
  status: 'draft' | 'issued' | 'superseded'
  data: ReportData
  dataAt: string
  sections: { summary: string | null; key_events: string | null; issues: string | null; constraints: string | null; next_day_plan: string | null }
  issuedBy: string | null
  issuedAt: string | null
  hash: string | null
  /** S10: zona del proyecto para las horas (por defecto la del reporte). */
  timezone?: string
}

export async function renderDailyReportPdf(x: DailyReportPdfInput): Promise<Uint8Array> {
  const L = x.lang
  const d = x.data
  // S10 (D12): las horas en la zona del proyecto; un reporte anterior a S10 cortó su día en UTC.
  const tz = d.timezone ?? x.timezone ?? 'UTC'
  const at = (iso: string | null | undefined) => (iso ? `${dateTimeIn(iso, tz)} ${zoneLabel(tz, new Date(iso))}` : '')
  const n = reportTotals(d)
  const count = (label: string, total: number, shown: number) => `${label} (${total}${total > shown ? ` · ${T.listed[L]} ${shown}` : ''})`
  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${x.number} · ${T.report[L]}`))
  r.doc.setAuthor('CommUp')
  const footer = x.status === 'draft'
    ? `${x.number} · ${T.draft[L]}`
    : `${x.number} · ${T.issuedBy[L]}: ${x.issuedBy ?? '—'} ${at(x.issuedAt)} · ${T.hash[L]} ${x.hash?.slice(0, 16) ?? ''}`
  setup(r, footer, L)
  const stamp = x.status === 'issued' ? { text: T.issued[L], fg: COLOR.green, bg: COLOR.greenBg }
    : x.status === 'superseded' ? { text: T.superseded[L], fg: COLOR.muted, bg: COLOR.borderXlight }
    : { text: T.draft[L], fg: COLOR.amber, bg: COLOR.amberBg }
  header(r, `${T.report[L]} — ${d.date}`, x.orgName,
    `${d.project.code} · ${d.project.name}${d.area ? ` · ${d.area.code}` : ''} · ${x.number}`, stamp)
  if (x.revision > 0) {
    r.paragraph(`${T.revision[L]} R${x.revision}${x.revisionReason ? ` — ${T.reason[L]}: ${x.revisionReason}` : ''}`, { size: 8.5, color: COLOR.muted, oblique: true })
  }
  if (cutInUtc(d)) r.paragraph(T.utcCut[L], { size: 8.5, color: COLOR.amber, oblique: true })
  else if (d.as_of) r.paragraph(`${T.asOf[L]} ${at(d.as_of)}.`, { size: 8, color: COLOR.muted, oblique: true })

  const delta = progressDelta(d.progress)
  const lv = d.constraints.open_by_level
  r.infoCardRow([
    { label: T.weighted[L], value: `${(Number(d.progress.weighted_pct) * 100).toFixed(1)} %`, sub: delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta} pp` },
    { label: T.gates[L], value: `${d.progress.gates_approved}/${d.progress.gates_total}` },
    { label: T.itrToday[L], value: String(n.approvedToday), sub: `${d.itrs.in_progress} ${L === 'es' ? 'en curso' : 'in progress'}` },
    { label: T.punchA[L], value: String(d.punches.open_a), sub: `B ${d.punches.open_b}` },
    { label: T.constraints[L], value: String(Number(lv['1']) + Number(lv['2']) + Number(lv['3']) + Number(lv['4'])), sub: `N3 ${lv['3']} · N4 ${lv['4']}` },
  ])
  r.moveY(8)

  for (const key of ['summary', 'key_events', 'issues', 'constraints', 'next_day_plan'] as const) {
    r.accentSection(T.sections[key][L])
    block(r, x.sections[key], L)
  }

  r.accentSection(`${T.data[L]} ${at(x.dataAt)})`)
  r.paragraph(count(T.itrApproved[L], n.approvedToday, d.itrs.approved_today.length), { size: 9 })
  table(r, [{ label: T.col.number[L], w: w(0.35) }, { label: T.col.tag[L], w: w(0.35) }, { label: T.col.system[L], w: w(0.3) }],
    d.itrs.approved_today.map(i => [i.number, i.tag ?? '', i.system ?? '']), L)
  r.paragraph(count(T.punchRaised[L], n.raisedToday, d.punches.raised_today.length), { size: 9 })
  table(r, [{ label: T.col.number[L], w: w(0.16) }, { label: T.col.cat[L], w: w(0.07), align: 'center' }, { label: T.col.description[L], w: w(0.5) }, { label: T.col.tag[L], w: w(0.14) }, { label: T.col.system[L], w: w(0.13) }],
    d.punches.raised_today.map(p => [p.number, p.category, p.description, p.tag ?? '', p.system ?? '']), L)
  r.paragraph(count(T.critical[L], n.constraintsHigh, d.constraints.open_high.length), { size: 9 })
  table(r, [{ label: T.col.number[L], w: w(0.13) }, { label: T.col.level[L], w: w(0.08), align: 'center' }, { label: T.col.title[L], w: w(0.47) }, { label: T.col.system[L], w: w(0.16) }, { label: T.col.need[L], w: w(0.16) }],
    d.constraints.open_high.map(c => [c.number, `N${c.level}`, c.title, c.system ?? '', c.need_date]), L)
  r.paragraph(count(T.overdueActions[L], n.actionsOverdue, d.actions.overdue.length), { size: 9 })
  table(r, [{ label: T.col.number[L], w: w(0.15) }, { label: T.col.title[L], w: w(0.55) }, { label: T.col.system[L], w: w(0.15) }, { label: T.col.due[L], w: w(0.15) }],
    d.actions.overdue.map(a => [a.number, a.title, a.system ?? '', a.due_date]), L)
  r.paragraph(count(T.field[L], n.registersInField, d.registers_in_field.length), { size: 9 })
  table(r, [{ label: T.col.number[L], w: w(0.15) }, { label: T.col.kind[L], w: w(0.15) }, { label: T.col.status[L], w: w(0.12) }, { label: T.col.title[L], w: w(0.43) }, { label: T.col.system[L], w: w(0.15) }],
    d.registers_in_field.map(g => [g.number, g.kind, g.status, g.title, g.system ?? '']), L)
  if ((d.startup_events_today ?? []).length > 0) {
    r.paragraph(T.startup[L], { size: 9 })
    table(r, [{ label: T.col.date[L], w: w(0.1) }, { label: T.col.number[L], w: w(0.12) }, { label: T.col.title[L], w: w(0.4) }, { label: T.col.system[L], w: w(0.13) }, { label: T.col.status[L], w: w(0.25) }],
      (d.startup_events_today ?? []).map(e => [timeIn(e.occurred_at, tz), e.number, e.title, e.system ?? '', e.params.map(p => `${p.label} ${p.value ?? ''}${p.unit ? ` ${p.unit}` : ''}`).join(' · ') || e.status]), L)
  }
  if ((d.performance_today ?? []).length > 0) {
    r.paragraph(T.performance[L], { size: 9 })
    table(r, [{ label: T.col.number[L], w: w(0.16) }, { label: T.col.title[L], w: w(0.44) }, { label: T.col.system[L], w: w(0.15) }, { label: T.col.status[L], w: w(0.25) }],
      (d.performance_today ?? []).map(p => [p.number, p.title, p.system ?? '', p.kind === 'run' ? (p.result ?? p.status) : p.status]), L)
  }
  r.paragraph(T.lookahead[L], { size: 9 })
  table(r, [{ label: T.col.date[L], w: w(0.14) }, { label: T.col.kind[L], w: w(0.12) }, { label: T.col.number[L], w: w(0.14) }, { label: T.col.title[L], w: w(0.45) }, { label: T.col.system[L], w: w(0.15) }],
    d.lookahead_7d.map(i => [i.date, i.kind, i.ref, i.title, i.system ?? '']), L)

  r.finalizePagePlaceholders()
  return await r.doc.save()
}

export type HandoverSnapshot = {
  registers: { id: string; number: string; kind: string; status: string; title: string; system: string | null }[]
  itrs_in_progress: { id: string; number: string; tag: string | null; progress: number }[]
  itrs_in_progress_total: number
  punches_a: { id: string; number: string; description: string; tag: string | null }[]
  constraints: { id: string; number: string; title: string; level: number; need_date: string; system: string }[]
  actions_overdue: { id: string; number: string; title: string; due_date: string }[]
  taken_at: string
}

export type HandoverPdfInput = {
  lang: Lang
  orgName: string
  projectCode: string
  projectName: string
  number: string
  shiftDate: string
  shiftLabel: 'day' | 'night' | 'other'
  status: 'draft' | 'handed_over' | 'accepted'
  snapshot: HandoverSnapshot
  pending: string | null
  safety: string | null
  handedBy: string | null
  handedAt: string | null
  receivedBy: string | null
  receivedAt: string | null
  receiverComment: string | null
  hash: string | null
  /** S10: zona del proyecto para las horas de entrega y recepción. */
  timezone?: string
}

export async function renderHandoverPdf(x: HandoverPdfInput): Promise<Uint8Array> {
  const L = x.lang
  const s = x.snapshot
  const tz = x.timezone ?? 'UTC'
  const at = (iso: string | null | undefined) => (iso ? `${dateTimeIn(iso, tz)} ${zoneLabel(tz, new Date(iso))}` : '')
  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${x.number} · ${T.handover[L]}`))
  r.doc.setAuthor('CommUp')
  setup(r, `${x.number} · ${x.projectCode}${x.hash ? ` · ${T.hash[L]} ${x.hash.slice(0, 16)}` : ''}`, L)
  const stamp = x.status === 'accepted' ? { text: T.accepted[L], fg: COLOR.green, bg: COLOR.greenBg }
    : x.status === 'handed_over' ? { text: T.handedOver[L], fg: COLOR.blue, bg: COLOR.blueBg }
    : { text: T.draft[L], fg: COLOR.amber, bg: COLOR.amberBg }
  header(r, `${T.handover[L]} — ${x.shiftDate} · ${T.shift[x.shiftLabel][L]}`, x.orgName, `${x.projectCode} · ${x.projectName} · ${x.number}`, stamp)

  r.accentSection(T.safety[L]); block(r, x.safety, L)
  r.accentSection(T.pending[L]); block(r, x.pending, L)
  r.accentSection(T.registers[L])
  table(r, [{ label: T.col.number[L], w: w(0.15) }, { label: T.col.kind[L], w: w(0.15) }, { label: T.col.status[L], w: w(0.12) }, { label: T.col.title[L], w: w(0.43) }, { label: T.col.system[L], w: w(0.15) }],
    s.registers.map(g => [g.number, g.kind, g.status, g.title, g.system ?? '']), L)
  r.accentSection(`${T.punchA[L]} (${s.punches_a.length})`)
  table(r, [{ label: T.col.number[L], w: w(0.18) }, { label: T.col.description[L], w: w(0.62) }, { label: T.col.tag[L], w: w(0.2) }],
    s.punches_a.map(p => [p.number, p.description, p.tag ?? '']), L)
  r.accentSection(T.openConstraints[L])
  table(r, [{ label: T.col.number[L], w: w(0.14) }, { label: T.col.level[L], w: w(0.08), align: 'center' }, { label: T.col.title[L], w: w(0.46) }, { label: T.col.system[L], w: w(0.16) }, { label: T.col.need[L], w: w(0.16) }],
    s.constraints.map(c => [c.number, `N${c.level}`, c.title, c.system, c.need_date]), L)
  r.accentSection(`${T.overdueActions[L]} (${s.actions_overdue.length})`)
  table(r, [{ label: T.col.number[L], w: w(0.18) }, { label: T.col.title[L], w: w(0.62) }, { label: T.col.due[L], w: w(0.2) }],
    s.actions_overdue.map(a => [a.number, a.title, a.due_date]), L)
  r.accentSection(`${T.itrsInProgress[L]} (${s.itrs_in_progress_total})`)
  table(r, [{ label: T.col.number[L], w: w(0.4) }, { label: T.col.tag[L], w: w(0.4) }, { label: T.col.progress[L], w: w(0.2), align: 'right' }],
    s.itrs_in_progress.map(i => [i.number, i.tag ?? '', `${Math.round(Number(i.progress))} %`]), L)

  r.moveY(6)
  r.kv(T.handedBy[L], `${x.handedBy ?? '—'}  ${at(x.handedAt)}`)
  r.kv(T.receivedBy[L], `${x.receivedBy ?? '—'}  ${at(x.receivedAt)}`)
  if (x.receiverComment) r.kv(T.comment[L], x.receiverComment)

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
