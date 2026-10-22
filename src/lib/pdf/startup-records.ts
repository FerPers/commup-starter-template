/**
 * Registros imprimibles de arranque (S24b, E-22) — pdf-lib sobre el renderer compartido.
 *
 * - Ejecución de procedimiento: pasos con quién/cuándo/valor real, holds y quién los liberó, paradas y eventos.
 * - Hoja de line-up: posición requerida/encontrada, quién la puso y quién verificó.
 * - Ficha de evento de arranque: hito, testigo y parámetros congelados.
 *
 * Lo que falta por hacer sale con celdas en blanco: el mismo PDF es el respaldo en papel cuando falla la tablet
 * o no hay red, y el registro ejecutado del dossier (anexo del paquete de handover).
 */

import { Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H, sanitize, type Color, type TableCol } from './renderer'
import { dateTimeIn, zoneLabel } from '@/lib/time/zone'

type Lang = 'es' | 'en'
/** Etiquetas del espacio `Startup` (estados, capacidades, posiciones, hitos…). */
type Label = (key: string) => string

const T = {
  run:         { es: 'Ejecución de procedimiento', en: 'Procedure run' },
  lineup:      { es: 'Hoja de line-up', en: 'Line-up sheet' },
  event:       { es: 'Evento de arranque', en: 'Start-up event' },
  procedure:   { es: 'Procedimiento', en: 'Procedure' },
  system:      { es: 'Sistema', en: 'System' },
  started:     { es: 'Inició', en: 'Started' },
  completed:   { es: 'Completó', en: 'Completed' },
  stopped:     { es: 'Detenida', en: 'Stopped' },
  aborted:     { es: 'Abortada', en: 'Aborted' },
  reason:      { es: 'Motivo', en: 'Reason' },
  stopIf:      { es: 'Detener si', en: 'Stop if' },
  steps:       { es: 'Pasos', en: 'Steps' },
  step:        { es: 'Paso', en: 'Step' },
  expected:    { es: 'Esperado', en: 'Expected' },
  actual:      { es: 'Valor real', en: 'Actual value' },
  doneBy:      { es: 'Hecho por / hora', en: 'Done by / time' },
  hold:        { es: 'Hold point: libera', en: 'Hold point: released by' },
  holdBy:      { es: 'Hold liberado por', en: 'Hold released by' },
  comment:     { es: 'Comentario', en: 'Comment' },
  events:      { es: 'Eventos registrados en la ejecución', en: 'Events logged during the run' },
  timeline:    { es: 'Línea de tiempo', en: 'Timeline' },
  releaseNote: { es: 'Al liberar', en: 'On release' },
  safety:      { es: 'Seguridad', en: 'Safety' },
  stopCrit:    { es: 'Criterios de parada', en: 'Stop criteria' },
  signoff:     { es: 'Firmas en papel (si se ejecutó sin tablet)', en: 'Paper sign-off (if run without a tablet)' },
  executor:    { es: 'Ejecutó', en: 'Executed by' },
  supervisor:  { es: 'Supervisó', en: 'Supervised by' },
  purpose:     { es: 'Propósito', en: 'Purpose' },
  item:        { es: 'Válvula / ítem', en: 'Valve / item' },
  required:    { es: 'Requerida', en: 'Required' },
  found:       { es: 'Encontrada → dejada', en: 'As found → as left' },
  lock:        { es: 'Candado', en: 'Lock' },
  seal:        { es: 'Sello', en: 'Seal' },
  outOfRange:  { es: 'FUERA DE RANGO', en: 'OUT OF RANGE' },
  setBy:       { es: 'Puso / hora', en: 'Set by / time' },
  verifiedBy:  { es: 'Verificó / hora', en: 'Verified by / time' },
  critical:    { es: 'CRÍTICA — verificación independiente', en: 'CRITICAL — independent verification' },
  issued:      { es: 'Emitida', en: 'Issued' },
  verified:    { es: 'Verificada', en: 'Verified' },
  remarks:     { es: 'Observaciones', en: 'Remarks' },
  occurred:    { es: 'Ocurrió', en: 'Occurred' },
  recorded:    { es: 'Registró', en: 'Recorded by' },
  witness:     { es: 'Testigo', en: 'Witness' },
  pending:     { es: 'pendiente', en: 'pending' },
  run2:        { es: 'Ejecución', en: 'Run' },
  tags:        { es: 'Tags', en: 'Tags' },
  description: { es: 'Descripción', en: 'Description' },
  params:      { es: 'Parámetros congelados', en: 'Frozen parameters' },
  param:       { es: 'Parámetro', en: 'Parameter' },
  value:       { es: 'Valor', en: 'Value' },
  quality:     { es: 'Calidad', en: 'Quality' },
  sample:      { es: 'Muestra', en: 'Sample' },
  source:      { es: 'Fuente', en: 'Source' },
  voided:      { es: 'ANULADO', en: 'VOIDED' },
  backdate:    { es: 'Registrado con atraso', en: 'Recorded late' },
  none:        { es: 'Sin registros.', en: 'No records.' },
  page:        { es: 'Página', en: 'Page' },
  printed:     { es: 'Impreso', en: 'Printed' },
  nameDate:    { es: 'Nombre / fecha / hora', en: 'Name / date / time' },
}

type Common = {
  lang: Lang
  timezone?: string
  orgName: string
  projectCode: string
  label: Label
  /** Fecha de impresión (para pruebas); por defecto, ahora. */
  printedAt?: string
}

function setup(r: Renderer, x: Common, footer: string) {
  const L = x.lang
  const tz = x.timezone ?? 'UTC'
  const printed = x.printedAt ?? new Date().toISOString()
  r.doc.setAuthor('CommUp')
  r.setFooter(({ page, pageNum }) => {
    page.drawLine({ start: { x: MARGIN, y: MARGIN + FOOTER_H - 4 }, end: { x: A4_W - MARGIN, y: MARGIN + FOOTER_H - 4 }, thickness: 0.5, color: COLOR.borderLight })
    page.drawText(sanitize(`${footer} · ${T.printed[L]} ${dateTimeIn(printed, tz)} ${zoneLabel(tz, new Date(printed))}`), { x: MARGIN, y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    const s = `${T.page[L]} ${pageNum} / `
    const totalX = A4_W - MARGIN - 12
    page.drawText(s, { x: totalX - r.fontRegular.widthOfTextAtSize(s, 7), y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    r.registerTotalPagesPlaceholder(page, totalX, MARGIN + 6, 7, COLOR.empty)
  })
  return (iso: string | null | undefined) => (iso ? `${dateTimeIn(iso, tz)} ${zoneLabel(tz, new Date(iso))}` : '')
}

function header(r: Renderer, x: Common, o: { kind: string; number: string; title: string; sub: string; badge: string; tone: 'green' | 'amber' | 'red' | 'muted' }) {
  const tones: Record<typeof o.tone, [Color, Color]> = {
    green: [COLOR.green, COLOR.greenBg], amber: [COLOR.amber, COLOR.amberBg], red: [COLOR.red, COLOR.redBg], muted: [COLOR.muted, COLOR.borderXlight],
  }
  r.newPage()
  r.topBar(COLOR.purple, 6)
  r.moveY(8)
  r.drawText('CommUp', { x: MARGIN, y: r.y - 14, size: 14, bold: true, color: COLOR.purple })
  const badgeW = r.fontBold.widthOfTextAtSize(sanitize(o.badge), 9) + 12
  r.badge(o.badge, { x: A4_W - MARGIN - badgeW, y: r.y - 14, fg: tones[o.tone][0], bg: tones[o.tone][1], size: 9 })
  r.moveY(20)
  r.drawText(`${o.kind} ${o.number} — ${o.title}`, { x: MARGIN, y: r.y - 13, size: 13, bold: true, maxWidth: CONTENT_W })
  r.moveY(16)
  r.drawText(`${x.orgName} · ${x.projectCode} · ${o.sub}`, { x: MARGIN, y: r.y - 10, size: 9.5, color: COLOR.muted, maxWidth: CONTENT_W })
  r.moveY(14)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1, COLOR.text)
  r.moveY(8)
}

const blank = '\n\n'

// ── Ejecución de procedimiento ────────────────────────────────────────────────

export type RunPdfInput = Common & {
  number: string
  status: string
  procedure: { number: string; title: string; rev: number; hash: string | null }
  system: string | null
  safety: string | null
  stopCriteria: string | null
  startedBy: string | null
  startedAt: string | null
  completedBy: string | null
  completedAt: string | null
  stoppedBy: string | null
  stoppedAt: string | null
  stopReason: string | null
  abortedBy: string | null
  abortedAt: string | null
  abortReason: string | null
  steps: {
    ord: number; action: string; tag: string | null; responsible: string | null; expected: string | null; stop: string | null
    /** S25b (E-23) */
    range?: string | null; outOfRange?: boolean
    hold: boolean; holdCapacity: string | null; status: string; actual: string | null; comment: string | null
    doneBy: string | null; doneAt: string | null; releasedBy: string | null; releasedAt: string | null; releaseComment?: string | null
  }[]
  /** S25 (E-10): paradas, reanudaciones y holds liberados, en orden. `label` ya traducido. */
  timeline?: { at: string; label: string; by: string | null; comment: string | null }[]
  events: { number: string; occurredAt: string; title: string; label: string }[]
}

export async function renderRunPdf(x: RunPdfInput): Promise<Uint8Array> {
  const L = x.lang
  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${x.number} · ${x.procedure.number} R${x.procedure.rev}`))
  const at = setup(r, x, `${x.number} · ${x.procedure.number} R${x.procedure.rev}${x.procedure.hash ? ` · sha256 ${x.procedure.hash.slice(0, 16)}` : ''}`)
  const tone = x.status === 'completed' ? 'green' : x.status === 'stopped' || x.status === 'aborted' ? 'red' : x.status === 'at_hold' ? 'amber' : 'muted'
  header(r, x, {
    kind: T.run[L], number: x.number, title: x.procedure.title, badge: x.label(`runStatus.${x.status}`), tone,
    sub: `${T.procedure[L]} ${x.procedure.number} R${x.procedure.rev}${x.system ? ` · ${x.system}` : ''}`,
  })

  r.kv(T.started[L], `${x.startedBy ?? '—'}  ${at(x.startedAt)}`)
  if (x.completedAt) r.kv(T.completed[L], `${x.completedBy ?? '—'}  ${at(x.completedAt)}`)
  if (x.stoppedAt) r.kv(T.stopped[L], `${x.stoppedBy ?? '—'}  ${at(x.stoppedAt)}${x.stopReason ? ` · ${x.stopReason}` : ''}`)
  if (x.abortedAt) r.kv(T.aborted[L], `${x.abortedBy ?? '—'}  ${at(x.abortedAt)}${x.abortReason ? ` · ${x.abortReason}` : ''}`)
  if (x.safety?.trim()) { r.accentSection(T.safety[L], COLOR.amber); r.paragraph(x.safety, { size: 8.5 }) }
  if (x.stopCriteria?.trim()) { r.accentSection(T.stopCrit[L], COLOR.red); r.paragraph(x.stopCriteria, { size: 8.5, color: COLOR.red }) }

  r.accentSection(T.steps[L])
  const cols: TableCol[] = [
    { w: 22, label: '#' }, { w: 185, label: T.step[L] }, { w: 70, label: T.expected[L] },
    { w: 70, label: T.actual[L] }, { w: 88, label: T.doneBy[L] }, { w: CONTENT_W - 435, label: T.holdBy[L] },
  ]
  r.tableHeader(cols)
  for (const s of x.steps) {
    const done = s.status !== 'pending'
    const stepText = [
      `${s.action}${s.tag ? ` [${s.tag}]` : ''}`,
      s.responsible && `(${s.responsible})`,
      s.stop && `${T.stopIf[L]}: ${s.stop}`,
      s.hold && `${T.hold[L]} ${s.holdCapacity ? x.label(`capacity.${s.holdCapacity}`) : ''}`,
      s.comment && `${T.comment[L]}: ${s.comment}`,
    ].filter(Boolean).join('\n')
    r.tableRowWrapped(cols, [
      { text: String(s.ord), bold: true },
      { text: stepText, color: s.hold ? COLOR.amber : COLOR.text },
      [s.expected, s.range].filter(Boolean).join('\n'),
      s.outOfRange ? { text: `${s.actual ?? ''}\n${T.outOfRange[L]}`, bold: true, color: COLOR.red }
        : { text: s.status === 'na' ? 'N/A' : s.actual ?? (done ? '' : blank), bold: true },
      done ? `${s.doneBy ?? '—'}\n${at(s.doneAt)}` : blank,
      s.hold ? (s.releasedBy ? `${s.releasedBy}\n${at(s.releasedAt)}${s.releaseComment ? `\n${T.releaseNote[L]}: ${s.releaseComment}` : ''}` : blank) : '',
    ], { repeatHeader: true, minHeight: done ? 0 : 26, bg: s.status === 'pending' ? undefined : s.hold ? COLOR.amberBg : undefined })
  }

  if (x.timeline?.length) {
    r.accentSection(T.timeline[L])
    for (const e of x.timeline) r.kv(at(e.at), `${e.label} · ${e.by ?? '—'}${e.comment ? ` — ${e.comment}` : ''}`, { keyW: 120 })
  }

  if (x.events.length) {
    r.accentSection(T.events[L])
    for (const e of x.events) r.kv(e.number, `${at(e.occurredAt)} · ${e.label}: ${e.title}`, { keyW: 70 })
  }

  if (x.status !== 'completed' && x.status !== 'aborted') {
    r.accentSection(T.signoff[L])
    r.signatureGrid([{ role: T.executor[L] }, { role: T.supervisor[L] }], { placeholder: T.nameDate[L] })
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}

// ── Hoja de line-up ──────────────────────────────────────────────────────────

export type LineupPdfInput = Common & {
  number: string
  title: string
  status: string
  purpose: string
  system: string | null
  procedure: string | null
  issuedBy: string | null
  issuedAt: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  hash: string | null
  stale: boolean
  items: {
    ord: number; tag: string | null; description: string | null; label: string; required: string | null; requiredNote: string | null
    critical: boolean; found: string | null; remarks: string | null
    /** S25b (E-21) */
    asFound?: string | null; lock?: string | null; seal?: string | null
    setBy: string | null; setAt: string | null; verifiedBy: string | null; verifiedAt: string | null
  }[]
}

export async function renderLineupPdf(x: LineupPdfInput): Promise<Uint8Array> {
  const L = x.lang
  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${x.number} · ${x.title}`))
  const at = setup(r, x, `${x.number}${x.hash ? ` · sha256 ${x.hash.slice(0, 16)}` : ''}`)
  header(r, x, {
    kind: T.lineup[L], number: x.number, title: x.title, badge: x.label(`sheetStatus.${x.status}`),
    tone: x.status === 'verified' ? (x.stale ? 'amber' : 'green') : x.status === 'superseded' ? 'muted' : 'amber',
    sub: `${x.system ?? '—'}${x.procedure ? ` · ${x.procedure}` : ''}`,
  })
  r.kv(T.purpose[L], x.label(`purpose.${x.purpose}`))
  if (x.issuedAt) r.kv(T.issued[L], `${x.issuedBy ?? '—'}  ${at(x.issuedAt)}`)
  if (x.verifiedAt) r.kv(T.verified[L], `${x.verifiedBy ?? '—'}  ${at(x.verifiedAt)}${x.hash ? ` · sha256 ${x.hash.slice(0, 16)}` : ''}`)

  r.accentSection(T.lineup[L])
  const cols: TableCol[] = [
    { w: 22, label: '#' }, { w: 175, label: T.item[L] }, { w: 62, label: T.required[L] },
    { w: 62, label: T.found[L] }, { w: 100, label: T.setBy[L] }, { w: CONTENT_W - 421, label: T.verifiedBy[L] },
  ]
  r.tableHeader(cols)
  if (!x.items.length) r.empty(T.none[L])
  for (const i of x.items) {
    const item = [
      `${i.tag ?? ''}${i.tag && i.label ? ' · ' : ''}${i.label}`,
      i.description,
      i.requiredNote,
      i.critical && T.critical[L],
      i.remarks && `${T.remarks[L]}: ${i.remarks}`,
    ].filter(Boolean).join('\n')
    const mismatch = !!i.found && !!i.required && i.found !== i.required
    r.tableRowWrapped(cols, [
      { text: String(i.ord), bold: true },
      { text: item, color: i.critical ? COLOR.red : COLOR.text },
      i.required ? { text: x.label(`position.${i.required}`), bold: true } : blank,
      i.found ? {
        text: [
          `${i.asFound ? `${x.label(`position.${i.asFound}`)} → ` : ''}${x.label(`position.${i.found}`)}`,
          i.lock && `${T.lock[L]} ${i.lock}`, i.seal && `${T.seal[L]} ${i.seal}`,
        ].filter(Boolean).join('\n'),
        bold: true, color: mismatch ? COLOR.red : COLOR.green,
      } : blank,
      i.setBy ? `${i.setBy}\n${at(i.setAt)}` : blank,
      i.critical ? (i.verifiedBy ? `${i.verifiedBy}\n${at(i.verifiedAt)}` : blank) : '',
    ], { repeatHeader: true, minHeight: i.found ? 0 : 24 })
  }

  if (x.status !== 'verified' && x.status !== 'superseded') {
    r.accentSection(T.signoff[L])
    r.signatureGrid([{ role: T.executor[L] }, { role: T.verifiedBy[L] }], { placeholder: T.nameDate[L] })
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}

// ── Ficha de evento de arranque ──────────────────────────────────────────────

export type EventPdfInput = Common & {
  number: string
  kind: 'milestone' | 'free'
  milestone: string | null
  category: string | null
  status: string
  title: string
  description: string | null
  occurredAt: string
  system: string | null
  run: string | null
  tags: string[]
  recordedBy: string | null
  recordedAt: string | null
  witnessCapacity: string | null
  witnessBy: string | null
  witnessAt: string | null
  voidedBy: string | null
  voidedAt: string | null
  voidReason: string | null
  /** S25 (E-16): motivo de registrar un evento de hace más de 7 días. */
  backdateReason?: string | null
  params: { label: string; value: number | null; valueText: string | null; unit: string | null; quality: number | null; sampledAt: string | null; offsetS: number | null; source: string }[]
}

export async function renderEventPdf(x: EventPdfInput): Promise<Uint8Array> {
  const L = x.lang
  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${x.number} · ${x.title}`))
  const at = setup(r, x, x.number)
  const kindLabel = x.kind === 'milestone' && x.milestone ? x.label(`milestone.${x.milestone}`) : x.category ? x.label(`category.${x.category}`) : ''
  header(r, x, {
    kind: T.event[L], number: x.number, title: x.title, badge: x.label(`eventStatus.${x.status}`),
    tone: x.status === 'voided' ? 'red' : x.status === 'pending_witness' ? 'amber' : 'green',
    sub: `${kindLabel}${x.system ? ` · ${x.system}` : ''}`,
  })
  if (x.status === 'voided') {
    r.paragraph(`${T.voided[L]} — ${x.voidedBy ?? '—'} ${at(x.voidedAt)}${x.voidReason ? `: ${x.voidReason}` : ''}`, { size: 10, color: COLOR.red })
    r.moveY(4)
  }
  r.kv(T.occurred[L], at(x.occurredAt))
  r.kv(T.recorded[L], `${x.recordedBy ?? '—'}  ${at(x.recordedAt)}`)
  if (x.witnessCapacity) {
    r.kv(`${T.witness[L]} (${x.label(`capacity.${x.witnessCapacity}`)})`, x.witnessBy ? `${x.witnessBy}  ${at(x.witnessAt)}` : T.pending[L], { keyW: 150 })
  }
  if (x.backdateReason) r.kv(T.backdate[L], x.backdateReason, { keyW: 150 })
  if (x.run) r.kv(T.run2[L], x.run)
  if (x.tags.length) r.kv(T.tags[L], x.tags.join(', '))
  if (x.description?.trim()) { r.accentSection(T.description[L]); r.paragraph(x.description, { size: 9 }) }

  r.accentSection(T.params[L])
  if (!x.params.length) r.empty(T.none[L])
  else {
    const cols: TableCol[] = [
      { w: 150, label: T.param[L] }, { w: 90, label: T.value[L], align: 'right' }, { w: 55, label: T.quality[L], align: 'center' },
      { w: 150, label: T.sample[L] }, { w: CONTENT_W - 445, label: T.source[L] },
    ]
    r.tableHeader(cols)
    x.params.forEach((p, i) => r.tableRow(cols, [
      p.label,
      `${p.value ?? p.valueText ?? '—'}${p.unit ? ` ${p.unit}` : ''}`,
      p.quality === null ? '—' : String(p.quality),
      p.sampledAt ? `${at(p.sampledAt)}${p.offsetS ? ` (${p.offsetS > 0 ? '+' : ''}${p.offsetS} s)` : ''}` : '—',
      p.source,
    ], { size: 8, alternate: i % 2 === 1 }))
  }

  if (x.witnessCapacity && !x.witnessBy && x.status !== 'voided') {
    r.accentSection(T.signoff[L])
    r.signatureGrid([{ role: `${T.witness[L]} (${x.label(`capacity.${x.witnessCapacity}`)})` }], { placeholder: T.nameDate[L] })
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
