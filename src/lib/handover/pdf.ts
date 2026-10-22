/**
 * Índice PDF del paquete de handover (v3, S24) — pdf-lib sobre el renderer compartido.
 *
 * Es el «respaldo imprimible» del paquete: por sistema, etapa de propiedad, gates con firmas, PSSR, procedimientos
 * (revisión vigente + última ejecución con pasos y holds), line-ups verificados, bitácora de arranque, traspasos,
 * competencias, repuestos, desempeño/PTC, documentos y vendors; después punch Cat B, certificados, la lista de anexos
 * del ZIP y cómo verificar la firma. Lee también paquetes v2 (sin las secciones nuevas).
 */

import { Renderer, COLOR, A4_W, MARGIN, CONTENT_W, FOOTER_H, sanitize, wrapText, type TableCol } from '@/lib/pdf/renderer'
import { drawBrandBar, type PdfBranding } from '@/lib/pdf/branding'
import { dateTimeIn, zoneLabel } from '@/lib/time/zone'
import type { HandoverPackageData, HandoverSigner } from './types'

type Lang = 'es' | 'en'

const T = {
  title:        { es: 'Paquete de handover', en: 'Handover package' },
  project:      { es: 'Proyecto', en: 'Project' },
  client:       { es: 'Cliente', en: 'Client' },
  location:     { es: 'Ubicación', en: 'Location' },
  generated:    { es: 'Generado', en: 'Generated' },
  systems:      { es: 'Sistemas', en: 'Systems' },
  system:       { es: 'Sistema', en: 'System' },
  stage:        { es: 'Etapa de propiedad', en: 'Ownership stage' },
  progress:     { es: 'Tags / ITR', en: 'Tags / ITRs' },
  itrApproved:  { es: 'ITR aprobados', en: 'ITRs approved' },
  punchOpen:    { es: 'Punch abiertos', en: 'Open punch' },
  gates:        { es: 'Gates de readiness', en: 'Readiness gates' },
  gate:         { es: 'Gate', en: 'Gate' },
  status:       { es: 'Estado', en: 'Status' },
  approvedBy:   { es: 'Aprobó', en: 'Approved by' },
  signatures:   { es: 'Firmas', en: 'Signatures' },
  attest:       { es: 'Declaración', en: 'Attestation' },
  conditions:   { es: 'Condiciones', en: 'Conditions' },
  pssr:         { es: 'PSSR', en: 'PSSR' },
  number:       { es: 'Número', en: 'Number' },
  items:        { es: 'Ítems sí / NA / no', en: 'Items yes / NA / no' },
  procedures:   { es: 'Procedimientos', en: 'Procedures' },
  rev:          { es: 'Rev', en: 'Rev' },
  fieldVerif:   { es: 'Verificó en campo', en: 'Field verified' },
  lastRun:      { es: 'Última ejecución', en: 'Last run' },
  step:         { es: 'Paso', en: 'Step' },
  expected:     { es: 'Esperado', en: 'Expected' },
  actual:       { es: 'Real', en: 'Actual' },
  doneBy:       { es: 'Hecho por', en: 'Done by' },
  holdBy:       { es: 'Hold liberado por', en: 'Hold released by' },
  lineups:      { es: 'Line-ups verificados', en: 'Verified line-ups' },
  position:     { es: 'Posición requerida / encontrada', en: 'Required / found position' },
  verifiedBy:   { es: 'Verificó', en: 'Verified by' },
  events:       { es: 'Bitácora de arranque', en: 'Start-up log' },
  date:         { es: 'Fecha', en: 'Date' },
  event:        { es: 'Evento', en: 'Event' },
  witness:      { es: 'Testigo', en: 'Witness' },
  transfers:    { es: 'Traspasos de propiedad', en: 'Ownership transfers' },
  commissioning:{ es: 'Comisionamiento', en: 'Commissioning' },
  operations:   { es: 'Operaciones', en: 'Operations' },
  clientSig:    { es: 'Cliente', en: 'Client' },
  exceptions:   { es: 'Excepciones justificadas', en: 'Justified exceptions' },
  acked:        { es: 'Excepciones reconocidas', en: 'Exceptions acknowledged' },
  backdated:    { es: 'Registrado con atraso', en: 'Recorded late' },
  competencies: { es: 'Competencias del personal de operaciones', en: 'Operations staff competencies' },
  perShift:     { es: 'Personas por turno exigidas', en: 'Required per shift' },
  person:       { es: 'Persona', en: 'Person' },
  company:      { es: 'Empresa', en: 'Company' },
  shift:        { es: 'Turno', en: 'Shift' },
  level:        { es: 'Nivel', en: 'Level' },
  expires:      { es: 'Vence', en: 'Expires' },
  spares:       { es: 'Repuestos y herramientas críticas', en: 'Critical spares and tools' },
  item:         { es: 'Ítem', en: 'Item' },
  qty:          { es: 'Req. / disp.', en: 'Req. / avail.' },
  performance:  { es: 'Pruebas de desempeño', en: 'Performance tests' },
  test:         { es: 'Prueba', en: 'Test' },
  attempts:     { es: 'Intentos', en: 'Attempts' },
  ptc:          { es: 'Certificado (PTC)', en: 'Certificate (PTC)' },
  documents:    { es: 'Documentos vigentes', en: 'Current documents' },
  title2:       { es: 'Título', en: 'Title' },
  file:         { es: 'Archivo', en: 'File' },
  vendors:      { es: 'Paquetes de vendor', en: 'Vendor packages' },
  fatSat:       { es: 'FAT / SAT', en: 'FAT / SAT' },
  finalReport:  { es: 'Reporte final', en: 'Final report' },
  recs:         { es: 'Recomendaciones', en: 'Recommendations' },
  tags:         { es: 'Tags', en: 'Tags' },
  description:  { es: 'Descripción', en: 'Description' },
  maker:        { es: 'Fabricante / modelo', en: 'Make / model' },
  catB:         { es: 'Punch Cat B (transferibles a Operaciones)', en: 'Cat B punch (transferable to Operations)' },
  priority:     { es: 'Prioridad', en: 'Priority' },
  target:       { es: 'Fecha objetivo', en: 'Target date' },
  certificates: { es: 'Certificados', en: 'Certificates' },
  issued:       { es: 'Emitido', en: 'Issued' },
  annexes:      { es: 'Anexos incluidos en el ZIP', en: 'Annexes in the ZIP' },
  omitted:      { es: 'Anexos no incluidos', en: 'Annexes not included' },
  signature:    { es: 'Integridad y firma', en: 'Integrity and signature' },
  dataHash:     { es: 'sha256 de handover.json', en: 'handover.json sha256' },
  alg:          { es: 'Firma', en: 'Signature' },
  keyId:        { es: 'Clave pública', en: 'Public key' },
  verify:       { es: 'Verificar en', en: 'Verify at' },
  verifyNote:   {
    es: 'manifest.json lista el sha256 de cada archivo del ZIP (incluido este PDF) y manifest.sig es su firma Ed25519. Ver LEEME.txt.',
    en: 'manifest.json lists the sha256 of every file in the ZIP (this PDF included) and manifest.sig is its Ed25519 signature. See LEEME.txt.',
  },
  legacyNote:   { es: 'Paquete v2: firmado con HMAC, verificable solo por CommUp.', en: 'v2 package: HMAC-signed, verifiable by CommUp only.' },
  none:         { es: 'Sin registros.', en: 'No records.' },
  page:         { es: 'Página', en: 'Page' },
  yes:          { es: 'sí', en: 'yes' },
  critical:     { es: 'crítico', en: 'critical' },
}

export type HandoverPdfOptions = {
  lang?: Lang
  /** sha256 de handover.json (v3). */
  dataSha256: string
  keyId?: string | null
  verifyUrl?: string | null
  annexes?: string[]
  omitted?: { path: string; reason: string }[]
  /** Etiquetas del espacio `Startup` (etapas, capacidades); sin traductor se muestra el código. */
  label?: (key: string) => string
  /** E2: logos de la org y del cliente en la portada. */
  branding?: PdfBranding | null
}

export async function renderHandoverPdf(data: HandoverPackageData, opts: HandoverPdfOptions): Promise<Uint8Array> {
  const L = opts.lang ?? 'es'
  const pkg = data.handover_package
  const tz = pkg.project.timezone ?? 'UTC'
  const at = (iso: string | null | undefined) => (iso ? `${dateTimeIn(iso, tz)} ${zoneLabel(tz, new Date(iso))}` : '—')
  const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—')
  const label = (key: string, fallback: string) => {
    if (!opts.label) return fallback
    try { const v = opts.label(key); return v && v !== key ? v : fallback } catch { return fallback }
  }
  const stage = (s: string) => label(`ops.stage.${s}`, s)
  const cap = (c: string | null) => (c ? label(`capacity.${c}`, c) : '—')
  const signer = (s: HandoverSigner | null | undefined) =>
    s?.signed_at ? `${s.name ?? '—'}${s.company ? ` (${s.company})` : ''} · ${day(s.signed_at)}` : '—'
  const short = (h: string | null | undefined) => (h ? h.slice(0, 12) : '—')

  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${T.title[L]} — ${pkg.project.code}`))
  r.doc.setAuthor('CommUp')
  r.doc.setCreator(`CommUp Handover v${pkg.schema_version}`)
  r.setFooter(({ page, pageNum }) => {
    page.drawLine({ start: { x: MARGIN, y: MARGIN + FOOTER_H - 4 }, end: { x: A4_W - MARGIN, y: MARGIN + FOOTER_H - 4 }, thickness: 0.5, color: COLOR.borderLight })
    page.drawText(sanitize(`${pkg.project.code} · ${T.title[L]} v${pkg.schema_version} · sha256 ${opts.dataSha256.slice(0, 16)}`), { x: MARGIN, y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    const s = `${T.page[L]} ${pageNum} / `
    const totalX = A4_W - MARGIN - 12
    page.drawText(s, { x: totalX - r.fontRegular.widthOfTextAtSize(s, 7), y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    r.registerTotalPagesPlaceholder(page, totalX, MARGIN + 6, 7, COLOR.empty)
  })

  const table = (cols: TableCol[], rows: string[][]) => {
    if (!rows.length) { r.empty(T.none[L]); return }
    r.tableHeader(cols)
    rows.forEach((row, i) => r.tableRow(cols, row, { size: 7.5, alternate: i % 2 === 1 }))
  }
  const sub = (text: string) => {
    r.moveY(4)
    r.ensureSpace(24)
    r.drawText(text, { x: MARGIN, y: r.y - 9, size: 9, bold: true, color: COLOR.purple, maxWidth: CONTENT_W })
    r.moveY(13)
  }
  const note = (text: string) => {
    for (const l of wrapText(text, r.fontRegular, 7.5, CONTENT_W - 12)) {
      r.ensureSpace(10)
      r.drawText(l, { x: MARGIN + 12, y: r.y - 7.5, size: 7.5, color: COLOR.muted })
      r.moveY(10)
    }
  }

  // ── Portada ──
  r.newPage()
  r.topBar(COLOR.purple, 6)
  r.moveY(8)
  await drawBrandBar(r, opts.branding)
  r.badge(`v${pkg.schema_version}`, { x: A4_W - MARGIN - 40, y: r.y - 14, fg: COLOR.purple, bg: COLOR.purpleBg, size: 9 })
  r.drawText(`${T.title[L]} — ${pkg.project.code}`, { x: MARGIN, y: r.y - 14, size: 15, bold: true, maxWidth: CONTENT_W - 56 })
  r.moveY(20)
  r.kv(T.project[L], `${pkg.project.name}${pkg.project.org_name ? ` · ${pkg.project.org_name}` : ''}`)
  r.kv(T.client[L], pkg.project.client ?? '—')
  r.kv(T.location[L], pkg.project.location ?? '—')
  r.kv(T.generated[L], at(pkg.generated_at))
  r.kv(T.systems[L], pkg.systems.map(s => s.code).join(', ') || '—')
  r.moveY(6)
  r.infoCardRow([
    { label: T.systems[L], value: String(pkg.systems.length) },
    { label: T.tags[L], value: String(pkg.systems.reduce((a, s) => a + s.tag_count, 0)) },
    { label: T.itrApproved[L], value: `${pkg.systems.reduce((a, s) => a + s.itr_approved, 0)} / ${pkg.systems.reduce((a, s) => a + s.itr_count, 0)}` },
    { label: 'Punch A / B', value: `${pkg.systems.reduce((a, s) => a + s.punch_summary.cat_a_open, 0)} / ${pkg.systems.reduce((a, s) => a + s.punch_summary.cat_b_open, 0)}` },
    { label: T.certificates[L], value: String(pkg.certificates.length) },
  ])

  // ── Por sistema ──
  for (const sys of pkg.systems) {
    r.newPage()
    r.drawText(`${T.system[L]} ${sys.code} — ${sys.name}`, { x: MARGIN, y: r.y - 13, size: 13, bold: true, maxWidth: CONTENT_W })
    r.moveY(18)
    r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1, COLOR.text)
    r.moveY(6)
    if (sys.ownership) r.kv(T.stage[L], `${stage(sys.ownership.stage)} · ${at(sys.ownership.since)}`)
    r.kv(T.progress[L], `${sys.tag_count} · ${sys.itr_approved} / ${sys.itr_count} ${T.itrApproved[L].toLowerCase()}`)
    r.kv(T.punchOpen[L], `A ${sys.punch_summary.cat_a_open} · B ${sys.punch_summary.cat_b_open} · C ${sys.punch_summary.cat_c_open}`)

    if (sys.gates) {
      r.accentSection(T.gates[L])
      table(
        [{ w: 110, label: T.gate[L] }, { w: 85, label: T.status[L] }, { w: 150, label: T.approvedBy[L] }, { w: 178.28, label: T.signatures[L] }],
        sys.gates.map(g => [
          `${g.code} ${g.name}`, g.status,
          g.approval ? `${g.approval.approved_by ?? '—'}${g.approval.company ? ` (${g.approval.company})` : ''} · ${day(g.approval.approved_at)}` : '—',
          (g.approval?.signatures ?? []).map(s => `${cap(s.capacity)}: ${s.name ?? '—'}`).join(' · ') || '—',
        ]),
      )
      for (const g of sys.gates) {
        const conds = Array.isArray(g.approval?.conditions) ? (g.approval!.conditions as unknown[]) : []
        if (conds.length) note(`${g.code} · ${T.conditions[L]}: ${conds.map(c => (typeof c === 'string' ? c : (c as { text?: string })?.text ?? JSON.stringify(c))).join(' · ')}`)
        for (const a of g.attestations) note(`${g.code} · ${T.attest[L]} ${a.label ?? a.criterion}: ${a.comment} — ${a.by ?? '—'} ${day(a.at)}`)
      }
    }

    if (sys.pssr) {
      r.accentSection(T.pssr[L])
      table(
        [{ w: 95, label: T.number[L] }, { w: 70, label: T.status[L] }, { w: 85, label: T.items[L] }, { w: 120, label: T.approvedBy[L] }, { w: 153.28, label: T.signatures[L] }],
        sys.pssr.map(p => [
          p.review_number, p.status, `${p.items.yes} / ${p.items.na} / ${p.items.no}`,
          p.approved_by ? `${p.approved_by} · ${day(p.approved_at)}` : '—',
          p.signatures.map(s => `${cap(s.capacity)}: ${s.name ?? '—'}`).join(' · ') || '—',
        ]),
      )
    }

    if (sys.procedures) {
      r.accentSection(T.procedures[L])
      table(
        [{ w: 150, label: T.procedures[L] }, { w: 30, label: T.rev[L] }, { w: 110, label: T.approvedBy[L] }, { w: 110, label: T.fieldVerif[L] }, { w: 70, label: T.lastRun[L] }, { w: 53.28, label: 'sha256' }],
        sys.procedures.map(p => [
          `${p.number} ${p.title}`, p.revision ? `R${p.revision.rev}` : '—',
          p.revision?.approved_by ? `${p.revision.approved_by} · ${day(p.revision.approved_at)}` : '—',
          p.revision?.field_verified_by ? `${p.revision.field_verified_by} · ${day(p.revision.field_verified_at)}` : '—',
          p.last_run ? `${p.last_run.number} · ${day(p.last_run.completed_at)}` : '—',
          short(p.revision?.content_hash),
        ]),
      )
      for (const p of sys.procedures) {
        if (!p.last_run?.steps.length) continue
        sub(`${p.number} · ${p.last_run.number} — ${p.last_run.started_by ?? '—'} ${at(p.last_run.started_at)} → ${p.last_run.completed_by ?? '—'} ${at(p.last_run.completed_at)}`)
        table(
          [{ w: 28, label: '#' }, { w: 170, label: T.step[L] }, { w: 70, label: T.expected[L] }, { w: 65, label: T.actual[L] }, { w: 95, label: T.doneBy[L] }, { w: 95.28, label: T.holdBy[L] }],
          p.last_run.steps.map(s => [
            String(s.ord), `${s.hold ? '[HOLD] ' : ''}${s.action}`, s.expected ?? '', `${s.actual ?? (s.status === 'na' ? 'N/A' : '')}${s.out_of_range ? ' (!)' : ''}`,
            s.done_by ? `${s.done_by} ${day(s.done_at)}` : '—', s.released_by ? `${s.released_by} ${day(s.released_at)}` : (s.hold ? '—' : ''),
          ]),
        )
        for (const s of p.last_run.steps) {
          if (s.comment) note(`#${s.ord}: ${s.comment}`)
          if (s.release_comment) note(`#${s.ord} · ${T.holdBy[L]}: ${s.release_comment}`)
        }
        for (const ev of p.last_run.timeline ?? []) if (ev.kind !== 'started' && ev.kind !== 'completed') note(`${at(ev.at)} · ${label(`run.event.${ev.kind}`, ev.kind)} · ${ev.by ?? '—'}${ev.comment ? ` — ${ev.comment}` : ''}`)
      }
    }

    if (sys.lineups) {
      r.accentSection(T.lineups[L])
      if (!sys.lineups.length) r.empty(T.none[L])
      for (const ls of sys.lineups) {
        sub(`${ls.number} ${ls.title} — ${T.verifiedBy[L]} ${ls.verified_by ?? '—'} ${at(ls.verified_at)} · sha256 ${short(ls.content_hash)}`)
        table(
          [{ w: 28, label: '#' }, { w: 175, label: T.item[L] }, { w: 120, label: T.position[L] }, { w: 100, label: T.doneBy[L] }, { w: 100.28, label: T.verifiedBy[L] }],
          ls.items.map(i => [
            String(i.ord), `${i.tag ? `${i.tag} ` : ''}${i.label}${i.critical ? ` (${T.critical[L]})` : ''}`, `${i.required} / ${i.as_found ? `${i.as_found} → ` : ''}${i.found ?? '—'}${i.lock_number ? ` · ${i.lock_number}` : ''}${i.seal_number ? ` · ${i.seal_number}` : ''}`,
            i.set_by ? `${i.set_by} ${day(i.set_at)}` : '—', i.verified_by ? `${i.verified_by} ${day(i.verified_at)}` : '—',
          ]),
        )
      }
    }

    if (sys.startup_events) {
      r.accentSection(T.events[L])
      table(
        [{ w: 70, label: T.number[L] }, { w: 105, label: T.date[L] }, { w: 190, label: T.event[L] }, { w: 158.28, label: T.witness[L] }],
        sys.startup_events.map(e => [
          e.number, at(e.occurred_at), `${e.milestone ? `${label(`milestone.${e.milestone}`, e.milestone)}: ` : ''}${e.title}`,
          e.witness_by ? `${cap(e.witness_capacity)}: ${e.witness_by} · ${day(e.witness_at)}` : (e.witness_capacity ? `${cap(e.witness_capacity)}: —` : '—'),
        ]),
      )
      for (const e of sys.startup_events) {
        if (e.backdate_reason) note(`${e.number} · ${T.backdated[L]}: ${e.backdate_reason}`)
        if (e.params.length) note(`${e.number}: ${e.params.map(p => `${p.label} ${p.value ?? p.value_text ?? '—'}${p.unit ? ` ${p.unit}` : ''}`).join(' · ')}`)
      }
    }

    if (sys.transfers) {
      r.accentSection(T.transfers[L])
      table(
        [{ w: 70, label: T.number[L] }, { w: 130, label: T.stage[L] }, { w: 160, label: T.commissioning[L] }, { w: 163.28, label: T.operations[L] }],
        sys.transfers.map(tr => [
          tr.number, `${stage(tr.from_stage)} → ${stage(tr.to_stage)}${tr.is_reversal ? ' (rev.)' : ''}`, signer(tr.commissioning), signer(tr.operations),
        ]),
      )
      for (const tr of sys.transfers) {
        if (tr.exceptions?.length) note(`${tr.number} · ${T.exceptions[L]}: ${tr.exceptions.map(x => `${label(`ops.check.${x.key}`, x.key)} — ${x.justification}`).join(' · ')}`)
        if (tr.commissioning_ack?.length || tr.operations_ack?.length) note(`${tr.number} · ${T.acked[L]}: ${T.commissioning[L]} ${tr.commissioning_ack?.length ?? 0} · ${T.operations[L]} ${tr.operations_ack?.length ?? 0}`)
        if (tr.content_hash) note(`${tr.number} · sha256 ${tr.content_hash}`)
      }
    }

    if (sys.competencies) {
      r.accentSection(T.competencies[L])
      r.kv(T.perShift[L], String(sys.competencies.required_per_shift), { keyW: 170 })
      table(
        [{ w: 150, label: T.person[L] }, { w: 130, label: T.company[L] }, { w: 70, label: T.shift[L] }, { w: 60, label: T.level[L] }, { w: 113.28, label: T.expires[L] }],
        sys.competencies.personnel.map(p => [p.name, p.company ?? '—', p.shift ?? '—', String(p.level), day(p.expires_at)]),
      )
    }

    if (sys.spares) {
      r.accentSection(T.spares[L])
      table(
        [{ w: 190, label: T.item[L] }, { w: 95, label: 'P/N' }, { w: 70, label: 'Tag' }, { w: 70, label: T.qty[L] }, { w: 98.28, label: T.status[L] }],
        sys.spares.map(s => [`${s.item}${s.critical ? ` (${T.critical[L]})` : ''}`, s.part_number ?? '—', s.tag ?? '—', `${s.qty_required} / ${s.qty_available}`, `${s.status}${s.eta ? ` · ${s.eta}` : ''}`]),
      )
    }

    if (sys.performance) {
      r.accentSection(T.performance[L])
      table(
        [{ w: 150, label: T.test[L] }, { w: 40, label: T.rev[L] }, { w: 130, label: T.attempts[L] }, { w: 203.28, label: T.ptc[L] }],
        sys.performance.map(p => [
          `${p.number} ${p.title}`, p.revision ? `R${p.revision.rev}` : '—',
          p.runs.map(x => `${x.number}: ${x.result ? label(`perf.result.${x.result}`, x.result) : x.status}`).join(' · ') || '—',
          p.certificates.map(c => `${c.number} ${label(`perf.certStatus.${c.status}`, c.status)}`).join(' · ') || '—',
        ]),
      )
      for (const p of sys.performance) for (const c of p.certificates) {
        note(`${c.number} · ${T.commissioning[L]}: ${signer(c.commissioning)} · ${T.operations[L]}: ${signer(c.operations)} · ${T.clientSig[L]}: ${signer(c.client)}${c.content_hash ? ` · sha256 ${short(c.content_hash)}` : ''}`)
      }
    }

    if (sys.documents) {
      r.accentSection(T.documents[L])
      table(
        [{ w: 110, label: T.number[L] }, { w: 205, label: T.title2[L] }, { w: 40, label: T.rev[L] }, { w: 60, label: T.status[L] }, { w: 108.28, label: T.file[L] }],
        sys.documents.map(d => [d.number, d.title, d.revision?.rev ?? '—', d.revision?.status ?? '—', d.revision?.file_name ?? (d.revision?.external_url ? 'URL' : '—')]),
      )
    }

    if (sys.vendors) {
      r.accentSection(T.vendors[L])
      table(
        [{ w: 70, label: T.number[L] }, { w: 120, label: T.company[L] }, { w: 70, label: T.status[L] }, { w: 130, label: T.fatSat[L] }, { w: 133.28, label: T.finalReport[L] }],
        sys.vendors.map(v => [
          v.number, v.company ?? '—', v.status,
          v.activities.map(a => `${a.kind.toUpperCase()} ${a.result}${a.findings ? ` (${a.findings})` : ''}`).join(' · ') || '—',
          v.final_report ? `${v.final_report.issued_by ?? '—'} · ${day(v.final_report.issued_at)}` : '—',
        ]),
      )
      for (const v of sys.vendors) {
        if (v.recommendations.length) note(`${v.number} · ${T.recs[L]}: ${v.recommendations.map(x => `#${x.seq} ${x.status}${x.moc_reference ? ` MOC ${x.moc_reference}` : ''}`).join(' · ')}`)
      }
    }

    if (sys.tags.length) {
      r.accentSection(T.tags[L])
      table(
        [{ w: 95, label: 'Tag' }, { w: 200, label: T.description[L] }, { w: 85, label: T.maker[L] }, { w: 70, label: 'S/N' }, { w: 73.28, label: T.status[L] }],
        sys.tags.map(t => [t.tag_number, t.description ?? '', [t.manufacturer, t.model].filter(Boolean).join(' ') || '—', t.serial_number ?? '—', t.status]),
      )
    }
  }

  // ── Punch Cat B y certificados ──
  r.newPage()
  r.accentSection(T.catB[L])
  table(
    [{ w: 80, label: T.number[L] }, { w: 255, label: T.description[L] }, { w: 60, label: T.priority[L] }, { w: 60, label: T.status[L] }, { w: 68.28, label: T.target[L] }],
    pkg.punch_items.map(p => [p.punch_number, p.description ?? '', p.priority ?? '', p.status, p.target_date ?? '—']),
  )
  r.accentSection(T.certificates[L])
  table(
    [{ w: 100, label: T.number[L] }, { w: 170, label: T.title2[L] }, { w: 60, label: T.status[L] }, { w: 60, label: T.issued[L] }, { w: 133.28, label: T.signatures[L] }],
    pkg.certificates.map(c => [c.certificate_number, c.title ?? '', c.status, c.issued_date ?? '—', (c.signatures ?? []).map(s => `${s.role}: ${s.name ?? '—'}`).join(' · ') || '—']),
  )

  // ── Anexos y firma ──
  if (opts.annexes) {
    r.accentSection(T.annexes[L])
    if (!opts.annexes.length) r.empty(T.none[L])
    for (const a of opts.annexes) note(a)
  }
  if (opts.omitted?.length) {
    r.accentSection(T.omitted[L], COLOR.amber)
    for (const o of opts.omitted) note(`${o.path} — ${o.reason}`)
  }
  r.accentSection(T.signature[L])
  if (opts.keyId) {
    r.kv(T.dataHash[L], opts.dataSha256, { keyW: 130, size: 8 })
    r.kv(T.alg[L], 'Ed25519 (manifest.json → manifest.sig)', { keyW: 130, size: 8 })
    r.kv(T.keyId[L], opts.keyId, { keyW: 130, size: 8 })
    if (opts.verifyUrl) r.kv(T.verify[L], opts.verifyUrl, { keyW: 130, size: 8 })
    r.moveY(2)
    r.paragraph(T.verifyNote[L], { size: 8, color: COLOR.muted })
  } else {
    r.kv('HMAC-SHA256', opts.dataSha256, { keyW: 130, size: 8 })
    r.paragraph(T.legacyNote[L], { size: 8, color: COLOR.muted })
  }

  r.finalizePagePlaceholders()
  return await r.doc.save()
}
